import type {
  Channel,
  RatioConfig,
  PriorityRule,
  ModelGroupEntry,
  PriorityAssignment,
  ChannelPriorityResult,
  PriorityCalculationResult,
} from '@newapi-sync/shared';

/**
 * Calculate the effective unit cost for a model on a channel.
 * Formula: modelRatio × (1 / channelPriceRate)
 */
export function calculateEffectiveUnitCost(
  modelRatio: number,
  channelPriceRate: number,
): number {
  return modelRatio * (1 / channelPriceRate);
}

/**
 * Parse a channel's models field into an array of model IDs,
 * applying model_mapping where applicable.
 * Returns the actual model IDs (after mapping) for ratio lookup.
 */
function parseChannelModelIds(channel: Channel): string[] {
  if (!channel.models || channel.models.trim() === '') return [];

  let mapping: Record<string, string> = {};
  if (channel.model_mapping && channel.model_mapping.trim() !== '') {
    try {
      const parsed = JSON.parse(channel.model_mapping);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        mapping = parsed;
      }
    } catch {
      // Invalid JSON — skip mapping
    }
  }

  return channel.models
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .map((originalId) => mapping[originalId] ?? originalId);
}

/**
 * Group channels by model, returning only channels that have both:
 * - A configured price rate in the priceRates map
 * - A model ratio in ratioConfig.modelRatio for the given model
 */
export function groupChannelsByModel(
  channels: Channel[],
  priceRates: Map<number, number>,
): Map<string, ModelGroupEntry[]> {
  const groups = new Map<string, ModelGroupEntry[]>();

  for (const channel of channels) {
    const priceRate = priceRates.get(channel.id);
    if (priceRate === undefined) continue;

    const modelIds = parseChannelModelIds(channel);
    for (const modelId of modelIds) {
      const entry: ModelGroupEntry = {
        channelId: channel.id,
        channelName: channel.name,
        modelId,
        modelRatio: 0, // placeholder — filled by calculatePriorities
        priceRate,
        effectiveUnitCost: 0, // placeholder
        currentPriority: channel.priority,
      };

      let group = groups.get(modelId);
      if (!group) {
        group = [];
        groups.set(modelId, group);
      }
      group.push(entry);
    }
  }

  return groups;
}

/**
 * Sort a single model group by effective unit cost (ascending) and assign
 * priority values. Equal-cost channels maintain their original priority order
 * (stable sort: higher currentPriority first as tiebreaker).
 *
 * Priority = max(startValue - i * step, 1) for i = 0..N-1
 */
export function assignPrioritiesForGroup(
  group: ModelGroupEntry[],
  rule: PriorityRule,
): PriorityAssignment[] {
  // Sort: primary by effectiveUnitCost ascending, secondary by currentPriority descending
  const sorted = [...group].sort((a, b) => {
    const costDiff = a.effectiveUnitCost - b.effectiveUnitCost;
    if (costDiff !== 0) return costDiff;
    return b.currentPriority - a.currentPriority;
  });

  return sorted.map((entry, i) => ({
    channelId: entry.channelId,
    channelName: entry.channelName,
    modelId: entry.modelId,
    effectiveUnitCost: entry.effectiveUnitCost,
    assignedPriority: Math.max(rule.startValue - i * rule.step, 1),
  }));
}

/**
 * Aggregate priority assignments across all model groups.
 * For each unique channel, take the average assigned priority value (rounded).
 */
export function aggregateChannelPriorities(
  allAssignments: Map<string, PriorityAssignment[]>,
): ChannelPriorityResult[] {
  // channelId -> aggregated data
  const channelMap = new Map<
    number,
    {
      channelName: string;
      oldPriority: number;
      prioritySum: number;
      priorityCount: number;
      priceRate: number;
      modelDetails: ChannelPriorityResult['modelDetails'];
    }
  >();

  for (const [, assignments] of allAssignments) {
    for (const a of assignments) {
      const existing = channelMap.get(a.channelId);
      const detail = {
        modelId: a.modelId,
        modelRatio: 0, // will be enriched by calculatePriorities
        effectiveUnitCost: a.effectiveUnitCost,
        assignedPriority: a.assignedPriority,
      };

      if (!existing) {
        channelMap.set(a.channelId, {
          channelName: a.channelName,
          oldPriority: 0,
          prioritySum: a.assignedPriority,
          priorityCount: 1,
          priceRate: 0,
          modelDetails: [detail],
        });
      } else {
        existing.prioritySum += a.assignedPriority;
        existing.priorityCount += 1;
        existing.modelDetails.push(detail);
      }
    }
  }

  const results: ChannelPriorityResult[] = [];
  for (const [channelId, data] of channelMap) {
    const avgPriority = Math.round(data.prioritySum / data.priorityCount);
    results.push({
      channelId,
      channelName: data.channelName,
      oldPriority: data.oldPriority,
      newPriority: Math.max(avgPriority, 1),
      priceRate: data.priceRate,
      modelDetails: data.modelDetails,
      changed: avgPriority !== data.oldPriority,
    });
  }

  return results;
}


