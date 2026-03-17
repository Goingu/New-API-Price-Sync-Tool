/**
 * Channel type label mapping (common New API channel types).
 * Shared across ChannelComparison, ChannelPriority, ModelGroupManagement, etc.
 */
export const CHANNEL_TYPE_LABELS: Record<number, string> = {
  1: 'OpenAI',
  2: 'API2D',
  3: 'Azure',
  4: 'CloseAI',
  5: 'OpenAI-SB',
  6: 'OpenAI Max',
  7: 'OhMyGPT',
  8: 'Custom',
  9: 'AI.LS',
  10: 'AI.LS',
  11: 'PaLM',
  12: 'API2GPT',
  13: 'AIGC2D',
  14: 'Anthropic',
  15: 'Baidu',
  16: 'Zhipu',
  17: 'Ali',
  18: 'Xunfei',
  19: '360',
  20: 'Tencent',
  21: 'Google Gemini',
  23: 'DeepSeek',
  24: 'Moonshot',
  25: 'Mistral',
  26: 'Groq',
  27: 'Ollama',
  28: 'LingYiWanWu',
  31: 'Silicon Flow',
  33: 'AWS Claude',
  34: 'Coze',
  35: 'Cohere',
  36: 'DeepL',
  37: 'Together AI',
  40: 'Doubao',
};

export function getChannelTypeLabel(type: number): string {
  return CHANNEL_TYPE_LABELS[type] ?? `类型 ${type}`;
}
