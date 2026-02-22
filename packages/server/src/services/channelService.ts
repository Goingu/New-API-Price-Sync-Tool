import axios from 'axios';
import type {
  Channel,
  ChannelModelInfo,
  ChannelPriceComparison,
  ChannelModelPrice,
  ModelPrice,
} from '@newapi-sync/shared';

/**
 * Fetch the channel list from a New API instance.
 */
export async function fetchChannels(targetUrl: string, apiKey: string): Promise<Channel[]> {
  const url = `${targetUrl.replace(/\/+$/, '')}/api/channel/`;
  const { data } = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'New-Api-User': apiKey,
    },
    timeout: 30_000,
  });

  // New API wraps the list in { success, data } or returns the array directly
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  return [];
}

/**
 * Parse a channel's model list and model_mapping into ChannelModelInfo[].
 *
 * - `channel.models` is a comma-separated string of model names.
 * - `channel.model_mapping` is a JSON string like `{"internal-name": "standard-name"}`.
 *   For each model in the channel, if it appears as a key in the mapping,
 *   the mapped value becomes `modelId` and the original becomes `originalModelId`.
 *   Otherwise both are the same.
 */
export function parseChannelModels(channel: Channel): ChannelModelInfo[] {
  if (!channel.models || channel.models.trim() === '') return [];

  let mapping: Record<string, string> = {};
  if (channel.model_mapping && channel.model_mapping.trim() !== '') {
    try {
      const parsed = JSON.parse(channel.model_mapping);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        mapping = parsed;
      }
    } catch {
      // Invalid JSON — skip mapping, use original names
    }
  }

  const modelNames = channel.models
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  return modelNames.map((originalModelId) => {
    const modelId = mapping[originalModelId] ?? originalModelId;
    return {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      modelId,
      originalModelId,
    };
  });
}

/**
 * Return all channels that support a given standard model name.
 * Each channel's models are parsed through its model_mapping first.
 */
export function getChannelsForModel(
  channels: Channel[],
  modelId: string,
): ChannelModelInfo[] {
  const results: ChannelModelInfo[] = [];
  for (const channel of channels) {
    const models = parseChannelModels(channel);
    for (const info of models) {
      if (info.modelId === modelId) {
        results.push(info);
      }
    }
  }
  return results;
}

/**
 * Compare prices across multiple channels for every unique model.
 *
 * For each unique standard modelId found across all channels:
 * 1. Collect every channel that supports it.
 * 2. Try to match with upstream prices by modelId.
 * 3. Mark the channel with the lowest upstream input price as `isCheapest`.
 */
export function compareChannelPrices(
  channels: Channel[],
  upstreamPrices: ModelPrice[],
): ChannelPriceComparison[] {
  // Build a lookup: modelId → ModelPrice
  const priceMap = new Map<string, ModelPrice>();
  for (const p of upstreamPrices) {
    priceMap.set(p.modelId, p);
  }

  // Collect all channel-model pairs grouped by standard modelId
  const modelChannelsMap = new Map<string, ChannelModelInfo[]>();
  for (const channel of channels) {
    const models = parseChannelModels(channel);
    for (const info of models) {
      let list = modelChannelsMap.get(info.modelId);
      if (!list) {
        list = [];
        modelChannelsMap.set(info.modelId, list);
      }
      list.push(info);
    }
  }

  const comparisons: ChannelPriceComparison[] = [];

  for (const [modelId, infos] of modelChannelsMap) {
    const upstreamPrice = priceMap.get(modelId);

    // Build ChannelModelPrice entries
    const channelPrices: ChannelModelPrice[] = infos.map((info) => ({
      channelId: info.channelId,
      channelName: info.channelName,
      modelId: info.modelId,
      originalModelId: info.originalModelId,
      upstreamInputPrice: upstreamPrice?.inputPricePerMillion,
      upstreamOutputPrice: upstreamPrice?.outputPricePerMillion,
      isCheapest: false,
    }));

    // Find the cheapest channel by upstream input price
    let cheapestId = channelPrices[0]?.channelId ?? -1;

    if (upstreamPrice) {
      // All channels share the same upstream price for the same modelId,
      // but different channels may map different original models to the same
      // standard modelId, so the upstream price lookup is per-originalModelId too.
      // However, the design says to match by standard modelId, so all channels
      // for the same modelId get the same upstream price.
      // "Cheapest" still makes sense when channels map different original models
      // to the same standard name — we compare by the upstream price of the
      // *original* model if available, falling back to the standard modelId price.

      let minPrice = Infinity;
      for (const cp of channelPrices) {
        // Try to find upstream price for the original model name first
        const origPrice = priceMap.get(cp.originalModelId);
        if (origPrice) {
          cp.upstreamInputPrice = origPrice.inputPricePerMillion;
          cp.upstreamOutputPrice = origPrice.outputPricePerMillion;
        }

        const price = cp.upstreamInputPrice;
        if (price !== undefined && price < minPrice) {
          minPrice = price;
          cheapestId = cp.channelId;
        }
      }

      // Mark cheapest
      for (const cp of channelPrices) {
        if (cp.channelId === cheapestId && cp.upstreamInputPrice !== undefined) {
          cp.isCheapest = true;
        }
      }
    }

    comparisons.push({
      modelId,
      channels: channelPrices,
      cheapestChannelId: cheapestId,
    });
  }

  return comparisons;
}
