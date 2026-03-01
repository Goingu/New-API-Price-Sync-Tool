/**
 * Split Engine - Core logic for channel splitting operations
 * All functions are pure functions for easy testing
 */

import type { Channel, SubChannelPreview, SplitPreview } from '@newapi-sync/shared';

/**
 * Generate a unique sub-channel name, handling conflicts by adding numeric suffixes
 * @param parentName - Name of the parent channel
 * @param modelId - Model ID for this sub-channel
 * @param existingNames - Set of existing channel names to check for conflicts
 * @returns Unique sub-channel name
 */
export function generateSubChannelName(
  parentName: string,
  modelId: string,
  existingNames: Set<string>
): string {
  const baseName = `${parentName}-拆分-${modelId}`;
  
  // If no conflict, return the base name
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  
  // Find the next available suffix
  let suffix = 2;
  let candidateName = `${baseName}-${suffix}`;
  
  while (existingNames.has(candidateName)) {
    suffix++;
    candidateName = `${baseName}-${suffix}`;
  }
  
  return candidateName;
}

/**
 * Create a sub-channel configuration from a parent channel
 * @param parentChannel - The parent channel to split from
 * @param modelId - The model ID for this sub-channel
 * @param subChannelName - The name for the sub-channel
 * @returns Sub-channel configuration (without id)
 */
export function createSubChannelConfig(
  parentChannel: Channel,
  modelId: string,
  subChannelName: string
): Omit<Channel, 'id'> {
  // Parse models - handle both comma-separated string and JSON array
  let parentModels: string[] = [];
  if (parentChannel.models) {
    if (parentChannel.models.startsWith('[')) {
      // JSON array format
      try {
        parentModels = JSON.parse(parentChannel.models);
      } catch {
        parentModels = [];
      }
    } else {
      // Comma-separated string format
      parentModels = parentChannel.models.split(',').map(m => m.trim()).filter(Boolean);
    }
  }

  // Parse model_mapping
  let parentModelMapping: Record<string, string> = {};
  if (parentChannel.model_mapping) {
    try {
      parentModelMapping = JSON.parse(parentChannel.model_mapping);
    } catch {
      parentModelMapping = {};
    }
  }

  // Extract model mapping for this specific model (if exists)
  const subChannelModelMapping: Record<string, string> = {};
  if (parentModelMapping[modelId]) {
    subChannelModelMapping[modelId] = parentModelMapping[modelId];
  }

  // Create sub-channel config - copy all fields from parent
  const config: any = {
    name: subChannelName,
    type: parentChannel.type,
    key: parentChannel.key || '',
    base_url: parentChannel.base_url || '',
    models: modelId, // Single model as string
    model_mapping: Object.keys(subChannelModelMapping).length > 0
      ? JSON.stringify(subChannelModelMapping)
      : '',
    status: parentChannel.status ?? 1, // Default to enabled
    priority: parentChannel.priority ?? 0,
  };

  // Copy additional fields that might exist in the parent channel
  // These are common New API channel fields
  const additionalFields = [
    'proxy', 'test_model', 'model_test', 'groups', 'group',
    'config', 'plugin', 'tag', 'weight', 'auto_ban',
    'pre_cost', 'is_edit', 'other'
  ];

  for (const field of additionalFields) {
    if ((parentChannel as any)[field] !== undefined) {
      config[field] = (parentChannel as any)[field];
    }
  }

  return config;
}

/**
 * Validation result for split configuration
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Generate a split preview showing all sub-channels that will be created
 * @param parentChannels - Array of parent channels to split
 * @param modelFilters - Map of channel ID to array of model IDs to include (optional)
 * @param existingChannels - Array of all existing channels (to check for name conflicts)
 * @returns Split preview with all sub-channels
 */
export function generateSplitPreview(
  parentChannels: Channel[],
  modelFilters: Map<number, string[]>,
  existingChannels: Channel[]
): SplitPreview {
  const subChannels: SubChannelPreview[] = [];
  const parentChannelSummaries: SplitPreview['parentChannels'] = [];
  const existingNames = new Set(existingChannels.map(ch => ch.name));
  const generatedNames = new Set<string>();
  let nameConflicts = 0;
  const validationErrors: string[] = [];
  
  for (const parent of parentChannels) {
    // Parse parent models - handle both comma-separated string and JSON array
    let parentModels: string[];
    try {
      if (!parent.models) {
        parentModels = [];
      } else if (parent.models.startsWith('[')) {
        // JSON array format
        parentModels = JSON.parse(parent.models);
      } else {
        // Comma-separated string format (most common in New API)
        parentModels = parent.models.split(',').map(m => m.trim()).filter(Boolean);
      }
    } catch (error) {
      validationErrors.push(`Failed to parse models for channel ${parent.name}: ${error}`);
      continue;
    }

    // Check if channel has only one model (should not be split)
    if (parentModels.length <= 1) {
      validationErrors.push(`Channel "${parent.name}" has only ${parentModels.length} model(s) and cannot be split`);
      continue;
    }

    // Apply model filter if specified
    const modelsToSplit = modelFilters.has(parent.id)
      ? parentModels.filter(m => modelFilters.get(parent.id)!.includes(m))
      : parentModels;
    
    // Generate sub-channels for each model
    for (const modelId of modelsToSplit) {
      const originalName = `${parent.name}-拆分-${modelId}`;
      const subChannelName = generateSubChannelName(
        parent.name,
        modelId,
        new Set([...existingNames, ...generatedNames])
      );
      
      const hasConflict = subChannelName !== originalName;
      if (hasConflict) {
        nameConflicts++;
      }
      
      const config = createSubChannelConfig(parent, modelId, subChannelName);
      
      subChannels.push({
        name: subChannelName,
        modelId,
        parentChannelId: parent.id,
        parentChannelName: parent.name,
        config,
        nameConflict: hasConflict,
        originalName: hasConflict ? originalName : undefined,
      });
      
      generatedNames.add(subChannelName);
    }
    
    // Add parent channel summary
    parentChannelSummaries.push({
      id: parent.id,
      name: parent.name,
      modelCount: parentModels.length,
      subChannelCount: modelsToSplit.length,
    });
  }
  
  return {
    parentChannels: parentChannelSummaries,
    subChannels,
    totalSubChannels: subChannels.length,
    nameConflicts,
    validationErrors,
  };
}

/**
 * Validate a split configuration
 * @param preview - The split preview to validate
 * @returns Validation result with any errors
 */
export function validateSplitConfig(preview: SplitPreview): ValidationResult {
  const errors: string[] = [...preview.validationErrors];

  // Check if there are any sub-channels to create
  if (preview.subChannels.length === 0) {
    errors.push('No sub-channels to create. Please select channels with multiple models.');
  }

  // Validate each sub-channel config
  for (const subChannel of preview.subChannels) {
    const config = subChannel.config;

    // Check required fields
    if (!config.name || config.name.trim() === '') {
      errors.push(`Sub-channel for model ${subChannel.modelId} has empty name`);
    }

    if (!config.base_url && !config.key) {
      errors.push(`Sub-channel "${subChannel.name}" missing both base_url and key`);
    }

    // Validate models field - should be a non-empty string (single model)
    if (!config.models || config.models.trim() === '') {
      errors.push(`Sub-channel "${subChannel.name}" has no models`);
    }

    // Check that models field contains only one model (no commas)
    if (config.models && config.models.includes(',')) {
      errors.push(`Sub-channel "${subChannel.name}" should have only one model, but has multiple`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
