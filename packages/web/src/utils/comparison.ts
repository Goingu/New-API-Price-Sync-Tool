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

  const allModelIds = new Set<string>([
    ...Object.keys(current.modelRatio),
    ...upstreamMap.keys(),
  ]);

  for (const modelId of allModelIds) {
    const hasCurrent = modelId in current.modelRatio;
    const upstreamEntry = upstreamMap.get(modelId);

    if (hasCurrent && upstreamEntry) {
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
        currentRatio,
        currentCompletionRatio,
        newRatio,
        newCompletionRatio,
        ratioDiffPercent,
        status,
        selected: false,
      });
    } else if (upstreamEntry && !hasCurrent) {
      // Only upstream has this model → new
      rows.push({
        modelId,
        provider: upstreamEntry.provider || '',
        newRatio: upstreamEntry.modelRatio,
        newCompletionRatio: upstreamEntry.completionRatio,
        status: 'new',
        selected: false,
      });
    } else {
      // Only current has this model → removed
      // Infer provider from model name since it's not in upstream data
      const inferredProvider = inferProviderFromModelId(modelId);
      rows.push({
        modelId,
        provider: inferredProvider,
        currentRatio: current.modelRatio[modelId],
        currentCompletionRatio: current.completionRatio[modelId] ?? 1,
        status: 'removed',
        selected: false,
      });
    }
  }

  return rows;
}
