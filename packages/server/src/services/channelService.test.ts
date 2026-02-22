import { describe, it, expect, vi } from 'vitest';
import type { Channel, ModelPrice } from '@newapi-sync/shared';
import {
  parseChannelModels,
  getChannelsForModel,
  compareChannelPrices,
} from './channelService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChannel(overrides: Partial<Channel> & { id: number; name: string }): Channel {
  return {
    type: 1,
    models: '',
    model_mapping: '',
    status: 1,
    priority: 0,
    ...overrides,
  };
}

function makePrice(modelId: string, input: number, output: number): ModelPrice {
  return {
    modelId,
    modelName: modelId,
    provider: 'test',
    inputPricePerMillion: input,
    outputPricePerMillion: output,
  };
}

// ---------------------------------------------------------------------------
// parseChannelModels
// ---------------------------------------------------------------------------

describe('parseChannelModels', () => {
  it('parses comma-separated models without mapping', () => {
    const ch = makeChannel({ id: 1, name: 'ch1', models: 'gpt-4o,gpt-3.5-turbo' });
    const result = parseChannelModels(ch);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      channelId: 1,
      channelName: 'ch1',
      channelType: 1,
      modelId: 'gpt-4o',
      originalModelId: 'gpt-4o',
    });
    expect(result[1].modelId).toBe('gpt-3.5-turbo');
    expect(result[1].originalModelId).toBe('gpt-3.5-turbo');
  });

  it('applies model_mapping to remap model names', () => {
    const ch = makeChannel({
      id: 2,
      name: 'ch2',
      models: 'my-gpt4,claude-v2',
      model_mapping: JSON.stringify({ 'my-gpt4': 'gpt-4o', 'claude-v2': 'claude-3-opus' }),
    });
    const result = parseChannelModels(ch);

    expect(result).toHaveLength(2);
    expect(result[0].modelId).toBe('gpt-4o');
    expect(result[0].originalModelId).toBe('my-gpt4');
    expect(result[1].modelId).toBe('claude-3-opus');
    expect(result[1].originalModelId).toBe('claude-v2');
  });

  it('keeps original name when model is not in mapping', () => {
    const ch = makeChannel({
      id: 3,
      name: 'ch3',
      models: 'gpt-4o,unmapped-model',
      model_mapping: JSON.stringify({ 'gpt-4o': 'gpt-4o-standard' }),
    });
    const result = parseChannelModels(ch);

    expect(result[0].modelId).toBe('gpt-4o-standard');
    expect(result[1].modelId).toBe('unmapped-model');
    expect(result[1].originalModelId).toBe('unmapped-model');
  });

  it('returns empty array for empty models string', () => {
    const ch = makeChannel({ id: 4, name: 'ch4', models: '' });
    expect(parseChannelModels(ch)).toEqual([]);
  });

  it('returns empty array for whitespace-only models string', () => {
    const ch = makeChannel({ id: 5, name: 'ch5', models: '   ' });
    expect(parseChannelModels(ch)).toEqual([]);
  });

  it('handles invalid model_mapping JSON gracefully', () => {
    const ch = makeChannel({
      id: 6,
      name: 'ch6',
      models: 'gpt-4o',
      model_mapping: '{invalid json}',
    });
    const result = parseChannelModels(ch);

    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe('gpt-4o');
    expect(result[0].originalModelId).toBe('gpt-4o');
  });

  it('handles empty model_mapping string', () => {
    const ch = makeChannel({ id: 7, name: 'ch7', models: 'gpt-4o', model_mapping: '' });
    const result = parseChannelModels(ch);

    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe('gpt-4o');
  });

  it('trims whitespace around model names', () => {
    const ch = makeChannel({ id: 8, name: 'ch8', models: ' gpt-4o , claude-3 ' });
    const result = parseChannelModels(ch);

    expect(result).toHaveLength(2);
    expect(result[0].modelId).toBe('gpt-4o');
    expect(result[1].modelId).toBe('claude-3');
  });
});

// ---------------------------------------------------------------------------
// getChannelsForModel
// ---------------------------------------------------------------------------

