import type { ModelPrice, RatioResult } from '@newapi-sync/shared';

/** Base input price: GPT-3.5-turbo at $0.75/1M tokens */
const BASE_INPUT_PRICE = 0.75;

/** Round a number to at most 6 decimal places */
function roundTo6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Convert a ModelPrice to New API ratio format.
 * - modelRatio = inputPricePerMillion / BASE_INPUT_PRICE
 * - completionRatio = outputPricePerMillion / inputPricePerMillion
 */
export function convert(price: ModelPrice, provider?: string): RatioResult {
  const modelRatio = roundTo6(price.inputPricePerMillion / BASE_INPUT_PRICE);
  const completionRatio = roundTo6(price.outputPricePerMillion / price.inputPricePerMillion);

  return {
    modelId: price.modelId,
    provider,
    modelRatio,
    completionRatio,
  };
}

/** Convert a batch of ModelPrice entries to RatioResult[]. */
export function convertBatch(prices: ModelPrice[], provider?: string): RatioResult[] {
  return prices.map((p) => convert(p, provider));
}

/**
 * Reverse conversion: ratios back to USD/1M tokens prices.
 * - inputPricePerMillion = modelRatio * BASE_INPUT_PRICE
 * - outputPricePerMillion = modelRatio * BASE_INPUT_PRICE * completionRatio
 */
export function ratioToPrice(
  modelRatio: number,
  completionRatio: number,
): { inputPricePerMillion: number; outputPricePerMillion: number } {
  const inputPricePerMillion = roundTo6(modelRatio * BASE_INPUT_PRICE);
  const outputPricePerMillion = roundTo6(modelRatio * BASE_INPUT_PRICE * completionRatio);

  return { inputPricePerMillion, outputPricePerMillion };
}

export { BASE_INPUT_PRICE };
