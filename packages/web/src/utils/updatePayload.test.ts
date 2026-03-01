import { describe, it, expect } from 'vitest';
import { selectByFilter, buildUpdatePayload } from './updatePayload';
import type { ComparisonRow, RatioConfig } from '@newapi-sync/shared';

function makeRow(overrides: Partial<ComparisonRow>): ComparisonRow {
  return {
    modelId: 'model',
    provider: '',
    status: 'unchanged',
    selected: false,
    ...overrides,
  };
}

describe('selectByFilter', () => {
  const rows: ComparisonRow[] = [
    makeRow({ modelId: 'a', status: 'decreased' }),
    makeRow({ modelId: 'b', status: 'increased' }),
    makeRow({ modelId: 'c', status: 'decreased' }),
    makeRow({ modelId: 'd', status: 'unchanged' }),
    makeRow({ modelId: 'e', status: 'new' }),
  ];

  it('"all" selects every model ID', () => {
    const result = selectByFilter(rows, 'all');
    expect(result.size).toBe(5);
    for (const row of rows) {
      expect(result.has(row.modelId)).toBe(true);
    }
  });

  it('"none" returns empty set', () => {
    const result = selectByFilter(rows, 'none');
    expect(result.size).toBe(0);
  });

  it('"decreased" selects only decreased models', () => {
    const result = selectByFilter(rows, 'decreased');
    expect(result.size).toBe(2);
    expect(result.has('a')).toBe(true);
    expect(result.has('c')).toBe(true);
    expect(result.has('b')).toBe(false);
  });

  it('handles empty rows', () => {
    expect(selectByFilter([], 'all').size).toBe(0);
    expect(selectByFilter([], 'decreased').size).toBe(0);
  });
});

describe('buildUpdatePayload', () => {
  const currentConfig: RatioConfig = {
    modelRatio: { 'gpt-4o': 2.5, 'claude-3': 10, 'gpt-3.5': 1 },
    completionRatio: { 'gpt-4o': 3, 'claude-3': 5, 'gpt-3.5': 1 },
  };

  it('returns two entries: ModelRatio and CompletionRatio', () => {
    const result = buildUpdatePayload(currentConfig, []);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('ModelRatio');
    expect(result[1].key).toBe('CompletionRatio');
  });

  it('preserves all current values when no rows are selected', () => {
    const result = buildUpdatePayload(currentConfig, []);
    const modelRatio = JSON.parse(result[0].value);
    const completionRatio = JSON.parse(result[1].value);
    expect(modelRatio).toEqual(currentConfig.modelRatio);
    expect(completionRatio).toEqual(currentConfig.completionRatio);
  });

  it('overrides selected models with new values', () => {
    const selectedRows: ComparisonRow[] = [
      makeRow({
        modelId: 'gpt-4o',
        newRatio: 3.0,
        newCompletionRatio: 4,
        status: 'increased',
      }),
    ];
    const result = buildUpdatePayload(currentConfig, selectedRows);
    const modelRatio = JSON.parse(result[0].value);
    const completionRatio = JSON.parse(result[1].value);

    expect(modelRatio['gpt-4o']).toBe(3.0);
    expect(completionRatio['gpt-4o']).toBe(4);
    // Unselected models remain unchanged
    expect(modelRatio['claude-3']).toBe(10);
    expect(completionRatio['claude-3']).toBe(5);
    expect(modelRatio['gpt-3.5']).toBe(1);
  });

  it('adds new models from selected rows', () => {
    const selectedRows: ComparisonRow[] = [
      makeRow({
        modelId: 'new-model',
        newRatio: 5,
        newCompletionRatio: 2,
        status: 'new',
      }),
    ];
    const result = buildUpdatePayload(currentConfig, selectedRows);
    const modelRatio = JSON.parse(result[0].value);
    const completionRatio = JSON.parse(result[1].value);

    expect(modelRatio['new-model']).toBe(5);
    expect(completionRatio['new-model']).toBe(2);
    // Original models still present
    expect(Object.keys(modelRatio)).toHaveLength(4);
  });

  it('produces valid JSON strings', () => {
    const selectedRows: ComparisonRow[] = [
      makeRow({ modelId: 'gpt-4o', newRatio: 3.0, newCompletionRatio: 4 }),
    ];
    const result = buildUpdatePayload(currentConfig, selectedRows);
    for (const entry of result) {
      expect(() => JSON.parse(entry.value)).not.toThrow();
      const parsed = JSON.parse(entry.value);
      expect(typeof parsed).toBe('object');
    }
  });

  it('does not mutate the original config', () => {
    const configCopy = JSON.parse(JSON.stringify(currentConfig));
    const selectedRows: ComparisonRow[] = [
      makeRow({ modelId: 'gpt-4o', newRatio: 99, newCompletionRatio: 99 }),
    ];
    buildUpdatePayload(currentConfig, selectedRows);
    expect(currentConfig).toEqual(configCopy);
  });
});


// ---------------------------------------------------------------------------
// Property-based tests — mixed pricing type payload separation
// ---------------------------------------------------------------------------
import * as fc from 'fast-check';

