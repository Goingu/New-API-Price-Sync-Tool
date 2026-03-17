import axios from 'axios';
import type {
  Channel,
  ChannelModelInfo,
  ChannelPriceComparison,
  ChannelModelPrice,
  ModelPrice,
} from '@newapi-sync/shared';

/**
 * Result of adding models to a channel.
 */
export interface AddModelsResult {
  success: boolean;
  addedCount?: number;
  message?: string;
  error?: string;
  errors?: string[];
}

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

/**
 * Custom error class for channel-related errors with HTTP status codes.
 */
export class ChannelError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ChannelError';
  }
}

/**
 * Log error with context for debugging.
 */
function logError(message: string, context: Record<string, unknown>): void {
  console.error(`[ChannelService Error] ${message}`, {
    timestamp: new Date().toISOString(),
    ...context,
  });
}

/**
 * Validate that a channel exists in the New API instance.
 * @returns The channel if it exists
 * @throws ChannelError if channel not found or request fails
 */
export async function validateChannelExists(
  targetUrl: string,
  apiKey: string,
  userId: string | undefined,
  channelId: number
): Promise<Channel> {
  const apiBaseUrl = `${targetUrl.replace(/\/+$/, '')}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (userId) {
    headers['New-Api-User'] = userId;
  }

  try {
    const channelResponse = await axios.get(
      `${apiBaseUrl}/api/channel/${channelId}`,
      { headers, timeout: 30_000 }
    );

    if (!channelResponse.data || !channelResponse.data.data) {
      const error = new ChannelError(
        `Channel not found: ${channelId}`,
        404,
        { channelId, targetUrl }
      );
      logError(error.message, error.context!);
      throw error;
    }

    return channelResponse.data.data;
  } catch (error) {
    if (error instanceof ChannelError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const context = { channelId, targetUrl, userId };

      if (error.response?.status === 404) {
        const channelError = new ChannelError(
          `Channel not found: ${channelId}`,
          404,
          context
        );
        logError(channelError.message, channelError.context!);
        throw channelError;
      }

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        const timeoutError = new ChannelError(
          'Connection timeout while validating channel',
          504,
          context
        );
        logError(timeoutError.message, timeoutError.context!);
        throw timeoutError;
      }

      if (error.response?.status && error.response.status >= 500) {
        const unavailableError = new ChannelError(
          'API service unavailable',
          502,
          { ...context, upstreamStatus: error.response.status }
        );
        logError(unavailableError.message, unavailableError.context!);
        throw unavailableError;
      }

      logError('Unexpected error validating channel', { ...context, error: error.message });
      throw error;
    }

    throw error;
  }
}

/**
 * Validate that all model IDs exist in the system.
 * Note: Current implementation validates model ID format.
 * Future enhancement: fetch available models and validate against them.
 * @returns true if all models exist
 * @throws ChannelError if any model IDs are invalid
 */
export async function validateModelsExist(
  targetUrl: string,
  apiKey: string,
  userId: string | undefined,
  modelIds: string[]
): Promise<boolean> {
  // Validate model ID format
  const invalidModels = modelIds.filter(
    (id) => typeof id !== 'string' || id.trim().length === 0
  );

  if (invalidModels.length > 0) {
    const error = new ChannelError(
      `Invalid model IDs: ${invalidModels.join(', ')}`,
      400,
      { invalidModels, targetUrl, userId }
    );
    logError(error.message, error.context!);
    throw error;
  }

  // TODO: Implement actual model validation by fetching available models
  // For now, we assume all non-empty model IDs are valid
  return true;
}

/**
 * Check for duplicate models in the channel.
 * @returns Array of duplicate model IDs
 */
export function checkDuplicates(
  existingModels: string[],
  newModelIds: string[]
): string[] {
  return newModelIds.filter((modelId) => existingModels.includes(modelId));
}

/**
 * Parse existing models from a channel and merge with new model IDs.
 * @returns Updated models string (comma-separated)
 */
export function parseAndMergeModels(
  channel: Channel,
  newModelIds: string[]
): string {
  const existingModels = channel.models
    ? channel.models.split(',').map((m) => m.trim()).filter((m) => m.length > 0)
    : [];

  const updatedModels = [...existingModels, ...newModelIds];
  return updatedModels.join(',');
}

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Update channel models with retry logic for concurrent operations.
 * Implements exponential backoff retry (100ms, 200ms, 400ms) for up to 3 attempts.
 * Handles optimistic lock failures (409 status) by retrying.
 * Handles connection timeouts (504) and API unavailable (502) with retry.
 * 
 * @param targetUrl - The New API instance URL
 * @param apiKey - API key for authentication
 * @param userId - Optional user ID for multi-tenant scenarios
 * @param channelId - The channel ID to update
 * @param updatedModelsString - The updated comma-separated models string
 * @param channel - The current channel data
 * @returns void on success
 * @throws ChannelError with appropriate status code on failure
 */
async function updateChannelModels(
  targetUrl: string,
  apiKey: string,
  userId: string | undefined,
  channelId: number,
  updatedModelsString: string,
  channel: Channel
): Promise<void> {
  const apiBaseUrl = `${targetUrl.replace(/\/+$/, '')}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (userId) {
    headers['New-Api-User'] = userId;
  }

  const updatePayload = {
    ...channel,
    models: updatedModelsString,
  };

  const maxRetries = 3;
  const backoffDelays = [100, 200, 400]; // Exponential backoff in milliseconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await axios.put(
        `${apiBaseUrl}/api/channel/${channelId}`,
        updatePayload,
        { headers, timeout: 30_000 }
      );
      
      // Success - return immediately
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const context = {
        channelId,
        targetUrl,
        userId,
        attempt: attempt + 1,
        maxRetries,
      };

      if (axios.isAxiosError(error)) {
        const isConflict = error.response?.status === 409;
        const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
        const isServerError = error.response?.status && error.response.status >= 500;

        // Retry for transient errors (conflict, timeout, server errors)
        const shouldRetry = (isConflict || isTimeout || isServerError) && !isLastAttempt;

        if (shouldRetry) {
          const delay = backoffDelays[attempt];
          
          if (isConflict) {
            logError('Optimistic lock failure, retrying...', context);
            await sleep(delay);
            
            // Refetch the channel to get the latest version before retrying
            try {
              const latestChannel = await validateChannelExists(targetUrl, apiKey, userId, channelId);
              updatePayload.models = latestChannel.models;
              // Re-merge the models with the latest channel state
              const existingModels = latestChannel.models
                ? latestChannel.models.split(',').map((m) => m.trim()).filter((m) => m.length > 0)
                : [];
              const newModels = updatedModelsString.split(',').map((m) => m.trim()).filter((m) => m.length > 0);
              const mergedModels = [...new Set([...existingModels, ...newModels])];
              updatePayload.models = mergedModels.join(',');
            } catch (refetchError) {
              // If refetch fails, throw the original error
              if (refetchError instanceof ChannelError) {
                throw refetchError;
              }
              throw error;
            }
          } else if (isTimeout) {
            logError('Connection timeout, retrying...', context);
            await sleep(delay);
          } else if (isServerError) {
            logError('API service unavailable, retrying...', { ...context, upstreamStatus: error.response?.status });
            await sleep(delay);
          }
          
          continue; // Retry
        }

        // Last attempt failed or non-retryable error
        if (isConflict) {
          const conflictError = new ChannelError(
            'Channel was modified by another operation. All retry attempts failed.',
            409,
            context
          );
          logError(conflictError.message, conflictError.context!);
          throw conflictError;
        }

        if (isTimeout) {
          const timeoutError = new ChannelError(
            'Connection timeout while updating channel. All retry attempts failed.',
            504,
            context
          );
          logError(timeoutError.message, timeoutError.context!);
          throw timeoutError;
        }

        if (isServerError) {
          const unavailableError = new ChannelError(
            'API service unavailable. All retry attempts failed.',
            502,
            { ...context, upstreamStatus: error.response?.status }
          );
          logError(unavailableError.message, unavailableError.context!);
          throw unavailableError;
        }

        // Other axios errors
        const axiosError = new ChannelError(
          error.response?.data?.message ?? error.message,
          error.response?.status ?? 500,
          context
        );
        logError(axiosError.message, axiosError.context!);
        throw axiosError;
      }

      // Non-axios errors
      const message = error instanceof Error ? error.message : String(error);
      const genericError = new ChannelError(
        `Failed to update channel: ${message}`,
        500,
        context
      );
      logError(genericError.message, genericError.context!);
      throw genericError;
    }
  }

  // Should never reach here, but TypeScript needs this
  const exhaustedError = new ChannelError(
    'Update failed after all retry attempts',
    500,
    { channelId, targetUrl, userId, maxRetries }
  );
  logError(exhaustedError.message, exhaustedError.context!);
  throw exhaustedError;
}

