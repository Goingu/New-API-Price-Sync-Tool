import axios from 'axios';
import type { ModelPrice, ProviderPriceResult } from '@newapi-sync/shared';

const MODELS_DEV_URL = 'https://models.dev/api.json';

/** Provider ID in models.dev → display name mapping */
const PROVIDER_MAPPING: Record<string, string> = {
  'alibaba': '通义千问 (阿里云)',
  'zhipuai': '智谱 AI',
  'deepseek': 'DeepSeek',
  'moonshotai': 'Kimi (月之暗面)',
  'minimax': 'MiniMax',
  'volcengine': '豆包 (字节跳动)',
};

interface ModelsDevModel {
  id: string;
  name: string;
  family?: string;
  cost?: {
    input: number;
    output: number;
    request?: number;
  };
  modalities?: {
    input?: string[];
    output?: string[];
  };
}

interface ModelsDevProvider {
  id: string;
  name: string;
  models: Record<string, ModelsDevModel>;
}

interface ModelsDevData {
  [providerId: string]: ModelsDevProvider;
}

/** In-memory cache for models.dev data */
let cachedData: ModelsDevData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch the models.dev API data with caching
 */
export async function fetchModelsDevData(): Promise<ModelsDevData> {
  const now = Date.now();
  if (cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedData;
  }

  const { data } = await axios.get<ModelsDevData>(MODELS_DEV_URL, {
    timeout: 30_000,
  });

  cachedData = data;
  cacheTimestamp = now;
  return data;
}

/**
 * Parse a models.dev model entry into ModelPrice
 */
function parseModelsDevModel(
  providerId: string,
  providerName: string,
  model: ModelsDevModel,
): ModelPrice | null {
  if (!model.cost) {
    return null;
  }

  const { input, output, request } = model.cost;

  // Per-request pricing
  if (request !== undefined && request > 0) {
    return {
      modelId: model.id,
      modelName: model.name || model.id,
      provider: providerName,
      pricingType: 'per_request',
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      pricePerRequest: request,
    };
  }

  // Per-token pricing
  if (input !== undefined && output !== undefined && input >= 0 && output >= 0) {
    return {
      modelId: model.id,
      modelName: model.name || model.id,
      provider: providerName,
      pricingType: 'per_token',
      inputPricePerMillion: input,
      outputPricePerMillion: output,
    };
  }

  return null;
}

/**
 * Fetch prices for a specific provider from models.dev
 */
export async function fetchModelsDevProviderPrices(
  displayName: string,
): Promise<ProviderPriceResult> {
  const fetchedAt = new Date().toISOString();

  try {
    const data = await fetchModelsDevData();
    const models: ModelPrice[] = [];

    // Find the provider ID that maps to this display name
    const providerId = Object.keys(PROVIDER_MAPPING).find(
      (key) => PROVIDER_MAPPING[key] === displayName,
    );

    if (!providerId || !data[providerId]) {
      return {
        provider: displayName,
        success: false,
        models: [],
        error: 'Provider not found in models.dev',
        fetchedAt,
      };
    }

    const provider = data[providerId];
    for (const model of Object.values(provider.models)) {
      const parsed = parseModelsDevModel(providerId, displayName, model);
      if (parsed) {
        models.push(parsed);
      }
    }

    return { provider: displayName, success: true, models, fetchedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { provider: displayName, success: false, models: [], error: message, fetchedAt };
  }
}

/**
 * Fetch prices for all supported Chinese providers from models.dev
 */
export async function fetchAllModelsDevPrices(): Promise<ProviderPriceResult[]> {
  const providerNames = Object.values(PROVIDER_MAPPING);
  const results = await Promise.allSettled(
    providerNames.map(fetchModelsDevProviderPrices),
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') {
      return r.value;
    }
    return {
      provider: providerNames[i],
      success: false,
      models: [],
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      fetchedAt: new Date().toISOString(),
    };
  });
}

/** Clear the in-memory cache */
export function clearCache(): void {
  cachedData = null;
  cacheTimestamp = 0;
}
