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
