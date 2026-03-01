import type { RatioConfig, RatioResult, ComparisonRow } from '@newapi-sync/shared';

/**
 * Infer provider from model ID when not available from upstream data.
 * This helps identify removed/custom models.
 */
function inferProviderFromModelId(modelId: string): string {
  const lower = modelId.toLowerCase();

  // Common patterns
  if (lower.includes('gpt') || lower.includes('chatgpt') || lower.includes('o1')) return 'OpenAI';
  if (lower.includes('claude')) return 'Anthropic';
  if (lower.includes('deepseek')) return 'DeepSeek';
  if (lower.includes('gemini') || lower.includes('palm')) return 'Google';
  if (lower.includes('360')) return '360';
  if (lower.includes('qwen') || lower.includes('千问')) return '通义千问';
  if (lower.includes('moonshot') || lower.includes('kimi')) return 'Kimi';
  if (lower.includes('glm') || lower.includes('zhipu')) return '智谱AI';
  if (lower.includes('ernie') || lower.includes('文心')) return '文心一言';
  if (lower.includes('spark') || lower.includes('讯飞')) return '讯飞星火';
  if (lower.includes('doubao') || lower.includes('豆包')) return '豆包';
  if (lower.includes('mistral')) return 'Mistral';
  if (lower.includes('llama')) return 'Meta';
  if (lower.includes('mixtral')) return 'Mistral';
  if (lower.includes('yi-')) return '零一万物';

  return '未知厂商';
}

/**
 * Compare current ratio config with upstream ratio results.
 * Produces a ComparisonRow for every model in the union of both sets.
 */
export function compareRatios(
  current: RatioConfig,
  upstream: RatioResult[],
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const upstreamMap = new Map<string, RatioResult>();

  for (const u of upstream) {
    upstreamMap.set(u.modelId, u);
  }

  const currentModelPrice = current.modelPrice ?? {};

  const allModelIds = new Set<string>([
    ...Object.keys(current.modelRatio),
    ...Object.keys(currentModelPrice),
    ...upstreamMap.keys(),
  ]);

  for (const modelId of allModelIds) {
    const hasCurrentRatio = modelId in current.modelRatio;
    const hasCurrentPrice = modelId in currentModelPrice;
    const upstreamEntry = upstreamMap.get(modelId);

    // --- Per-request upstream model ---
    if (upstreamEntry?.pricingType === 'per_request') {
      const currentPrice = hasCurrentPrice ? currentModelPrice[modelId] : undefined;
      const newPrice = upstreamEntry.pricePerRequest ?? 0;

      let status: ComparisonRow['status'];
      let ratioDiffPercent: number | undefined;

      if (currentPrice !== undefined) {
        ratioDiffPercent = currentPrice === 0 ? 0 : ((newPrice - currentPrice) / currentPrice) * 100;
        if (newPrice === currentPrice) {
          status = 'unchanged';
        } else if (newPrice > currentPrice) {
          status = 'increased';
        } else {
          status = 'decreased';
        }
      } else {
        status = 'new';
      }

      rows.push({
        modelId,
        provider: upstreamEntry.provider || '',
        pricingType: 'per_request',
        currentPrice,
        newPrice,
        ratioDiffPercent,
        status,
        selected: false,
      });
      continue;
    }

    // --- Per-token logic (existing behavior) ---
    if (hasCurrentRatio && upstreamEntry) {
      // Both sides have this model
      const currentRatio = current.modelRatio[modelId];
      const currentCompletionRatio = current.completionRatio[modelId] ?? 1;
      const newRatio = upstreamEntry.modelRatio;
      const newCompletionRatio = upstreamEntry.completionRatio;

      const ratioDiffPercent =
        currentRatio === 0 ? 0 : ((newRatio - currentRatio) / currentRatio) * 100;

      let status: ComparisonRow['status'];
      if (newRatio === currentRatio) {
        status = 'unchanged';
      } else if (newRatio > currentRatio) {
        status = 'increased';
      } else {
        status = 'decreased';
      }

      rows.push({
        modelId,
        provider: upstreamEntry.provider || '',
        pricingType: 'per_token',
        currentRatio,
        currentCompletionRatio,
        newRatio,
        newCompletionRatio,
        suggestedRatio: newRatio,
        suggestedCompletionRatio: newCompletionRatio,
        ratioDiffPercent,
        status,
        selected: false,
      });
    } else if (upstreamEntry && !hasCurrentRatio) {
      // Only upstream has this model → new per-token
      rows.push({
        modelId,
        provider: upstreamEntry.provider || '',
        pricingType: 'per_token',
        newRatio: upstreamEntry.modelRatio,
        newCompletionRatio: upstreamEntry.completionRatio,
        suggestedRatio: upstreamEntry.modelRatio,
        suggestedCompletionRatio: upstreamEntry.completionRatio,
        status: 'new',
        selected: false,
      });
    } else if (hasCurrentRatio) {
      // Only current has this model in modelRatio → removed per-token
      const inferredProvider = inferProviderFromModelId(modelId);
      rows.push({
        modelId,
        provider: inferredProvider,
        pricingType: 'per_token',
        currentRatio: current.modelRatio[modelId],
        currentCompletionRatio: current.completionRatio[modelId] ?? 1,
        status: 'removed',
        selected: false,
      });
    } else if (hasCurrentPrice) {
      // Only current has this model in modelPrice → removed per-request
      const inferredProvider = inferProviderFromModelId(modelId);
      rows.push({
        modelId,
        provider: inferredProvider,
        pricingType: 'per_request',
        currentPrice: currentModelPrice[modelId],
        status: 'removed',
        selected: false,
      });
    }
  }

  return rows;
}

