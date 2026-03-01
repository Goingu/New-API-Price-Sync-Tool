/**
 * SplitService - Business service layer for channel splitting operations
 * Coordinates SplitEngine, PriorityEngine, SQLiteStore and New API interactions
 */

import axios from 'axios';
import type {
  ConnectionSettings,
  Channel,
  SplitPreview,
  SplitExecutionOptions,
  SplitExecutionResult,
  SplitHistoryEntry,
  RollbackResult,
  SplitSuggestion,
  SplitConfiguration,
  RatioConfig,
  ParentChannelAction,
} from '@newapi-sync/shared';
import type { SQLiteStore } from './sqliteStore.js';
import {
  generateSplitPreview,
  validateSplitConfig,
} from './splitEngine.js';
import { calculateSplitPriorities } from './priorityEngine.js';
import { generateSplitSuggestions } from './suggestionEngine.js';

/**
 * Fetch the channel list from a New API instance
 */
async function fetchChannels(connection: ConnectionSettings): Promise<Channel[]> {
  const apiBaseUrl = connection.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
  };
  if (connection.userId) {
    headers['New-Api-User'] = connection.userId;
  }

  let channels: Channel[] = [];
  
  try {
    // Try with large page_size to get all channels
    const url = `${apiBaseUrl}/api/channel/?p=0&page_size=500`;
    const { data } = await axios.get(url, { headers, timeout: 30_000 });

    if (Array.isArray(data)) {
      channels = data;
    } else if (data?.data) {
      if (Array.isArray(data.data)) {
        channels = data.data;
      } else if (data.data?.data && Array.isArray(data.data.data)) {
        channels = data.data.data;
      } else if (data.data?.items && Array.isArray(data.data.items)) {
        channels = data.data.items;
      }
    }
  } catch {
    // Fallback: no pagination
    const url = `${apiBaseUrl}/api/channel/`;
    const { data } = await axios.get(url, { headers, timeout: 30_000 });

    if (Array.isArray(data)) {
      channels = data;
    } else if (data?.data) {
      if (Array.isArray(data.data)) {
        channels = data.data;
      } else if (data.data?.data && Array.isArray(data.data.data)) {
        channels = data.data.data;
      } else if (data.data?.items && Array.isArray(data.data.items)) {
        channels = data.data.items;
      }
    }
  }

  console.log(`[SplitService] fetchChannels: got ${channels.length} channels total`);
  return channels;
}

/**
 * Fetch ratio configuration from a New API instance
 */
async function fetchRatioConfig(connection: ConnectionSettings): Promise<RatioConfig> {
  const url = `${connection.baseUrl.replace(/\/+$/, '')}/api/ratio_config`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
  };
  if (connection.userId) {
    headers['New-Api-User'] = connection.userId;
  }

  const { data } = await axios.get(url, { headers, timeout: 30_000 });

  let ratioConfig: RatioConfig;
  if (data?.data) {
    const apiData = data.data;
    ratioConfig = {
      modelRatio: apiData.model_ratio || apiData.modelRatio || {},
      completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
    };
  } else {
    ratioConfig = {
      modelRatio: data.model_ratio || data.modelRatio || {},
      completionRatio: data.completion_ratio || data.completionRatio || {},
    };
  }

  console.log(`[SplitService] fetchRatioConfig: ${Object.keys(ratioConfig.modelRatio).length} model ratios`);
  return ratioConfig;
}

/**
 * Create a new channel on a New API instance
 */
async function createChannel(
  connection: ConnectionSettings,
  channelConfig: Omit<Channel, 'id'>
): Promise<Channel> {
  const url = `${connection.baseUrl.replace(/\/+$/, '')}/api/channel/`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (connection.userId) {
    headers['New-Api-User'] = connection.userId;
  }

  const { data } = await axios.post(url, channelConfig, { headers, timeout: 30_000 });
  
  // New API may wrap the response in { success, data } or return the channel directly
  if (data?.data) {
    return data.data;
  }
  return data;
}

/**
 * Update a channel on a New API instance
 */
async function updateChannel(
  connection: ConnectionSettings,
  channelId: number,
  updates: Partial<Channel>
): Promise<void> {
  const url = `${connection.baseUrl.replace(/\/+$/, '')}/api/channel/`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (connection.userId) {
    headers['New-Api-User'] = connection.userId;
  }

  await axios.put(url, { id: channelId, ...updates }, { headers, timeout: 30_000 });
}

/**
 * Delete a channel on a New API instance
 */