/**
 * Add models to a channel with validation and transaction safety.
 * 
 * Transaction Safety (Requirements 8.2, 8.3):
 * - All validations are performed before any database modifications
 * - All model additions are wrapped in a single atomic PUT request
 * - If any validation fails, no changes are made (automatic rollback)
 * - If the PUT request fails, the operation is retried up to 3 times
 * - Supports up to 100 models in a single operation (Requirement 8.1)
 * 
 * Validates channel existence, checks for duplicates, and updates the channel.
 */
export async function addModelsToChannel(
  targetUrl: string,
  apiKey: string,
  userId: string | undefined,
  channelId: number,
  modelIds: string[]
): Promise<AddModelsResult> {
  const context = { channelId, targetUrl, userId, modelIds };

  try {
    // Validate empty selection
    if (!modelIds || modelIds.length === 0) {
      const error = new ChannelError(
        'No models selected',
        400,
        context
      );
      logError(error.message, error.context!);
      return {
        success: false,
        error: error.message,
      };
    }

    // Validate bulk operation limit (Requirement 8.1)
    if (modelIds.length > 100) {
      const error = new ChannelError(
        `Bulk operation limit exceeded: cannot add more than 100 models in a single operation (attempted: ${modelIds.length})`,
        400,
        { ...context, limit: 100, attempted: modelIds.length }
      );
      logError(error.message, error.context!);
      return {
        success: false,
        error: error.message,
      };
    }

    // Validate channel exists
    const channel = await validateChannelExists(targetUrl, apiKey, userId, channelId);

    // Validate models exist (throws ChannelError if invalid)
    await validateModelsExist(targetUrl, apiKey, userId, modelIds);

    // Parse existing models
    const existingModels = channel.models
      ? channel.models.split(',').map((m) => m.trim()).filter((m) => m.length > 0)
      : [];

    // Check for duplicates
    const duplicates = checkDuplicates(existingModels, modelIds);
    if (duplicates.length > 0) {
      const error = new ChannelError(
        `Duplicate models detected: ${duplicates.join(', ')}`,
        409,
        { ...context, duplicates }
      );
      logError(error.message, error.context!);
      return {
        success: false,
        error: error.message,
        errors: duplicates.map((id) => `${id} already associated with channel`),
      };
    }

    // Merge models
    const updatedModelsString = parseAndMergeModels(channel, modelIds);

    // Update the channel with retry logic (throws ChannelError on failure)
    await updateChannelModels(
      targetUrl,
      apiKey,
      userId,
      channelId,
      updatedModelsString,
      channel
    );

    return {
      success: true,
      addedCount: modelIds.length,
      message: `Successfully added ${modelIds.length} model${modelIds.length > 1 ? 's' : ''} to channel`,
    };
  } catch (error) {
    // Handle ChannelError with proper status codes
    if (error instanceof ChannelError) {
      return {
        success: false,
        error: error.message,
      };
    }

    // Handle unexpected errors
    const message = error instanceof Error ? error.message : String(error);
    const unexpectedError = new ChannelError(
      `Unexpected error: ${message}`,
      500,
      context
    );
    logError(unexpectedError.message, unexpectedError.context!);
    
    return {
      success: false,
      error: unexpectedError.message,
    };
  }
}
