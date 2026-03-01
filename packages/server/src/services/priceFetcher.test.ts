import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LiteLLMPriceEntry } from '@newapi-sync/shared';
import axios from 'axios';
import { parseLiteLLMEntry, fetchProviderPrices, fetchAllPrices, clearCache } from './priceFetcher.js';

vi.mock('axios');

// ---------------------------------------------------------------------------
// parseLiteLLMEntry — unit tests
// ---------------------------------------------------------------------------
describe('parseLiteLLMEntry', () => {
  const validEntry: LiteLLMPriceEntry = {
    input_cost_per_token: 0.000005,   // $5 / 1M tokens
    output_cost_per_token: 0.000015,  // $15 / 1M tokens
    litellm_provider: 'openai',
    mode: 'chat',
  };

  it('parses a valid OpenAI chat entry', () => {
    const result = parseLiteLLMEntry('gpt-4o', validEntry);
    expect(result).not.toBeNull();
    expect(result!.modelId).toBe('gpt-4o');
    expect(result!.provider).toBe('OpenAI');
    expect(result!.inputPricePerMillion).toBe(5);
    expect(result!.outputPricePerMillion).toBe(15);
  });

  it('parses a valid Anthropic entry', () => {
    const entry: LiteLLMPriceEntry = {
      input_cost_per_token: 0.000003,
      output_cost_per_token: 0.000015,
      litellm_provider: 'anthropic',
      mode: 'chat',
    };
    const result = parseLiteLLMEntry('claude-3-5-sonnet-20241022', entry);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('Anthropic');
    expect(result!.inputPricePerMillion).toBe(3);
    expect(result!.outputPricePerMillion).toBe(15);
  });

  it('parses a valid DeepSeek entry', () => {
    const entry: LiteLLMPriceEntry = {
      input_cost_per_token: 0.00000014,
      output_cost_per_token: 0.00000028,
      litellm_provider: 'deepseek',
      mode: 'chat',
    };
    const result = parseLiteLLMEntry('deepseek-chat', entry);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('DeepSeek');
    expect(result!.inputPricePerMillion).toBeCloseTo(0.14, 6);
    expect(result!.outputPricePerMillion).toBeCloseTo(0.28, 6);
  });

  it('parses vertex_ai entries as Google', () => {
    const entry: LiteLLMPriceEntry = {
      input_cost_per_token: 0.00000125,
      output_cost_per_token: 0.000005,
      litellm_provider: 'vertex_ai',
      mode: 'chat',
    };
    const result = parseLiteLLMEntry('gemini-1.5-pro', entry);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('Google');
  });

  it('parses entries with key starting with "gemini/" as Google', () => {
    const entry: LiteLLMPriceEntry = {
      input_cost_per_token: 0.0000001,
      output_cost_per_token: 0.0000004,
      litellm_provider: 'vertex_ai',
      mode: 'chat',
    };
    const result = parseLiteLLMEntry('gemini/gemini-1.5-flash', entry);
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('Google');
    expect(result!.modelId).toBe('gemini/gemini-1.5-flash');
  });

  it('accepts mode "completion"', () => {
    const entry: LiteLLMPriceEntry = {
      ...validEntry,
      mode: 'completion',
    };
    const result = parseLiteLLMEntry('gpt-3.5-turbo-instruct', entry);
    expect(result).not.toBeNull();
  });

  // --- Filtering invalid entries ---

  it('returns null for missing input_cost_per_token', () => {
    const entry: LiteLLMPriceEntry = {
      output_cost_per_token: 0.000015,
      litellm_provider: 'openai',
      mode: 'chat',
    };
    expect(parseLiteLLMEntry('bad-model', entry)).toBeNull();
  });

  it('returns null for missing output_cost_per_token', () => {
    const entry: LiteLLMPriceEntry = {
      input_cost_per_token: 0.000005,
      litellm_provider: 'openai',
      mode: 'chat',
    };
    expect(parseLiteLLMEntry('bad-model', entry)).toBeNull();
  });

  it('returns null when input cost is zero', () => {
    const entry: LiteLLMPriceEntry = {
      input_cost_per_token: 0,
      output_cost_per_token: 0.000015,
      litellm_provider: 'openai',
      mode: 'chat',
    };
    expect(parseLiteLLMEntry('zero-input', entry)).toBeNull();
  });

  it('returns null for embedding mode', () => {
    const entry: LiteLLMPriceEntry = {
      ...validEntry,
      mode: 'embedding',
    };
    expect(parseLiteLLMEntry('text-embedding-3-small', entry)).toBeNull();
  });

  it('returns null for image_generation mode', () => {
    const entry: LiteLLMPriceEntry = {
      ...validEntry,
      mode: 'image_generation',
    };
    expect(parseLiteLLMEntry('dall-e-3', entry)).toBeNull();
  });

  it('returns null for unsupported provider', () => {
    const entry: LiteLLMPriceEntry = {
      ...validEntry,
      litellm_provider: 'unknown_provider',
    };
    expect(parseLiteLLMEntry('command-r', entry)).toBeNull();
  });

  it('returns null when mode is missing', () => {
    const entry = {
      input_cost_per_token: 0.000005,
      output_cost_per_token: 0.000015,
      litellm_provider: 'openai',
    } as LiteLLMPriceEntry;
    expect(parseLiteLLMEntry('no-mode', entry)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchProviderPrices / fetchAllPrices — integration-style tests with mocked HTTP
// ---------------------------------------------------------------------------
describe('fetchProviderPrices', () => {
  const mockData: Record<string, LiteLLMPriceEntry> = {
    'gpt-4o': {
      input_cost_per_token: 0.0000025,
      output_cost_per_token: 0.00001,
      litellm_provider: 'openai',
      mode: 'chat',
    },
    'gpt-4o-mini': {
      input_cost_per_token: 0.00000015,
      output_cost_per_token: 0.0000006,
      litellm_provider: 'openai',
      mode: 'chat',
    },
    'claude-3-5-sonnet-20241022': {
      input_cost_per_token: 0.000003,
      output_cost_per_token: 0.000015,
      litellm_provider: 'anthropic',
      mode: 'chat',
    },
    'text-embedding-3-small': {
      input_cost_per_token: 0.00000002,
      output_cost_per_token: 0,
      litellm_provider: 'openai',
      mode: 'embedding',
    },
  };

  beforeEach(() => {
    clearCache();
    vi.mocked(axios.get).mockResolvedValue({ data: mockData });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCache();
  });

  it('returns only OpenAI chat models for provider "OpenAI"', async () => {
    const result = await fetchProviderPrices('OpenAI');
    expect(result.success).toBe(true);
    expect(result.provider).toBe('OpenAI');
    expect(result.models).toHaveLength(2);
    expect(result.models.every((m) => m.provider === 'OpenAI')).toBe(true);
  });

  it('returns only Anthropic models for provider "Anthropic"', async () => {
    const result = await fetchProviderPrices('Anthropic');
    expect(result.success).toBe(true);
    expect(result.models).toHaveLength(1);
    expect(result.models[0].modelId).toBe('claude-3-5-sonnet-20241022');
  });

  it('returns empty models for provider with no matches', async () => {
    const result = await fetchProviderPrices('DeepSeek');
    expect(result.success).toBe(true);
    expect(result.models).toHaveLength(0);
  });

  it('returns error result when fetch fails', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));
    clearCache();

    const result = await fetchProviderPrices('OpenAI');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
    expect(result.models).toHaveLength(0);
  });
});

describe('fetchAllPrices', () => {
  const mockData: Record<string, LiteLLMPriceEntry> = {
    'gpt-4o': {
      input_cost_per_token: 0.0000025,
      output_cost_per_token: 0.00001,
      litellm_provider: 'openai',
      mode: 'chat',
    },
    'claude-3-5-sonnet-20241022': {
      input_cost_per_token: 0.000003,
      output_cost_per_token: 0.000015,
      litellm_provider: 'anthropic',
      mode: 'chat',
    },
    'deepseek-chat': {
      input_cost_per_token: 0.00000014,
      output_cost_per_token: 0.00000028,
      litellm_provider: 'deepseek',
      mode: 'chat',
    },
    'gemini/gemini-1.5-pro': {
      input_cost_per_token: 0.00000125,
      output_cost_per_token: 0.000005,
      litellm_provider: 'vertex_ai',
      mode: 'chat',
    },
  };

  beforeEach(() => {
    clearCache();
    vi.mocked(axios.get).mockResolvedValue({ data: mockData });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCache();
  });

  it('returns results for all supported providers', async () => {
    const results = await fetchAllPrices();
    // 14 unique provider display names in SUPPORTED_PROVIDERS
    expect(results).toHaveLength(14);
    const providers = results.map((r) => r.provider).sort();
    expect(providers).toContain('OpenAI');
    expect(providers).toContain('Anthropic');
    expect(providers).toContain('DeepSeek');
    expect(providers).toContain('Google');
  });

  it('each result has success=true', async () => {
    const results = await fetchAllPrices();
    expect(results.every((r) => r.success)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — per-request pricing classification
// ---------------------------------------------------------------------------
import fc from 'fast-check';

/** Supported provider keys that parseLiteLLMEntry will accept */
const SUPPORTED_PROVIDER_KEYS = [
  'openai', 'anthropic', 'deepseek', 'vertex_ai', 'volcengine',
  'alibaba', 'moonshot', 'zhipuai', 'baidu', 'minimax',
  'xai', 'mistral', 'cohere', 'perplexity',
];

const VALID_MODES_PBT = ['chat', 'completion'];

/** Arbitrary for a positive number (used for cost fields) */
const positiveCost = fc.double({ min: 1e-12, max: 1000, noNaN: true, noDefaultInfinity: true })
  .filter((n) => n > 0);

/** Arbitrary for an invalid per-token cost: undefined, zero, or negative */
const invalidCost = fc.oneof(
  fc.constant(undefined as number | undefined),
  fc.constant(0),
  fc.double({ min: -1000, max: 0, noNaN: true, noDefaultInfinity: true }),
);

/** Arbitrary for a model key (simple alphanumeric with dashes/slashes) */
const modelKey = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-/.'.split('')),
  { minLength: 1, maxLength: 40 },
);

describe('parseLiteLLMEntry — property-based tests', () => {
  /**
   * Property 1: 按次计费模型正确分类
   *
   * For any valid LiteLLM entry with valid input_cost_per_request (positive)
   * and NO valid input_cost_per_token (positive), parseLiteLLMEntry should
   * return a ModelPrice with pricingType = 'per_request' and pricePerRequest > 0.
   *
   * **Validates: Requirements 1.1, 1.2, 1.4**
   */
  it('Property 1: per-request entries are classified as per_request with positive pricePerRequest', () => {
    fc.assert(
      fc.property(
        modelKey,
        fc.constantFrom(...SUPPORTED_PROVIDER_KEYS),
        fc.constantFrom(...VALID_MODES_PBT),
        positiveCost,
        fc.oneof(positiveCost, fc.constant(undefined as number | undefined)),
        invalidCost,
        invalidCost,
        (key, provider, mode, inputCostPerReq, outputCostPerReq, inputCostPerToken, outputCostPerToken) => {
          const entry: LiteLLMPriceEntry = {
            litellm_provider: provider,
            mode,
            input_cost_per_request: inputCostPerReq,
            output_cost_per_request: outputCostPerReq,
            input_cost_per_token: inputCostPerToken,
            output_cost_per_token: outputCostPerToken,
          };

          const result = parseLiteLLMEntry(key, entry);

          expect(result).not.toBeNull();
          expect(result!.pricingType).toBe('per_request');
          expect(result!.pricePerRequest).toBeGreaterThan(0);
          expect(result!.inputPricePerMillion).toBe(0);
          expect(result!.outputPricePerMillion).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Property 2: 按 token 计费优先级
   *
   * For any valid LiteLLM entry with BOTH valid input_cost_per_token (positive)
   * and input_cost_per_request (positive), parseLiteLLMEntry should return a
   * ModelPrice with pricingType = 'per_token' and inputPricePerMillion based
   * on input_cost_per_token.
   *
   * **Validates: Requirements 1.3**
   */
  it('Property 2: per-token pricing takes priority when both per-token and per-request fields are present', () => {
    fc.assert(
      fc.property(
        modelKey,
        fc.constantFrom(...SUPPORTED_PROVIDER_KEYS),
        fc.constantFrom(...VALID_MODES_PBT),
        positiveCost,
        positiveCost,
        positiveCost,
        positiveCost,
        (key, provider, mode, inputCostPerToken, outputCostPerToken, inputCostPerReq, outputCostPerReq) => {
          const entry: LiteLLMPriceEntry = {
            litellm_provider: provider,
            mode,
            input_cost_per_token: inputCostPerToken,
            output_cost_per_token: outputCostPerToken,
            input_cost_per_request: inputCostPerReq,
            output_cost_per_request: outputCostPerReq,
          };

          const result = parseLiteLLMEntry(key, entry);

          expect(result).not.toBeNull();
          expect(result!.pricingType).toBe('per_token');
          expect(result!.inputPricePerMillion).toBeCloseTo(
            inputCostPerToken * 1_000_000,
            4,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