/**
 * Full priority calculation pipeline:
 * 1. Group channels by model (only those with configured price rates)
 * 2. For each model group, compute effective unit cost and assign priorities
 * 3. Aggregate across all model groups, taking average priority per channel
 */
export function calculatePriorities(
  channels: Channel[],
  ratioConfig: RatioConfig,
  priceRates: Map<number, number>,
  rule: PriorityRule,
): PriorityCalculationResult {
  // Step 1: Group channels by model
  const groups = groupChannelsByModel(channels, priceRates);

  // Build channel lookup for oldPriority and priceRate
  const channelLookup = new Map<number, Channel>();
  for (const ch of channels) {
    channelLookup.set(ch.id, ch);
  }

  // Step 2: For each model group, fill in modelRatio + effectiveUnitCost, then assign priorities
  const allAssignments = new Map<string, PriorityAssignment[]>();

  for (const [modelId, group] of groups) {
    const modelRatio = ratioConfig.modelRatio[modelId];
    if (modelRatio === undefined) continue; // skip models without a ratio

    // Enrich entries with modelRatio and effectiveUnitCost
    for (const entry of group) {
      entry.modelRatio = modelRatio;
      entry.effectiveUnitCost = calculateEffectiveUnitCost(modelRatio, entry.priceRate);
    }

    const assignments = assignPrioritiesForGroup(group, rule);
    allAssignments.set(modelId, assignments);
  }

  // Step 3: Aggregate
  const aggregated = aggregateChannelPriorities(allAssignments);

  // Enrich aggregated results with oldPriority, priceRate, and modelRatio details
  for (const result of aggregated) {
    const channel = channelLookup.get(result.channelId);
    if (channel) {
      result.oldPriority = channel.priority;
      result.changed = result.newPriority !== result.oldPriority;
    }
    const rate = priceRates.get(result.channelId);
    if (rate !== undefined) {
      result.priceRate = rate;
    }
    // Enrich modelRatio in modelDetails
    for (const detail of result.modelDetails) {
      const ratio = ratioConfig.modelRatio[detail.modelId];
      if (ratio !== undefined) {
        detail.modelRatio = ratio;
      }
    }
  }

  // Count skipped channels (those without a configured price rate)
  const configuredChannelIds = new Set(aggregated.map((r) => r.channelId));
  const skippedChannels = channels.filter((ch) => !configuredChannelIds.has(ch.id)).length;

  return {
    channels: aggregated,
    totalChannels: channels.length,
    changedChannels: aggregated.filter((r) => r.changed).length,
    skippedChannels,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate priorities for split sub-channels.
 * This is a specialized version that works with sub-channel previews.
 * 
 * @param subChannels - Array of sub-channel previews
 * @param ratioConfig - Model ratio configuration
 * @param priceRates - Map of channel ID to price rate (for parent channels)
 * @param parentPriceRate - Default price rate to use if parent not in priceRates map
 * @param rule - Priority rule (start value and step)
 * @returns Map of sub-channel name to suggested priority
 */
export function calculateSplitPriorities(
  subChannels: Array<{
    name: string;
    modelId: string;
    parentChannelId: number;
    parentChannelName: string;
  }>,
  ratioConfig: RatioConfig,
  priceRates: Map<number, number>,
  parentPriceRate: number | undefined,
  rule: PriorityRule,
): Map<string, number> {
  const result = new Map<string, number>();
  
  // Group sub-channels by model
  const modelGroups = new Map<string, typeof subChannels>();
  for (const subChannel of subChannels) {
    let group = modelGroups.get(subChannel.modelId);
    if (!group) {
      group = [];
      modelGroups.set(subChannel.modelId, group);
    }
    group.push(subChannel);
  }
  
  // For each model group, calculate priorities
  for (const [modelId, group] of modelGroups) {
    const modelRatio = ratioConfig.modelRatio[modelId];
    if (modelRatio === undefined) {
      // No ratio available, use parent priority (will be set by caller)
      continue;
    }
    
    // Calculate effective unit cost for each sub-channel
    const entries = group.map(subChannel => {
      const priceRate = priceRates.get(subChannel.parentChannelId) ?? parentPriceRate;
      if (priceRate === undefined) {
        return null;
      }
      
      return {
        name: subChannel.name,
        modelId: subChannel.modelId,
        effectiveUnitCost: calculateEffectiveUnitCost(modelRatio, priceRate),
      };
    }).filter((e): e is NonNullable<typeof e> => e !== null);
    
    // Sort by effective unit cost (ascending)
    entries.sort((a, b) => a.effectiveUnitCost - b.effectiveUnitCost);
    
    // Assign priorities
    entries.forEach((entry, index) => {
      const priority = Math.max(rule.startValue - index * rule.step, 1);
      result.set(entry.name, priority);
    });
  }
  
  return result;
}
