import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { compareRatios } from './comparison';
import type { RatioConfig, RatioResult } from '@newapi-sync/shared';

describe('compareRatios', () => {
  it('returns empty array when both inputs are empty', () => {
    const current: RatioConfig = { modelRatio: {}, completionRatio: {} };
    const upstream: RatioResult[] = [];
    expect(compareRatios(current, upstream)).toEqual([]);
  });

  it('marks models present in both with unchanged status when ratios match', () => {
    const current: RatioConfig = {
      modelRatio: { 'gpt-4o': 2.5 },
      completionRatio: { 'gpt-4o': 3 },
    };
    const upstream: RatioResult[] = [
      { modelId: 'gpt-4o', modelRatio: 2.5, completionRatio: 3 },
    ];
    const rows = compareRatios(current, upstream);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('unchanged');
    expect(rows[0].ratioDiffPercent).toBe(0);
    expect(rows[0].selected).toBe(false);
  });

  it('marks increased when new ratio is higher', () => {
    const current: RatioConfig = {
      modelRatio: { 'gpt-4o': 2.0 },
      completionRatio: { 'gpt-4o': 3 },
    };
    const upstream: RatioResult[] = [
      { modelId: 'gpt-4o', modelRatio: 3.0, completionRatio: 3 },
    ];
    const rows = compareRatios(current, upstream);
    expect(rows[0].status).toBe('increased');
    expect(rows[0].ratioDiffPercent).toBe(50); // (3-2)/2 * 100
  });

  it('marks decreased when new ratio is lower', () => {
    const current: RatioConfig = {
      modelRatio: { 'claude-3': 10 },
      completionRatio: { 'claude-3': 5 },
    };
    const upstream: RatioResult[] = [
      { modelId: 'claude-3', modelRatio: 8, completionRatio: 4 },
    ];
    const rows = compareRatios(current, upstream);
    expect(rows[0].status).toBe('decreased');
    expect(rows[0].ratioDiffPercent).toBe(-20); // (8-10)/10 * 100
  });

  it('marks models only in upstream as new', () => {
    const current: RatioConfig = { modelRatio: {}, completionRatio: {} };
    const upstream: RatioResult[] = [
      { modelId: 'new-model', modelRatio: 1.5, completionRatio: 2 },
    ];
    const rows = compareRatios(current, upstream);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('new');
    expect(rows[0].currentRatio).toBeUndefined();
    expect(rows[0].newRatio).toBe(1.5);
    expect(rows[0].selected).toBe(false);
  });

  it('marks models only in current as removed', () => {
    const current: RatioConfig = {
      modelRatio: { 'old-model': 5 },
      completionRatio: { 'old-model': 2 },
    };
    const upstream: RatioResult[] = [];
    const rows = compareRatios(current, upstream);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('removed');
    expect(rows[0].currentRatio).toBe(5);
    expect(rows[0].newRatio).toBeUndefined();
  });

  it('handles mixed cases: both, new, and removed', () => {
    const current: RatioConfig = {
      modelRatio: { 'model-a': 2, 'model-b': 3 },
      completionRatio: { 'model-a': 1, 'model-b': 1 },
    };
    const upstream: RatioResult[] = [
      { modelId: 'model-a', modelRatio: 2, completionRatio: 1 },
      { modelId: 'model-c', modelRatio: 4, completionRatio: 2 },
    ];
    const rows = compareRatios(current, upstream);
    expect(rows).toHaveLength(3);

    const byId = new Map(rows.map((r) => [r.modelId, r]));
    expect(byId.get('model-a')!.status).toBe('unchanged');
    expect(byId.get('model-b')!.status).toBe('removed');
    expect(byId.get('model-c')!.status).toBe('new');
  });

  it('defaults completionRatio to 1 when missing from current config', () => {
    const current: RatioConfig = {
      modelRatio: { 'gpt-3.5': 1 },
      completionRatio: {},
    };
    const upstream: RatioResult[] = [
      { modelId: 'gpt-3.5', modelRatio: 1, completionRatio: 1 },
    ];
    const rows = compareRatios(current, upstream);
    expect(rows[0].currentCompletionRatio).toBe(1);
  });

  it('calculates ratioDiffPercent correctly', () => {
    const current: RatioConfig = {
      modelRatio: { m: 4 },
      completionRatio: { m: 1 },
    };
    const upstream: RatioResult[] = [
      { modelId: 'm', modelRatio: 5, completionRatio: 1 },
    ];
    const rows = compareRatios(current, upstream);
    // (5 - 4) / 4 * 100 = 25
    expect(rows[0].ratioDiffPercent).toBe(25);
  });

  it('all rows start with selected = false', () => {
    const current: RatioConfig = {
      modelRatio: { a: 1, b: 2 },
      completionRatio: { a: 1, b: 1 },
    };
    const upstream: RatioResult[] = [
      { modelId: 'a', modelRatio: 1.5, completionRatio: 1 },
      { modelId: 'c', modelRatio: 3, completionRatio: 2 },
    ];
    const rows = compareRatios(current, upstream);
    for (const row of rows) {
      expect(row.selected).toBe(false);
    }
  });
});


/**
 * Property 4: 按次计费模型差异百分比计算
 * Validates: Requirements 4.3
 *
 * For any per-request model comparison row that has both currentPrice (> 0)
 * and newPrice, the diff percentage should equal
 * (newPrice - currentPrice) / currentPrice * 100.
 */
describe('Property 4: 按次计费模型差异百分比计算', () => {
  it('per-request model diff percent equals (newPrice - currentPrice) / currentPrice * 100', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),  // modelId
        fc.double({ min: 0.001, max: 1000, noNaN: true }),  // currentPrice (positive)
        fc.double({ min: 0.001, max: 1000, noNaN: true }),  // newPrice (positive)
        (modelId, currentPrice, newPrice) => {
          const current: RatioConfig = {
            modelRatio: {},
            completionRatio: {},
            modelPrice: { [modelId]: currentPrice },
          };
          const upstream: RatioResult[] = [{
            modelId,
            modelRatio: 0,
            completionRatio: 0,
            pricingType: 'per_request',
            pricePerRequest: newPrice,
          }];

          const rows = compareRatios(current, upstream);
          const row = rows.find(r => r.modelId === modelId);

          expect(row).toBeDefined();
          expect(row!.pricingType).toBe('per_request');
          expect(row!.currentPrice).toBe(currentPrice);
          expect(row!.newPrice).toBe(newPrice);

          const expectedDiff = ((newPrice - currentPrice) / currentPrice) * 100;
          expect(row!.ratioDiffPercent).toBeCloseTo(expectedDiff, 6);
        }
      ),
      { numRuns: 200 }
    );
  });
});
