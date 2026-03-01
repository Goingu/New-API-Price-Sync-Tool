import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateEffectiveUnitCost, assignPrioritiesForGroup, groupChannelsByModel, calculatePriorities } from './priorityEngine';
import type { Channel, ModelGroupEntry, PriorityRule, RatioConfig } from '@newapi-sync/shared';

describe('PriorityEngine', () => {
  // Feature: auto-channel-priority, Property 3: 综合单位成本公式正确性
  // **Validates: Requirements 1.7, 2.2**
  describe('Property 3: 综合单位成本公式正确性', () => {
    it('calculateEffectiveUnitCost should equal modelRatio × (1 / channelPriceRate) for any positive inputs', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.001, max: 1e6, noNaN: true }),
          fc.double({ min: 0.001, max: 1e6, noNaN: true }),
          (modelRatio, channelPriceRate) => {
            const result = calculateEffectiveUnitCost(modelRatio, channelPriceRate);
            const expected = modelRatio * (1 / channelPriceRate);
            expect(result).toBeCloseTo(expected, 10);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('within a model group, assignPrioritiesForGroup output should be sorted by Effective_Unit_Cost ascending', () => {
      // Arbitrary for a model group entry
      const modelGroupEntryArb = (modelId: string) =>
        fc.record({
          channelId: fc.integer({ min: 1, max: 10000 }),
          channelName: fc.string({ minLength: 1, maxLength: 20 }),
          modelId: fc.constant(modelId),
          modelRatio: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
          priceRate: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
          effectiveUnitCost: fc.constant(0), // will be computed
          currentPriority: fc.integer({ min: 1, max: 1000 }),
        }) as fc.Arbitrary<ModelGroupEntry>;

      const ruleArb: fc.Arbitrary<PriorityRule> = fc.record({
        startValue: fc.integer({ min: 10, max: 1000 }),
        step: fc.integer({ min: 1, max: 100 }),
      });

      fc.assert(
        fc.property(
          fc.array(modelGroupEntryArb('test-model'), { minLength: 1, maxLength: 20 }),
          ruleArb,
          (group, rule) => {
            // Pre-compute effectiveUnitCost for each entry
            const enrichedGroup: ModelGroupEntry[] = group.map((entry) => ({
              ...entry,
              effectiveUnitCost: calculateEffectiveUnitCost(entry.modelRatio, entry.priceRate),
            }));

            const assignments = assignPrioritiesForGroup(enrichedGroup, rule);

            // Verify output is sorted by effectiveUnitCost ascending
            for (let i = 1; i < assignments.length; i++) {
              expect(assignments[i].effectiveUnitCost).toBeGreaterThanOrEqual(
                assignments[i - 1].effectiveUnitCost,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// Feature: auto-channel-priority, Property 5: 优先级分配递减且遵循规则参数
describe('Property 5: 优先级分配递减且遵循规则参数', () => {
  const modelGroupEntryArb = fc.record({
    channelId: fc.integer({ min: 1, max: 10000 }),
    channelName: fc.string({ minLength: 1, maxLength: 20 }),
    modelId: fc.constant('test-model'),
    modelRatio: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
    priceRate: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
    effectiveUnitCost: fc.constant(0),
    currentPriority: fc.integer({ min: 1, max: 1000 }),
  }) as fc.Arbitrary<ModelGroupEntry>;

  const ruleArb: fc.Arbitrary<PriorityRule> = fc.record({
    startValue: fc.integer({ min: 1, max: 1000 }),
    step: fc.integer({ min: 1, max: 100 }),
  });

  it('assigned priorities should follow max(startValue - i * step, 1) for i from 0 to N-1', () => {
    fc.assert(
      fc.property(
        fc.array(modelGroupEntryArb, { minLength: 1, maxLength: 30 }),
        ruleArb,
        (group, rule) => {
          const enrichedGroup: ModelGroupEntry[] = group.map((entry) => ({
            ...entry,
            effectiveUnitCost: calculateEffectiveUnitCost(entry.modelRatio, entry.priceRate),
          }));

          const assignments = assignPrioritiesForGroup(enrichedGroup, rule);

          for (let i = 0; i < assignments.length; i++) {
            const expected = Math.max(rule.startValue - i * rule.step, 1);
            expect(assignments[i].assignedPriority).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all assigned priority values should be >= 1', () => {
    fc.assert(
      fc.property(
        fc.array(modelGroupEntryArb, { minLength: 1, maxLength: 30 }),
        ruleArb,
        (group, rule) => {
          const enrichedGroup: ModelGroupEntry[] = group.map((entry) => ({
            ...entry,
            effectiveUnitCost: calculateEffectiveUnitCost(entry.modelRatio, entry.priceRate),
          }));

          const assignments = assignPrioritiesForGroup(enrichedGroup, rule);

          for (const a of assignments) {
            expect(a.assignedPriority).toBeGreaterThanOrEqual(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('assigned priority values should be non-increasing (decreasing or equal)', () => {
    fc.assert(
      fc.property(
        fc.array(modelGroupEntryArb, { minLength: 2, maxLength: 30 }),
        ruleArb,
        (group, rule) => {
          const enrichedGroup: ModelGroupEntry[] = group.map((entry) => ({
            ...entry,
            effectiveUnitCost: calculateEffectiveUnitCost(entry.modelRatio, entry.priceRate),
          }));

          const assignments = assignPrioritiesForGroup(enrichedGroup, rule);

          for (let i = 1; i < assignments.length; i++) {
            expect(assignments[i].assignedPriority).toBeLessThanOrEqual(
              assignments[i - 1].assignedPriority,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: auto-channel-priority, Property 6: 等成本渠道保持原有顺序
describe('Property 6: 等成本渠道保持原有顺序', () => {
  it('channels with the same Effective_Unit_Cost should be ordered by currentPriority descending', () => {
    // **Validates: Requirements 2.4**
    // Generate groups where all entries share the same modelRatio and priceRate
    // (thus the same effectiveUnitCost), but have distinct currentPriority values.
    const sharedCostArb = fc.record({
      modelRatio: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
      priceRate: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
    });

    const ruleArb: fc.Arbitrary<PriorityRule> = fc.record({
      startValue: fc.integer({ min: 10, max: 1000 }),
      step: fc.integer({ min: 1, max: 100 }),
    });

    fc.assert(
      fc.property(
        sharedCostArb,
        // Generate 2-20 distinct currentPriority values
        fc.array(fc.integer({ min: 1, max: 100000 }), { minLength: 2, maxLength: 20 })
          .map((priorities) => [...new Set(priorities)])
          .filter((priorities) => priorities.length >= 2),
        ruleArb,
        (sharedCost, distinctPriorities, rule) => {
          const sharedEffectiveUnitCost = calculateEffectiveUnitCost(
            sharedCost.modelRatio,
            sharedCost.priceRate,
          );

          const group: ModelGroupEntry[] = distinctPriorities.map((priority, i) => ({
            channelId: i + 1,
            channelName: `ch-${i + 1}`,
            modelId: 'test-model',
            modelRatio: sharedCost.modelRatio,
            priceRate: sharedCost.priceRate,
            effectiveUnitCost: sharedEffectiveUnitCost,
            currentPriority: priority,
          }));

          const assignments = assignPrioritiesForGroup(group, rule);

          // All entries have the same effectiveUnitCost, so the output order
          // should be sorted by currentPriority descending (higher first).
          for (let i = 1; i < assignments.length; i++) {
            const prevChannelId = assignments[i - 1].channelId;
            const currChannelId = assignments[i].channelId;
            const prevOriginalPriority = group.find((e) => e.channelId === prevChannelId)!
              .currentPriority;
            const currOriginalPriority = group.find((e) => e.channelId === currChannelId)!
              .currentPriority;
            expect(prevOriginalPriority).toBeGreaterThan(currOriginalPriority);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: auto-channel-priority, Property 2: 费率删除排除计算
describe('Property 2: 费率删除排除计算', () => {
  // **Validates: Requirements 1.4, 2.5**

  /** Arbitrary for a Channel with one or more comma-separated models */
  const channelArb = (id: number) =>
    fc.record({
      id: fc.constant(id),
      name: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `ch-${id}-${s}`),
      type: fc.integer({ min: 1, max: 5 }),
      models: fc
        .array(fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/), { minLength: 1, maxLength: 5 })
        .map((arr) => [...new Set(arr)].filter((m) => m.length > 0))
        .filter((arr) => arr.length > 0)
        .map((arr) => arr.join(',')),
      model_mapping: fc.constant(''),
      status: fc.constant(1),
      priority: fc.integer({ min: 1, max: 1000 }),
    }) as fc.Arbitrary<Channel>;

  it('channels whose price rate is deleted (absent from priceRates) should not appear in any model group', () => {
    fc.assert(
      fc.property(
        // Generate 2-10 channels with unique IDs
        fc.integer({ min: 2, max: 10 }).chain((n) => {
          const channels = fc.tuple(
            ...Array.from({ length: n }, (_, i) => channelArb(i + 1)),
          );
          // Pick a non-empty subset of channel indices to EXCLUDE from priceRates (simulate deletion)
          const excludedIndices = fc
            .subarray(
              Array.from({ length: n }, (_, i) => i),
              { minLength: 1, maxLength: n },
            );
          return fc.tuple(channels, excludedIndices);
        }),
        ([channels, excludedIndices]) => {
          const excludedIds = new Set(excludedIndices.map((i) => channels[i].id));

          // Build priceRates map only for channels NOT excluded
          const priceRates = new Map<number, number>();
          for (const ch of channels) {
            if (!excludedIds.has(ch.id)) {
              priceRates.set(ch.id, 1 + Math.random() * 10); // arbitrary positive rate
            }
          }

          const groups = groupChannelsByModel(channels, priceRates);

          // Collect all channel IDs that appear in any model group
          const groupedChannelIds = new Set<number>();
          for (const [, entries] of groups) {
            for (const entry of entries) {
              groupedChannelIds.add(entry.channelId);
            }
          }

          // Excluded channels must NOT appear in any group
          for (const excludedId of excludedIds) {
            expect(groupedChannelIds.has(excludedId)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('only channels with configured price rates should appear in the grouping results', () => {
    fc.assert(
      fc.property(
        // Generate 2-10 channels with unique IDs
        fc.integer({ min: 2, max: 10 }).chain((n) => {
          const channels = fc.tuple(
            ...Array.from({ length: n }, (_, i) => channelArb(i + 1)),
          );
          // Pick a non-empty proper subset to INCLUDE in priceRates
          const includedIndices = fc
            .subarray(
              Array.from({ length: n }, (_, i) => i),
              { minLength: 1, maxLength: n - 1 },
            )
            .filter((arr) => arr.length > 0 && arr.length < n);
          return fc.tuple(channels, includedIndices);
        }),
        ([channels, includedIndices]) => {
          const includedIds = new Set(includedIndices.map((i) => channels[i].id));

          // Build priceRates map only for included channels
          const priceRates = new Map<number, number>();
          for (const ch of channels) {
            if (includedIds.has(ch.id)) {
              priceRates.set(ch.id, 1 + Math.random() * 10);
            }
          }

          const groups = groupChannelsByModel(channels, priceRates);

          // Every channel that appears in a group must have a configured price rate
          for (const [, entries] of groups) {
            for (const entry of entries) {
              expect(priceRates.has(entry.channelId)).toBe(true);
            }
          }

          // No channel without a price rate should appear
          const groupedChannelIds = new Set<number>();
          for (const [, entries] of groups) {
            for (const entry of entries) {
              groupedChannelIds.add(entry.channelId);
            }
          }
          for (const ch of channels) {
            if (!includedIds.has(ch.id)) {
              expect(groupedChannelIds.has(ch.id)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: auto-channel-priority, Property 11: 无变更时不执行更新
describe('Property 11: 无变更时不执行更新', () => {
  // **Validates: Requirements 6.3**
  // When calculatePriorities produces a result where all channels have changed === false
  // (newPriority === oldPriority), then changedChannels must be 0.
  //
  // Strategy: generate channels sharing a single model, compute what priorities the engine
  // would assign, then set each channel's current priority to that value. Running
  // calculatePriorities again should yield changedChannels === 0.

  it('changedChannels should be 0 when all channels already have the correct priority', () => {
    const ruleArb: fc.Arbitrary<PriorityRule> = fc.record({
      startValue: fc.integer({ min: 10, max: 1000 }),
      step: fc.integer({ min: 1, max: 100 }),
    });

    // Generate 1-10 distinct positive price rates (sorted descending so the ordering is deterministic)
    const priceRatesArb = fc
      .array(fc.double({ min: 0.01, max: 1e4, noNaN: true }), { minLength: 1, maxLength: 10 })
      .map((rates) => {
        // Deduplicate by rounding to avoid floating-point collisions
        const unique = [...new Set(rates.map((r) => Math.round(r * 1000) / 1000))].filter((r) => r > 0);
        return unique.length > 0 ? unique : [1];
      });

    const modelRatioArb = fc.double({ min: 0.01, max: 1e4, noNaN: true });

    fc.assert(
      fc.property(ruleArb, priceRatesArb, modelRatioArb, (rule, priceRateValues, modelRatio) => {
        const modelId = 'test-model';
        const n = priceRateValues.length;

        // Build initial channels with arbitrary priority (e.g., 1) and a single shared model
        const initialChannels: Channel[] = priceRateValues.map((rate, i) => ({
          id: i + 1,
          name: `ch-${i + 1}`,
          type: 1,
          models: modelId,
          model_mapping: '',
          status: 1,
          priority: 1, // placeholder — will be corrected below
        }));

        const priceRates = new Map<number, number>();
        for (let i = 0; i < n; i++) {
          priceRates.set(i + 1, priceRateValues[i]);
        }

        const ratioConfig: RatioConfig = {
          modelRatio: { [modelId]: modelRatio },
          completionRatio: {},
        };

        // First pass: compute what priorities the engine assigns
        const firstResult = calculatePriorities(initialChannels, ratioConfig, priceRates, rule);

        // Build "already-correct" channels whose priority matches the engine's output
        const correctedChannels: Channel[] = initialChannels.map((ch) => {
          const found = firstResult.channels.find((r) => r.channelId === ch.id);
          return { ...ch, priority: found ? found.newPriority : ch.priority };
        });

        // Second pass: with corrected priorities, nothing should change
        const secondResult = calculatePriorities(correctedChannels, ratioConfig, priceRates, rule);

        // All channels should have changed === false
        for (const ch of secondResult.channels) {
          expect(ch.changed).toBe(false);
        }

        // changedChannels must be 0
        expect(secondResult.changedChannels).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: auto-channel-priority, Property 12: 最低成本渠道识别
describe('Property 12: 最低成本渠道识别', () => {
  // **Validates: Requirements 7.5**
  // For any model group, the channel(s) with the lowest Effective_Unit_Cost
  // should be identified as optimal — they receive the highest priority values
  // (starting from startValue). If multiple channels share the same lowest cost,
  // all of them should be at the top of the sorted result.

  const ruleArb: fc.Arbitrary<PriorityRule> = fc.record({
    startValue: fc.integer({ min: 10, max: 1000 }),
    step: fc.integer({ min: 1, max: 100 }),
  });

  it('the channel with the lowest Effective_Unit_Cost should receive the highest priority (startValue)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            channelId: fc.integer({ min: 1, max: 10000 }),
            channelName: fc.string({ minLength: 1, maxLength: 20 }),
            modelId: fc.constant('test-model'),
            modelRatio: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
            priceRate: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
            effectiveUnitCost: fc.constant(0),
            currentPriority: fc.integer({ min: 1, max: 1000 }),
          }) as fc.Arbitrary<ModelGroupEntry>,
          { minLength: 1, maxLength: 20 },
        ),
        ruleArb,
        (group, rule) => {
          // Enrich with effectiveUnitCost
          const enrichedGroup: ModelGroupEntry[] = group.map((entry) => ({
            ...entry,
            effectiveUnitCost: calculateEffectiveUnitCost(entry.modelRatio, entry.priceRate),
          }));

          const assignments = assignPrioritiesForGroup(enrichedGroup, rule);

          // Find the minimum effectiveUnitCost across all assignments
          const minCost = Math.min(...assignments.map((a) => a.effectiveUnitCost));

          // The first assignment should have the minimum cost and receive startValue
          expect(assignments[0].effectiveUnitCost).toBeCloseTo(minCost, 10);
          expect(assignments[0].assignedPriority).toBe(rule.startValue);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all channels sharing the lowest Effective_Unit_Cost should be grouped at the top of the result', () => {
    // Generate groups where multiple channels share the same lowest cost
    fc.assert(
      fc.property(
        // Shared lowest cost parameters
        fc.record({
          modelRatio: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
          priceRate: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
        }),
        // Number of channels sharing the lowest cost (2-5)
        fc.integer({ min: 2, max: 5 }),
        // Higher-cost channels (0-5)
        fc.array(
          fc.record({
            modelRatio: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
            priceRate: fc.double({ min: 0.001, max: 1e4, noNaN: true }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        ruleArb,
        (lowestCostParams, lowestCount, higherCostParams, rule) => {
          const lowestCost = calculateEffectiveUnitCost(
            lowestCostParams.modelRatio,
            lowestCostParams.priceRate,
          );

          // Build lowest-cost channels (all share the same modelRatio and priceRate)
          const lowestCostEntries: ModelGroupEntry[] = Array.from(
            { length: lowestCount },
            (_, i) => ({
              channelId: i + 1,
              channelName: `low-${i + 1}`,
              modelId: 'test-model',
              modelRatio: lowestCostParams.modelRatio,
              priceRate: lowestCostParams.priceRate,
              effectiveUnitCost: lowestCost,
              currentPriority: 100 - i, // distinct priorities for stable sort
            }),
          );

          // Build higher-cost channels — ensure their cost is strictly higher
          const higherCostEntries: ModelGroupEntry[] = higherCostParams
            .map((params, i) => {
              const cost = calculateEffectiveUnitCost(params.modelRatio, params.priceRate);
              return {
                channelId: lowestCount + i + 1,
                channelName: `high-${i + 1}`,
                modelId: 'test-model',
                modelRatio: params.modelRatio,
                priceRate: params.priceRate,
                effectiveUnitCost: cost,
                currentPriority: 50 - i,
              };
            })
            .filter((entry) => entry.effectiveUnitCost > lowestCost);

          const group = [...lowestCostEntries, ...higherCostEntries];
          if (group.length < 2) return; // need at least 2 channels for meaningful test

          const assignments = assignPrioritiesForGroup(group, rule);

          // All lowest-cost channels should appear at the top of the result
          const topAssignments = assignments.slice(0, lowestCount);
          for (const a of topAssignments) {
            expect(a.effectiveUnitCost).toBeCloseTo(lowestCost, 10);
          }

          // All channels after the lowest-cost group should have strictly higher cost
          const restAssignments = assignments.slice(lowestCount);
          for (const a of restAssignments) {
            expect(a.effectiveUnitCost).toBeGreaterThan(lowestCost);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