async function deleteChannel(
  connection: ConnectionSettings,
  channelId: number
): Promise<void> {
  const url = `${connection.baseUrl.replace(/\/+$/, '')}/api/channel/${channelId}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
  };
  if (connection.userId) {
    headers['New-Api-User'] = connection.userId;
  }

  await axios.delete(url, { headers, timeout: 30_000 });
}

/**
 * SplitService coordinates channel splitting operations
 */
export class SplitService {
  constructor(private store: SQLiteStore) {}

  /**
   * Generate a split preview showing all sub-channels that will be created
   */
  async preview(
    connection: ConnectionSettings,
    channelIds: number[],
    modelFilters?: Map<number, string[]>
  ): Promise<SplitPreview> {
    console.log(`[SplitService] preview: ${channelIds.length} channels`);
    
    // Fetch all channels from New API
    const allChannels = await fetchChannels(connection);
    
    // Filter to only the requested parent channels
    const parentChannels = allChannels.filter(ch => channelIds.includes(ch.id));
    
    if (parentChannels.length === 0) {
      throw new Error('No valid parent channels found');
    }
    
    // Generate preview using SplitEngine
    const filters = modelFilters || new Map();
    const preview = generateSplitPreview(parentChannels, filters, allChannels);
    
    // Validate the preview
    const validation = validateSplitConfig(preview);
    if (!validation.valid) {
      console.warn(`[SplitService] preview validation errors:`, validation.errors);
    }
    
    console.log(`[SplitService] preview: ${preview.totalSubChannels} sub-channels, ${preview.nameConflicts} conflicts`);
    return preview;
  }

  /**
   * Execute a split operation: create sub-channels, update priorities, handle parent channel
   */
  async execute(
    connection: ConnectionSettings,
    preview: SplitPreview,
    options: SplitExecutionOptions
  ): Promise<SplitExecutionResult> {
    console.log(`[SplitService] execute: ${preview.totalSubChannels} sub-channels, autoPriority=${options.autoPriority}`);
    
    // Validate preview first
    const validation = validateSplitConfig(preview);
    if (!validation.valid) {
      throw new Error(`Invalid split configuration: ${validation.errors.join(', ')}`);
    }
    
    const createdSubChannels: SplitExecutionResult['createdSubChannels'] = [];
    const priorityUpdateResults: SplitExecutionResult['priorityUpdateResults'] = [];
    const parentChannelResults: SplitExecutionResult['parentChannelResults'] = [];
    
    // Step 1: Create all sub-channels
    console.log(`[SplitService] Creating ${preview.subChannels.length} sub-channels...`);
    for (const subChannel of preview.subChannels) {
      try {
        const created = await createChannel(connection, subChannel.config);
        createdSubChannels.push({
          id: created.id,
          name: created.name,
          modelId: subChannel.modelId,
          success: true,
        });
        console.log(`[SplitService] Created sub-channel: ${created.name} (id=${created.id})`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        createdSubChannels.push({
          id: -1,
          name: subChannel.name,
          modelId: subChannel.modelId,
          success: false,
          error: errorMsg,
        });
        console.error(`[SplitService] Failed to create sub-channel ${subChannel.name}:`, errorMsg);
      }
    }
    
    const successfulSubChannels = createdSubChannels.filter(sc => sc.success);
    console.log(`[SplitService] Created ${successfulSubChannels.length}/${preview.subChannels.length} sub-channels`);
    
    // Step 2: Calculate and update priorities if enabled
    if (options.autoPriority && successfulSubChannels.length > 0) {
      console.log(`[SplitService] Calculating priorities for ${successfulSubChannels.length} sub-channels...`);
      
      try {
        // Fetch ratio config and price rates
        const ratioConfig = await fetchRatioConfig(connection);
        const priceRates = new Map<number, number>();
        for (const rate of this.store.getPriceRates()) {
          priceRates.set(rate.channelId, rate.priceRate);
        }
        
        // Get priority rule
        const rule = this.store.getRule();
        
        // Map sub-channels to format needed for priority calculation
        const subChannelInfos = preview.subChannels
          .filter(sc => successfulSubChannels.some(created => created.name === sc.name))
          .map(sc => ({
            name: sc.name,
            modelId: sc.modelId,
            parentChannelId: sc.parentChannelId,
            parentChannelName: sc.parentChannelName,
          }));
        
        // Calculate priorities
        const priorityMap = calculateSplitPriorities(
          subChannelInfos,
          ratioConfig,
          priceRates,
          undefined,
          rule
        );
        
        console.log(`[SplitService] Calculated priorities for ${priorityMap.size} sub-channels`);
        
        // Update priorities on New API
        for (const subChannel of successfulSubChannels) {
          const priority = priorityMap.get(subChannel.name);
          if (priority !== undefined) {
            try {
              await updateChannel(connection, subChannel.id, { priority });
              priorityUpdateResults.push({
                channelId: subChannel.id,
                success: true,
              });
              console.log(`[SplitService] Updated priority for ${subChannel.name}: ${priority}`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              priorityUpdateResults.push({
                channelId: subChannel.id,
                success: false,
                error: errorMsg,
              });
              console.error(`[SplitService] Failed to update priority for ${subChannel.name}:`, errorMsg);
            }
          }
        }
      } catch (error) {
        console.error(`[SplitService] Priority calculation failed:`, error);
        // Continue even if priority calculation fails
      }
    }
    
    // Step 3: Handle parent channels
    console.log(`[SplitService] Handling parent channels with action: ${options.parentAction}`);
    for (const parent of preview.parentChannels) {
      try {
        switch (options.parentAction) {
          case 'disable':
            await updateChannel(connection, parent.id, { status: 2 }); // 2 = disabled
            parentChannelResults.push({
              channelId: parent.id,
              action: 'disable',
              success: true,
            });
            console.log(`[SplitService] Disabled parent channel: ${parent.name}`);
            break;
            
          case 'delete':
            await deleteChannel(connection, parent.id);
            parentChannelResults.push({
              channelId: parent.id,
              action: 'delete',
              success: true,
            });
            console.log(`[SplitService] Deleted parent channel: ${parent.name}`);
            break;
            
          case 'keep':
            parentChannelResults.push({
              channelId: parent.id,
              action: 'keep',
              success: true,
            });
            console.log(`[SplitService] Kept parent channel: ${parent.name}`);
            break;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        parentChannelResults.push({
          channelId: parent.id,
          action: options.parentAction,
          success: false,
          error: errorMsg,
        });
        console.error(`[SplitService] Failed to ${options.parentAction} parent channel ${parent.name}:`, errorMsg);
      }
    }
    
    // Step 4: Save split history
    const totalSuccess = successfulSubChannels.length;
    const totalFailed = createdSubChannels.length - totalSuccess;
    
    let historyId = -1;
    if (totalSuccess > 0) {
      try {
        // Get parent channel configs
        const allChannels = await fetchChannels(connection);
        const parentChannel = allChannels.find(ch => ch.id === preview.parentChannels[0].id);
        
        if (parentChannel) {
          const historyEntry = this.store.saveSplitHistory({
            splitAt: new Date().toISOString(),
            operator: options.operator,
            parentChannelId: parentChannel.id,
            parentChannelName: parentChannel.name,
            parentChannelConfig: parentChannel,
            subChannelIds: successfulSubChannels.map(sc => sc.id),
            modelFilter: preview.subChannels.map(sc => sc.modelId),
            parentAction: options.parentAction,
            autoPriorityEnabled: options.autoPriority,
          });
          historyId = historyEntry.id;
          console.log(`[SplitService] Saved split history: id=${historyId}`);
        }
      } catch (error) {
        console.error(`[SplitService] Failed to save split history:`, error);
      }
    }
    
    const result: SplitExecutionResult = {
      success: totalFailed === 0,
      createdSubChannels,
      priorityUpdateResults: priorityUpdateResults.length > 0 ? priorityUpdateResults : undefined,
      parentChannelResults,
      totalSuccess,
      totalFailed,
      historyId,
    };
    
    console.log(`[SplitService] execute complete: ${totalSuccess} success, ${totalFailed} failed`);
    return result;
  }

  /**
   * Get split history records
   */
  getSplitHistory(options?: { limit?: number; parentChannelId?: number }): SplitHistoryEntry[] {
    return this.store.getSplitHistory(options);
  }

  /**
   * Get a single split history record by ID
   */
  getSplitHistoryById(id: number): SplitHistoryEntry | null {
    return this.store.getSplitHistoryById(id);
  }

  /**
   * Rollback a split operation: delete sub-channels and restore parent channel
   */
  async rollback(
    connection: ConnectionSettings,
    historyId: number
  ): Promise<RollbackResult> {
    console.log(`[SplitService] rollback: historyId=${historyId}`);
    
    // Get history record
    const history = this.store.getSplitHistoryById(historyId);
    if (!history) {
      throw new Error(`Split history record ${historyId} not found`);
    }
    
    if (history.rollbackAt) {
      throw new Error(`Split operation ${historyId} has already been rolled back`);
    }
    
    const deletedSubChannels: RollbackResult['deletedSubChannels'] = [];
    let parentChannelRestored = false;
    let parentChannelError: string | undefined;
    
    // Step 1: Delete all sub-channels
    console.log(`[SplitService] Deleting ${history.subChannelIds.length} sub-channels...`);
    for (const subChannelId of history.subChannelIds) {
      try {
        await deleteChannel(connection, subChannelId);
        deletedSubChannels.push({
          id: subChannelId,
          name: `Channel ${subChannelId}`,
          success: true,
        });
        console.log(`[SplitService] Deleted sub-channel: id=${subChannelId}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        deletedSubChannels.push({
          id: subChannelId,
          name: `Channel ${subChannelId}`,
          success: false,
          error: errorMsg,
        });
        console.error(`[SplitService] Failed to delete sub-channel ${subChannelId}:`, errorMsg);
      }
    }
    
    // Step 2: Restore parent channel if it was disabled
    if (history.parentAction === 'disable') {
      console.log(`[SplitService] Re-enabling parent channel: ${history.parentChannelName}`);
      try {
        await updateChannel(connection, history.parentChannelId, { status: 1 }); // 1 = enabled
        parentChannelRestored = true;
        console.log(`[SplitService] Re-enabled parent channel: ${history.parentChannelName}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        parentChannelError = errorMsg;
        console.error(`[SplitService] Failed to re-enable parent channel:`, errorMsg);
      }
    } else if (history.parentAction === 'delete') {
      parentChannelError = 'Parent channel was deleted and cannot be restored';
      console.warn(`[SplitService] Parent channel was deleted and cannot be restored`);
    } else {
      parentChannelRestored = true; // Parent was kept, no action needed
    }
    
    // Step 3: Update rollback status in history
    const totalSuccess = deletedSubChannels.filter(sc => sc.success).length;
    const totalFailed = deletedSubChannels.length - totalSuccess;
    
    let rollbackStatus: 'success' | 'partial' | 'failed';
    if (totalFailed === 0 && !parentChannelError) {
      rollbackStatus = 'success';
    } else if (totalSuccess > 0) {
      rollbackStatus = 'partial';
    } else {
      rollbackStatus = 'failed';
    }
    
    this.store.updateRollbackStatus(historyId, new Date().toISOString(), rollbackStatus);
    console.log(`[SplitService] Updated rollback status: ${rollbackStatus}`);
    
    const result: RollbackResult = {
      success: rollbackStatus === 'success',
      deletedSubChannels,
      parentChannelRestored,
      parentChannelError,
      totalSuccess,
      totalFailed,
    };
    
    console.log(`[SplitService] rollback complete: ${totalSuccess} success, ${totalFailed} failed`);
    return result;
  }

  /**
   * Get intelligent split suggestions based on price data
   */
  async getSplitSuggestions(
    connection: ConnectionSettings
  ): Promise<SplitSuggestion[]> {
    console.log(`[SplitService] getSplitSuggestions`);
    
    // Fetch channels and ratio config
    const [channels, ratioConfig] = await Promise.all([
      fetchChannels(connection),
      fetchRatioConfig(connection),
    ]);
    
    // Get price rates
    const priceRates = new Map<number, number>();
    for (const rate of this.store.getPriceRates()) {
      priceRates.set(rate.channelId, rate.priceRate);
    }
    
    // Generate suggestions
    const suggestions = generateSplitSuggestions(channels, ratioConfig, priceRates);
    
    console.log(`[SplitService] Generated ${suggestions.length} split suggestions`);
    return suggestions;
  }

  /**
   * Save a split configuration
   */
  saveSplitConfig(config: Omit<SplitConfiguration, 'id'>): SplitConfiguration {
    return this.store.saveSplitConfig(config);
  }

  /**
   * Get all split configurations
   */
  getSplitConfigs(): SplitConfiguration[] {
    return this.store.getSplitConfigs();
  }

  /**
   * Get a single split configuration by ID
   */
  getSplitConfigById(id: number): SplitConfiguration | null {
    return this.store.getSplitConfigById(id);
  }

  /**
   * Delete a split configuration
   */
  deleteSplitConfig(id: number): void {
    this.store.deleteSplitConfig(id);
  }
}
