import type { RatioConfig, ModelPrice } from '@newapi-sync/shared';

/**
 * Reference models with known official prices for base price detection
 * These models are commonly available and have stable pricing
 */
const REFERENCE_MODELS = [
  { modelId: 'gpt-3.5-turbo', inputPrice: 0.5, outputPrice: 1.5 },
  { modelId: 'gpt-4o-mini', inputPrice: 0.15, outputPrice: 0.6 },
  { modelId: 'gpt-4o', inputPrice: 2.5, outputPrice: 10 },
  { modelId: 'claude-3-5-sonnet-20241022', inputPrice: 3, outputPrice: 15 },
  { modelId: 'claude-3-haiku-20240307', inputPrice: 0.25, outputPrice: 1.25 },
];

/**
 * Detect the base price used by a New API instance
 * by comparing known model prices with their ratios
 * 
 * @param ratioConfig - The ratio configuration from the instance
 * @param upstreamPrices - Optional upstream price data for additional reference
 * @returns Detected base price in USD/1M tokens, or null if detection failed
 */
export function detectBasePrice(
  ratioConfig: RatioConfig,
  upstreamPrices?: ModelPrice[]
): number | null {
  const detectedPrices: number[] = [];

  // Try to detect using reference models
  for (const ref of REFERENCE_MODELS) {
    const ratio = ratioConfig.modelRatio[ref.modelId];
    if (ratio && ratio > 0) {
      // basePrice = actualPrice / ratio
      const detectedPrice = ref.inputPrice / ratio;
      detectedPrices.push(detectedPrice);
      console.log(`[BasePrice Detection] ${ref.modelId}: ratio=${ratio}, actualPrice=$${ref.inputPrice}, detected basePrice=$${detectedPrice.toFixed(4)}`);
    }
  }

  // Try to detect using upstream prices if available
  if (upstreamPrices && upstreamPrices.length > 0) {
    for (const price of upstreamPrices) {
      if (price.pricingType === 'per_request') continue; // Skip per-request models
      
      const ratio = ratioConfig.modelRatio[price.modelId];
      if (ratio && ratio > 0 && price.inputPricePerMillion > 0) {
        const detectedPrice = price.inputPricePerMillion / ratio;
        detectedPrices.push(detectedPrice);
        console.log(`[BasePrice Detection] ${price.modelId}: ratio=${ratio}, actualPrice=$${price.inputPricePerMillion}, detected basePrice=$${detectedPrice.toFixed(4)}`);
      }
    }
  }

  if (detectedPrices.length === 0) {
    console.log('[BasePrice Detection] No reference models found, cannot detect base price');
    return null;
  }

  // Calculate median to avoid outliers
  detectedPrices.sort((a, b) => a - b);
  const median = detectedPrices.length % 2 === 0
    ? (detectedPrices[detectedPrices.length / 2 - 1] + detectedPrices[detectedPrices.length / 2]) / 2
    : detectedPrices[Math.floor(detectedPrices.length / 2)];

  console.log(`[BasePrice Detection] Detected ${detectedPrices.length} samples, median basePrice=$${median.toFixed(4)}`);
  console.log(`[BasePrice Detection] All samples:`, detectedPrices.map(p => p.toFixed(4)));

  // Round to 2 decimal places for cleaner values
  return Math.round(median * 100) / 100;
}

/**
 * Calculate actual price from ratio using detected base price
 */
export function calculatePrice(
  modelRatio: number,
  completionRatio: number,
  basePrice: number
): { inputPrice: number; outputPrice: number } {
  const inputPrice = modelRatio * basePrice;
  const outputPrice = inputPrice * completionRatio;
  return { inputPrice, outputPrice };
}
