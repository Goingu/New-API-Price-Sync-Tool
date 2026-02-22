import { describe, it, expect } from 'vitest';
import { convert, convertBatch, ratioToPrice, BASE_INPUT_PRICE } from './ratioConverter';
import type { ModelPrice } from '@newapi-sync/shared';

describe('ratioConverter', () => {
  describe('convert', () => {
    it('converts gpt-4o prices correctly (input $2.5, output $10)', () => {
      const price: ModelPrice = {
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        provider: 'openai',
        inputPricePerMillion: 2.5,
        outputPricePerMillion: 10,
      };

      const result = convert(price);

      expect(result.modelId).toBe('gpt-4o');
      // modelRatio = 2.5 / 0.75 = 3.333333
      expect(result.modelRatio).toBeCloseTo(2.5 / 0.75, 6);
      // completionRatio = 10 / 2.5 = 4
      expect(result.completionRatio).toBe(4);
    });

    it('converts gpt-3.5-turbo as baseline (input $0.75, output $2)', () => {
      const price: ModelPrice = {
        modelId: 'gpt-3.5-turbo',
        modelName: 'GPT-3.5 Turbo',
        provider: 'openai',
        inputPricePerMillion: 0.75,
        outputPricePerMillion: 2,
      };

      const result = convert(price);

      expect(result.modelRatio).toBe(1); // baseline
      expect(result.completionRatio).toBeCloseTo(2 / 0.75, 6);
    });

    it('converts claude-3-opus prices (input $15, output $75)', () => {
      const price: ModelPrice = {
        modelId: 'claude-3-opus',
        modelName: 'Claude 3 Opus',
        provider: 'anthropic',
        inputPricePerMillion: 15,
        outputPricePerMillion: 75,
      };

      const result = convert(price);

      expect(result.modelRatio).toBe(20); // 15 / 0.75
      expect(result.completionRatio).toBe(5); // 75 / 15
    });

    it('handles equal input and output prices (completionRatio = 1)', () => {
      const price: ModelPrice = {
        modelId: 'equal-model',
        modelName: 'Equal Model',
        provider: 'test',
        inputPricePerMillion: 3,
        outputPricePerMillion: 3,
      };

      const result = convert(price);

      expect(result.completionRatio).toBe(1);
    });

    it('results have at most 6 decimal places', () => {
      const price: ModelPrice = {
        modelId: 'precision-test',
        modelName: 'Precision Test',
        provider: 'test',
        inputPricePerMillion: 1.123456789,
        outputPricePerMillion: 3.987654321,
      };

      const result = convert(price);

      const modelRatioDecimals = result.modelRatio.toString().split('.')[1]?.length ?? 0;
      const completionRatioDecimals = result.completionRatio.toString().split('.')[1]?.length ?? 0;

      expect(modelRatioDecimals).toBeLessThanOrEqual(6);
      expect(completionRatioDecimals).toBeLessThanOrEqual(6);
    });
  });

  describe('convertBatch', () => {
    it('converts multiple prices', () => {
      const prices: ModelPrice[] = [
        { modelId: 'a', modelName: 'A', provider: 'p', inputPricePerMillion: 0.75, outputPricePerMillion: 1.5 },
        { modelId: 'b', modelName: 'B', provider: 'p', inputPricePerMillion: 3, outputPricePerMillion: 12 },
      ];

      const results = convertBatch(prices);

      expect(results).toHaveLength(2);
      expect(results[0].modelId).toBe('a');
      expect(results[0].modelRatio).toBe(1);
      expect(results[1].modelId).toBe('b');
      expect(results[1].modelRatio).toBe(4);
    });

    it('returns empty array for empty input', () => {
      expect(convertBatch([])).toEqual([]);
    });
  });

  describe('ratioToPrice', () => {
    it('converts baseline ratio back to price', () => {
      const result = ratioToPrice(1, 2);

      expect(result.inputPricePerMillion).toBe(0.75);
      expect(result.outputPricePerMillion).toBe(1.5);
    });

    it('converts gpt-4o-like ratios back', () => {
      // modelRatio ≈ 3.333333, completionRatio = 4
      const result = ratioToPrice(3.333333, 4);

      expect(result.inputPricePerMillion).toBeCloseTo(2.5, 2);
      expect(result.outputPricePerMillion).toBeCloseTo(10, 2);
    });

    it('results have at most 6 decimal places', () => {
      const result = ratioToPrice(3.333333, 2.666667);

      const inputDecimals = result.inputPricePerMillion.toString().split('.')[1]?.length ?? 0;
      const outputDecimals = result.outputPricePerMillion.toString().split('.')[1]?.length ?? 0;

      expect(inputDecimals).toBeLessThanOrEqual(6);
      expect(outputDecimals).toBeLessThanOrEqual(6);
    });
  });

  describe('round-trip conversion accuracy', () => {
    it('gpt-4o round-trip stays within ±0.01', () => {
      const original: ModelPrice = {
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        provider: 'openai',
        inputPricePerMillion: 2.5,
        outputPricePerMillion: 10,
      };

      const ratio = convert(original);
      const restored = ratioToPrice(ratio.modelRatio, ratio.completionRatio);

      expect(Math.abs(restored.inputPricePerMillion - original.inputPricePerMillion)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(restored.outputPricePerMillion - original.outputPricePerMillion)).toBeLessThanOrEqual(0.01);
    });

    it('very small prices round-trip accurately', () => {
      const original: ModelPrice = {
        modelId: 'cheap-model',
        modelName: 'Cheap',
        provider: 'test',
        inputPricePerMillion: 0.01,
        outputPricePerMillion: 0.02,
      };

      const ratio = convert(original);
      const restored = ratioToPrice(ratio.modelRatio, ratio.completionRatio);

      expect(Math.abs(restored.inputPricePerMillion - original.inputPricePerMillion)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(restored.outputPricePerMillion - original.outputPricePerMillion)).toBeLessThanOrEqual(0.01);
    });

    it('very large prices round-trip accurately', () => {
      const original: ModelPrice = {
        modelId: 'expensive-model',
        modelName: 'Expensive',
        provider: 'test',
        inputPricePerMillion: 500,
        outputPricePerMillion: 1500,
      };

      const ratio = convert(original);
      const restored = ratioToPrice(ratio.modelRatio, ratio.completionRatio);

      expect(Math.abs(restored.inputPricePerMillion - original.inputPricePerMillion)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(restored.outputPricePerMillion - original.outputPricePerMillion)).toBeLessThanOrEqual(0.01);
    });
  });

  describe('BASE_INPUT_PRICE', () => {
    it('is 0.75 (GPT-3.5-turbo baseline)', () => {
      expect(BASE_INPUT_PRICE).toBe(0.75);
    });
  });
});