/** Arbitrary for a per-token ComparisonRow */
const perTokenRowArb: fc.Arbitrary<ComparisonRow> = fc.record({
  modelId: fc.string({ minLength: 1, maxLength: 20 }).map(s => `token-${s}`),
  provider: fc.constant('test'),
  status: fc.constant('increased' as const),
  selected: fc.constant(true),
  pricingType: fc.constant('per_token' as const),
  newRatio: fc.double({ min: 0.1, max: 100, noNaN: true }),
  newCompletionRatio: fc.double({ min: 0.1, max: 10, noNaN: true }),
});

/** Arbitrary for a per-request ComparisonRow */
const perRequestRowArb: fc.Arbitrary<ComparisonRow> = fc.record({
  modelId: fc.string({ minLength: 1, maxLength: 20 }).map(s => `request-${s}`),
  provider: fc.constant('test'),
  status: fc.constant('increased' as const),
  selected: fc.constant(true),
  pricingType: fc.constant('per_request' as const),
  newPrice: fc.double({ min: 0.001, max: 100, noNaN: true }),
});

/**
 * Property 5: 混合计费类型载荷分离
 * Validates: Requirements 5.1, 5.2, 5.3
 *
 * For any set of selected rows containing at least one per-token and one
 * per-request model, buildUpdatePayload should produce payloads where:
 * - ModelRatio/CompletionRatio keys exist (for per-token models)
 * - ModelPrice key exists (for per-request models)
 * - Per-request model IDs do NOT appear in ModelRatio payload values
 * - Per-token model IDs do NOT appear in ModelPrice payload values
 */
describe('Property 5: 混合计费类型载荷分离', () => {
  it('separates per-token and per-request models into distinct payload keys', () => {
    fc.assert(
      fc.property(
        fc.array(perTokenRowArb, { minLength: 1, maxLength: 5 }),
        fc.array(perRequestRowArb, { minLength: 1, maxLength: 5 }),
        (tokenRows, requestRows) => {
          const currentConfig: RatioConfig = {
            modelRatio: {},
            completionRatio: {},
          };

          const selectedRows = [...tokenRows, ...requestRows];
          const payloads = buildUpdatePayload(currentConfig, selectedRows);

          // Find each payload by key
          const modelRatioPayload = payloads.find(p => p.key === 'ModelRatio');
          const completionRatioPayload = payloads.find(p => p.key === 'CompletionRatio');
          const modelPricePayload = payloads.find(p => p.key === 'ModelPrice');

          // ModelRatio and CompletionRatio must exist
          expect(modelRatioPayload).toBeDefined();
          expect(completionRatioPayload).toBeDefined();
          // ModelPrice must exist (we have per-request rows)
          expect(modelPricePayload).toBeDefined();

          const modelRatioData = JSON.parse(modelRatioPayload!.value) as Record<string, number>;
          const modelPriceData = JSON.parse(modelPricePayload!.value) as Record<string, number>;

          const tokenIds = new Set(tokenRows.map(r => r.modelId));
          const requestIds = new Set(requestRows.map(r => r.modelId));

          // Per-request model IDs must NOT appear in ModelRatio
          for (const id of requestIds) {
            expect(modelRatioData).not.toHaveProperty(id);
          }

          // Per-token model IDs must NOT appear in ModelPrice
          for (const id of tokenIds) {
            expect(modelPriceData).not.toHaveProperty(id);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

/**
 * Property 6: 未选中按次计费模型价格保留
 * Validates: Requirements 5.4
 *
 * For any current modelPrice config and a subset of selected per-request
 * models, the generated ModelPrice payload should:
 * - Preserve unselected models' original prices
 * - Update selected models to their new prices
 * - Include all original models in the payload
 */
describe('Property 6: 未选中按次计费模型价格保留', () => {
  it('preserves unselected model prices and updates selected ones', () => {
    fc.assert(
      fc.property(
        // Generate a non-empty modelPrice config with unique model IDs
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 15 }).map(s => `existing-${s}`),
            fc.double({ min: 0.001, max: 100, noNaN: true }),
          ),
          { minLength: 2, maxLength: 8 },
        ),
        // New price for selected models
        fc.double({ min: 0.001, max: 100, noNaN: true }),
        (modelEntries, newPriceValue) => {
          // Deduplicate model IDs
          const modelPriceMap: Record<string, number> = {};
          for (const [id, price] of modelEntries) {
            modelPriceMap[id] = price;
          }
          const allIds = Object.keys(modelPriceMap);
          if (allIds.length < 2) return; // Need at least 2 models to split

          // Select only the first model for update, rest remain unselected
          const selectedId = allIds[0];
          const unselectedIds = allIds.slice(1);

          const currentConfig: RatioConfig = {
            modelRatio: {},
            completionRatio: {},
            modelPrice: modelPriceMap,
          };

          const selectedRows: ComparisonRow[] = [{
            modelId: selectedId,
            provider: 'test',
            status: 'increased',
            selected: true,
            pricingType: 'per_request',
            newPrice: newPriceValue,
          }];

          const payloads = buildUpdatePayload(currentConfig, selectedRows);
          const modelPricePayload = payloads.find(p => p.key === 'ModelPrice');

          expect(modelPricePayload).toBeDefined();
          const result = JSON.parse(modelPricePayload!.value) as Record<string, number>;

          // All original models must be present
          for (const id of allIds) {
            expect(result).toHaveProperty(id);
          }

          // Selected model should have the new price
          expect(result[selectedId]).toBe(newPriceValue);

          // Unselected models should keep their original prices
          for (const id of unselectedIds) {
            expect(result[id]).toBe(modelPriceMap[id]);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