describe('getChannelsForModel', () => {
  const channels: Channel[] = [
    makeChannel({ id: 1, name: 'OpenAI Direct', models: 'gpt-4o,gpt-3.5-turbo' }),
    makeChannel({
      id: 2,
      name: 'Azure',
      models: 'azure-gpt4,azure-35',
      model_mapping: JSON.stringify({ 'azure-gpt4': 'gpt-4o', 'azure-35': 'gpt-3.5-turbo' }),
    }),
    makeChannel({ id: 3, name: 'Anthropic', models: 'claude-3-opus,claude-3-sonnet' }),
  ];

  it('returns all channels supporting gpt-4o (direct + mapped)', () => {
    const result = getChannelsForModel(channels, 'gpt-4o');

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.channelId)).toEqual([1, 2]);
    // The Azure channel should show the original name
    expect(result[1].originalModelId).toBe('azure-gpt4');
  });

  it('returns only Anthropic channel for claude-3-opus', () => {
    const result = getChannelsForModel(channels, 'claude-3-opus');

    expect(result).toHaveLength(1);
    expect(result[0].channelId).toBe(3);
  });

  it('returns empty array for unknown model', () => {
    expect(getChannelsForModel(channels, 'nonexistent-model')).toEqual([]);
  });

  it('returns empty array for empty channels list', () => {
    expect(getChannelsForModel([], 'gpt-4o')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// compareChannelPrices
// ---------------------------------------------------------------------------

describe('compareChannelPrices', () => {
  it('marks the cheapest channel for a model', () => {
    const channels: Channel[] = [
      makeChannel({ id: 1, name: 'Expensive', models: 'gpt-4o' }),
      makeChannel({ id: 2, name: 'Cheap', models: 'gpt-4o-mini', model_mapping: JSON.stringify({ 'gpt-4o-mini': 'gpt-4o' }) }),
    ];
    const prices: ModelPrice[] = [
      makePrice('gpt-4o', 5.0, 15.0),
      makePrice('gpt-4o-mini', 0.15, 0.6),
    ];

    const result = compareChannelPrices(channels, prices);

    expect(result).toHaveLength(1);
    const comp = result[0];
    expect(comp.modelId).toBe('gpt-4o');
    expect(comp.channels).toHaveLength(2);

    // Channel 2 maps gpt-4o-mini → gpt-4o, and gpt-4o-mini is cheaper
    const cheapChannel = comp.channels.find((c) => c.channelId === 2)!;
    expect(cheapChannel.isCheapest).toBe(true);
    expect(cheapChannel.upstreamInputPrice).toBe(0.15);

    const expensiveChannel = comp.channels.find((c) => c.channelId === 1)!;
    expect(expensiveChannel.isCheapest).toBe(false);
  });

  it('handles channels with no upstream price match', () => {
    const channels: Channel[] = [
      makeChannel({ id: 1, name: 'ch1', models: 'custom-model' }),
    ];
    const prices: ModelPrice[] = []; // no prices

    const result = compareChannelPrices(channels, prices);

    expect(result).toHaveLength(1);
    expect(result[0].channels[0].upstreamInputPrice).toBeUndefined();
    expect(result[0].channels[0].isCheapest).toBe(false);
  });

  it('returns empty array for empty channels', () => {
    const prices: ModelPrice[] = [makePrice('gpt-4o', 5, 15)];
    expect(compareChannelPrices([], prices)).toEqual([]);
  });

  it('handles multiple models across channels', () => {
    const channels: Channel[] = [
      makeChannel({ id: 1, name: 'ch1', models: 'gpt-4o,claude-3-opus' }),
      makeChannel({ id: 2, name: 'ch2', models: 'gpt-4o' }),
    ];
    const prices: ModelPrice[] = [
      makePrice('gpt-4o', 5, 15),
      makePrice('claude-3-opus', 15, 75),
    ];

    const result = compareChannelPrices(channels, prices);

    // Should have 2 comparisons: gpt-4o and claude-3-opus
    expect(result).toHaveLength(2);

    const gpt4oComp = result.find((r) => r.modelId === 'gpt-4o')!;
    expect(gpt4oComp.channels).toHaveLength(2);

    const claudeComp = result.find((r) => r.modelId === 'claude-3-opus')!;
    expect(claudeComp.channels).toHaveLength(1);
  });

  it('when all channels have same price, first one is cheapest', () => {
    const channels: Channel[] = [
      makeChannel({ id: 1, name: 'ch1', models: 'gpt-4o' }),
      makeChannel({ id: 2, name: 'ch2', models: 'gpt-4o' }),
    ];
    const prices: ModelPrice[] = [makePrice('gpt-4o', 5, 15)];

    const result = compareChannelPrices(channels, prices);

    expect(result).toHaveLength(1);
    const comp = result[0];
    // First channel encountered with the min price wins
    const cheapest = comp.channels.filter((c) => c.isCheapest);
    expect(cheapest).toHaveLength(1);
    expect(comp.cheapestChannelId).toBe(cheapest[0].channelId);
  });
});
