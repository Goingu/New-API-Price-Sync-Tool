/**
 * Suggestion Engine - Generate intelligent split suggestions based on price data
 */

import type { Channel, RatioConfig, SplitSuggestion } from '@newapi-sync/shared';
import { calculateEffectiveUnitCost } from './priorityEngine.js';

/**
 * Parse a channel's models field into an array of model IDs
 */
function parseChannelModels(channel: Channel): string[] {
  if (!channel.models || channel.models.trim() === '') return [];
  
  try {
    // Try parsing as JSON array first
    const parsed = JSON.parse(channel.models);
    if (Array.isArray(parsed)) {
      return parsed.filter(m => typeof m === 'string' && m.trim().length > 0);
    }
  } catch {
    // Fall back to comma-separated parsing
  }
  
  return channel.models
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0);
}

/**
 * Calculate the cost variance for a model across different channels
 * Returns the coefficient of variation (std dev / mean)
 */
function calculateCostVariance(costs: number[]): number {
  if (costs.length <= 1) return 0;
  
  const mean = costs.reduce((sum, c) => sum + c, 0) / costs.length;
  const variance = costs.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / costs.length;
  const stdDev = Math.sqrt(variance);
  
  return mean > 0 ? stdDev / mean : 0;
}

/**
 * Calculate potential cost savings from splitting a channel
 * Compares current unified priority vs optimal per-model priority
 */
function estimateCostSaving(
  models: string[],
  ratioConfig: RatioConfig,
  priceRates: Map<number, number>,
  channelId: number,
): number {
  const priceRate = priceRates.get(channelId);
  if (!priceRate) return 0;
  
  let totalVariance = 0;
  let modelCount = 0;
  
  for (const modelId of models) {
    const modelRatio = ratioConfig.modelRatio[modelId];
    if (modelRatio === undefined) continue;
    
    // Calculate this model's cost on this channel
    const cost = calculateEffectiveUnitCost(modelRatio, priceRate);
    
    // Find costs for this model on other channels
    const otherCosts: number[] = [];
    for (const [otherId, otherRate] of priceRates) {
      if (otherId !== channelId) {
        otherCosts.push(calculateEffectiveUnitCost(modelRatio, otherRate));
      }
    }
    
    if (otherCosts.length > 0) {
      otherCosts.push(cost);
      const variance = calculateCostVariance(otherCosts);
      totalVariance += variance;
      modelCount++;
    }
  }
  
  return modelCount > 0 ? (totalVariance / modelCount) * 100 : 0;
}

/**
 * Identify models with significant price differences across channels
 * Returns models where the price difference exceeds the threshold
 */
function identifyHighVarianceModels(
  models: string[],
  ratioConfig: RatioConfig,
  priceRates: Map<number, number>,
  threshold: number = 0.2, // 20% difference
): string[] {
  const highVarianceModels: string[] = [];
  
  for (const modelId of models) {
    const modelRatio = ratioConfig.modelRatio[modelId];
    if (modelRatio === undefined) continue;
    
    // Calculate costs across all channels
    const costs: number[] = [];
    for (const priceRate of priceRates.values()) {
      costs.push(calculateEffectiveUnitCost(modelRatio, priceRate));
    }
    
    if (costs.length < 2) continue;
    
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const difference = (maxCost - minCost) / minCost;
    
    if (difference > threshold) {
      highVarianceModels.push(modelId);
    }
  }
  
  return highVarianceModels;
}

/**
 * Generate split suggestions for channels based on price data
 * Analyzes all channels and identifies those that would benefit from splitting
 * 
 * @param channels - All available channels
 * @param ratioConfig - Model ratio configuration
 * @param priceRates - Map of channel ID to price rate
 * @returns Array of split suggestions, sorted by potential cost saving
 */
export function generateSplitSuggestions(
  channels: Channel[],
  ratioConfig: RatioConfig,
  priceRates: Map<number, number>,
): SplitSuggestion[] {
  const suggestions: SplitSuggestion[] = [];
  
  for (const channel of channels) {
    // Skip channels without price rate configuration
    if (!priceRates.has(channel.id)) continue;
    
    const models = parseChannelModels(channel);
    
    // Skip single-model channels
    if (models.length <= 1) continue;
    
    // Identify high-variance models (price difference > 20%)
    const highVarianceModels = identifyHighVarianceModels(
      models,
      ratioConfig,
      priceRates,
      0.2
    );
    
    // Skip if no high-variance models
    if (highVarianceModels.length === 0) continue;
    
    // Estimate cost saving
    const estimatedSaving = estimateCostSaving(
      models,
      ratioConfig,
      priceRates,
      channel.id
    );
    
    // Determine priority based on saving percentage
    let priority: 'high' | 'medium' | 'low' = 'low';
    if (estimatedSaving > 15) {
      priority = 'high';
    } else if (estimatedSaving > 5) {
      priority = 'medium';
    }
    
    // Generate reason
    const reason = highVarianceModels.length === models.length
      ? `All ${models.length} models show significant price differences across channels`
      : `${highVarianceModels.length} of ${models.length} models show significant price differences (>20%)`;
    
    suggestions.push({
      channelId: channel.id,
      channelName: channel.name,
      modelCount: models.length,
      suggestedModels: highVarianceModels,
      estimatedCostSaving: Math.round(estimatedSaving * 10) / 10, // Round to 1 decimal
      reason,
      priority,
    });
  }
  
  // Sort by estimated cost saving (descending)
  suggestions.sort((a, b) => b.estimatedCostSaving - a.estimatedCostSaving);
  
  return suggestions;
}
