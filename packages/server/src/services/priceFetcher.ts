import axios from 'axios';
import type { ModelPrice, ProviderPriceResult, LiteLLMPriceEntry } from '@newapi-sync/shared';
import { fetchAllModelsDevPrices } from './modelsDevFetcher.js';

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const TOKENS_PER_MILLION = 1_000_000;

/** Provider key in LiteLLM → display name mapping */
const SUPPORTED_PROVIDERS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  vertex_ai: 'Google',
  volcengine: '豆包 (字节跳动)',
  dashscope: '通义千问 (阿里云)',
  moonshot: 'Kimi (月之暗面)',
  zhipuai: '智谱 AI',
  baidu: '文心一言 (百度)',
  minimax: 'MiniMax',
  xai: 'xAI (Grok)',
  mistral: 'Mistral AI',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
};

const VALID_MODES = new Set(['chat', 'completion']);

/** In-memory cache for the raw LiteLLM JSON */
let cachedData: Record<string, LiteLLMPriceEntry> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch the raw LiteLLM price JSON. Uses a short in-memory cache to avoid
 * hammering GitHub on repeated calls within the same fetch cycle.
 */
export async function fetchLiteLLMData(): Promise<Record<string, LiteLLMPriceEntry>> {
  const now = Date.now();
  if (cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedData;
  }

  const { data } = await axios.get<Record<string, LiteLLMPriceEntry>>(LITELLM_URL, {
    timeout: 30_000,
  });

  cachedData = data;
  cacheTimestamp = now;
  return data;
}

/**
 * Resolve the display provider name for a LiteLLM entry.
 * Returns `undefined` if the provider is not supported.
 */
function resolveProvider(key: string, entry: LiteLLMPriceEntry): string | undefined {
  // Entries whose key starts with "gemini/" are Google models
  if (key.startsWith('gemini/')) {
    return 'Google';
  }

  const lp = entry.litellm_provider;
  if (!lp) return undefined;

  return SUPPORTED_PROVIDERS[lp];
}

/**
 * Parse a single LiteLLM entry into a ModelPrice.
 * Returns `null` if the entry is invalid (missing prices, unsupported mode, etc.).
 */
export function parseLiteLLMEntry(
  key: string,
  entry: LiteLLMPriceEntry,
): ModelPrice | null {
  // Filter out non-chat/completion modes
  if (!entry.mode || !VALID_MODES.has(entry.mode)) {
    return null;
  }

  const provider = resolveProvider(key, entry);
  if (!provider) {
    return null;
  }

  // Priority 1: per-token pricing (more precise)
  if (
    typeof entry.input_cost_per_token === 'number' &&
    typeof entry.output_cost_per_token === 'number' &&
    entry.input_cost_per_token > 0 &&
    entry.output_cost_per_token > 0
  ) {
    return {
      modelId: key,
      modelName: key,
      provider,
      pricingType: 'per_token',
      inputPricePerMillion: entry.input_cost_per_token * TOKENS_PER_MILLION,
      outputPricePerMillion: entry.output_cost_per_token * TOKENS_PER_MILLION,
    };
  }

  // Priority 2: per-request pricing (fallback)
  if (
    typeof entry.input_cost_per_request === 'number' &&
    entry.input_cost_per_request > 0
  ) {
    const outputCost =
      typeof entry.output_cost_per_request === 'number'
        ? entry.output_cost_per_request
        : 0;
    return {
      modelId: key,
      modelName: key,
      provider,
      pricingType: 'per_request',
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      pricePerRequest: entry.input_cost_per_request + outputCost,
    };
  }

  return null;
}


/**
 * Fetch prices for a specific provider from the LiteLLM data source.
 */
export async function fetchProviderPrices(provider: string): Promise<ProviderPriceResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const data = await fetchLiteLLMData();
    const models: ModelPrice[] = [];

    for (const [key, entry] of Object.entries(data)) {
      const parsed = parseLiteLLMEntry(key, entry);
      if (parsed && parsed.provider === provider) {
        models.push(parsed);
      }
    }

    return { provider, success: true, models, fetchedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { provider, success: false, models: [], error: message, fetchedAt };
  }
}

/**
 * Fetch prices for all supported providers in parallel.
 * Combines data from LiteLLM (international providers) and models.dev (Chinese providers).
 * Individual provider failures do not affect other providers.
 */
export async function fetchAllPrices(): Promise<ProviderPriceResult[]> {
  // Fetch from both data sources in parallel
  const [litellmResults, modelsDevResults] = await Promise.all([
    fetchAllLiteLLMPrices(),
    fetchAllModelsDevPrices(),
  ]);

  // Merge results, preferring models.dev for Chinese providers
  const chineseProviders = new Set([
    '通义千问 (阿里云)',
    '智谱 AI',
    '豆包 (字节跳动)',
  ]);

  const mergedResults = new Map<string, ProviderPriceResult>();

  // Add LiteLLM results first
  for (const result of litellmResults) {
    mergedResults.set(result.provider, result);
  }

  // Override with models.dev results for Chinese providers
  for (const result of modelsDevResults) {
    if (chineseProviders.has(result.provider)) {
      mergedResults.set(result.provider, result);
    }
  }

  return Array.from(mergedResults.values());
}

/**
 * Fetch prices from LiteLLM for all supported providers.
 */
async function fetchAllLiteLLMPrices(): Promise<ProviderPriceResult[]> {
  const providerNames = Object.values(SUPPORTED_PROVIDERS);
  // Deduplicate (vertex_ai and gemini/ both map to "Google")
  const unique = [...new Set(providerNames)];

  const results = await Promise.allSettled(unique.map(fetchProviderPrices));

  return results.map((r, i) => {
    if (r.status === 'fulfilled') {
      return r.value;
    }
    return {
      provider: unique[i],
      success: false,
      models: [],
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      fetchedAt: new Date().toISOString(),
    };
  });
}

/** Clear the in-memory LiteLLM cache (useful for testing / force-refresh). */
export function clearCache(): void {
  cachedData = null;
  cacheTimestamp = 0;
}
