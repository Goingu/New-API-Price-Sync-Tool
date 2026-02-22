import { describe, it, expect } from 'vitest';
import { sortComparison, filterComparison } from './sorting';
import type { ComparisonRow } from '@newapi-sync/shared';

function makeRow(overrides: Partial<ComparisonRow>): ComparisonRow {
  return {
    modelId: 'model',
    provider: '',
    status: 'unchanged',
    selected: false,
    ...overrides,
  };
}

describe('sortComparison', () => {
  const rows: ComparisonRow[] = [
    makeRow({ modelId: 'charlie', ratioDiffPercent: 10, provider: 'openai' }),
    makeRow({ modelId: 'alpha', ratioDiffPercent: -5, provider: 'deepseek' }),
    makeRow({ modelId: 'bravo', ratioDiffPercent: 25, provider: 'anthropic' }),
  ];

  it('sorts by modelId ascending', () => {
    const sorted = sortComparison(rows, 'modelId', 'asc');
    expect(sorted.map((r) => r.modelId)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('sorts by modelId descending', () => {
    const sorted = sortComparison(rows, 'modelId', 'desc');
    expect(sorted.map((r) => r.modelId)).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('sorts by ratioDiffPercent ascending', () => {
    const sorted = sortComparison(rows, 'ratioDiffPercent', 'asc');
    expect(sorted.map((r) => r.ratioDiffPercent)).toEqual([-5, 10, 25]);
  });

  it('sorts by ratioDiffPercent descending', () => {
    const sorted = sortComparison(rows, 'ratioDiffPercent', 'desc');
    expect(sorted.map((r) => r.ratioDiffPercent)).toEqual([25, 10, -5]);
  });

  it('sorts by provider ascending', () => {
    const sorted = sortComparison(rows, 'provider', 'asc');
    expect(sorted.map((r) => r.provider)).toEqual(['anthropic', 'deepseek', 'openai']);
  });

  it('sorts by provider descending', () => {
    const sorted = sortComparison(rows, 'provider', 'desc');
    expect(sorted.map((r) => r.provider)).toEqual(['openai', 'deepseek', 'anthropic']);
  });

  it('treats undefined ratioDiffPercent as 0', () => {
    const input = [
      makeRow({ modelId: 'a', ratioDiffPercent: 5 }),
      makeRow({ modelId: 'b', ratioDiffPercent: undefined }),
      makeRow({ modelId: 'c', ratioDiffPercent: -3 }),
    ];
    const sorted = sortComparison(input, 'ratioDiffPercent', 'asc');
    expect(sorted.map((r) => r.ratioDiffPercent)).toEqual([-3, undefined, 5]);
  });

  it('does not mutate the original array', () => {
    const original = [...rows];
    sortComparison(rows, 'modelId', 'asc');
    expect(rows).toEqual(original);
  });

  it('returns empty array for empty input', () => {
    expect(sortComparison([], 'modelId', 'asc')).toEqual([]);
  });
});

describe('filterComparison', () => {
  const rows: ComparisonRow[] = [
    makeRow({ modelId: 'gpt-4o', provider: 'openai', status: 'decreased' }),
    makeRow({ modelId: 'claude-3', provider: 'anthropic', status: 'increased' }),
    makeRow({ modelId: 'gpt-3.5', provider: 'openai', status: 'unchanged' }),
    makeRow({ modelId: 'deepseek-v2', provider: 'deepseek', status: 'new' }),
  ];

  it('filters by provider', () => {
    const result = filterComparison(rows, { provider: 'openai' });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.provider === 'openai')).toBe(true);
  });

  it('filters by status', () => {
    const result = filterComparison(rows, { status: 'decreased' });
    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe('gpt-4o');
  });

  it('filters by searchText (case-insensitive)', () => {
    const result = filterComparison(rows, { searchText: 'GPT' });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.modelId).sort()).toEqual(['gpt-3.5', 'gpt-4o']);
  });

  it('combines multiple filters', () => {
    const result = filterComparison(rows, { provider: 'openai', searchText: '4o' });
    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe('gpt-4o');
  });

  it('returns all rows when no filters are set', () => {
    const result = filterComparison(rows, {});
    expect(result).toHaveLength(4);
  });

  it('returns empty when no rows match', () => {
    const result = filterComparison(rows, { provider: 'google' });
    expect(result).toHaveLength(0);
  });
});
