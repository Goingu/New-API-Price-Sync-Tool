/** Format an ISO timestamp as a relative time string (e.g. "5 分钟前") */
export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  return `${diffDays} 天前`;
}

/** Check if an ISO timestamp is older than the given hours (default 12) */
export function isDataExpired(isoString: string, hours = 12): boolean {
  const diffHours = (Date.now() - new Date(isoString).getTime()) / 3600000;
  return diffHours > hours;
}

/** Extract a provider name from a model ID string */
export function extractProvider(modelId: string): string {
  const lower = modelId.toLowerCase();

  if (lower.includes('gpt') || lower.includes('openai') || lower.includes('o1') || lower.includes('chatgpt')) return 'OpenAI';
  if (lower.includes('claude')) return 'Anthropic';
  if (lower.includes('gemini') || lower.includes('palm')) return 'Google';
  if (lower.includes('llama')) return 'Meta';
  if (lower.includes('mistral') || lower.includes('mixtral')) return 'Mistral';
  if (lower.includes('deepseek')) return 'DeepSeek';
  if (lower.includes('qwen')) return 'Qwen';
  if (lower.includes('glm') || lower.includes('chatglm')) return 'Zhipu';
  if (lower.includes('moonshot') || lower.includes('kimi')) return 'Moonshot';
  if (lower.includes('doubao')) return 'Doubao';
  if (lower.includes('yi-')) return 'Yi';
  if (lower.includes('baichuan')) return 'Baichuan';
  if (lower.includes('spark')) return 'iFlytek';
  if (lower.includes('ernie')) return 'Baidu';
  if (lower.includes('hunyuan')) return 'Tencent';
  if (lower.includes('360')) return '360AI';
  if (lower.includes('grok')) return 'xAI';
  if (lower.includes('command')) return 'Cohere';

  return '其他';
}

/** Count models in a comma-separated models string */
export function countModels(models: string): number {
  if (!models || models.trim() === '') return 0;
  return models.split(',').filter((m) => m.trim().length > 0).length;
}
