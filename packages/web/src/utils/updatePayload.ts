import type { ComparisonRow, RatioConfig, OptionUpdateRequest } from '@newapi-sync/shared';

/**
 * Select model IDs based on a quick-filter action.
 * - 'all': all model IDs
 * - 'none': empty set
 * - 'decreased': only models with status === 'decreased'
 * - 'increased': only models with status === 'increased'
 * - 'new': only models with status === 'new'
 */
export function selectByFilter(
  rows: ComparisonRow[],
  filter: 'all' | 'none' | 'decreased' | 'increased' | 'new',
): Set<string> {
  switch (filter) {
    case 'all':
      return new Set(rows.map((r) => r.modelId));
    case 'none':
      return new Set<string>();
    case 'decreased':
      return new Set(
        rows.filter((r) => r.status === 'decreased').map((r) => r.modelId),
      );
    case 'increased':
      return new Set(
        rows.filter((r) => r.status === 'increased').map((r) => r.modelId),
      );
    case 'new':
      return new Set(
        rows.filter((r) => r.status === 'new').map((r) => r.modelId),
      );
  }
}

/**
 * Build the update payload for PUT /api/option/.
 *
 * Merges the full current config with overrides from selected rows.
 * Returns two OptionUpdateRequest entries: one for "ModelRatio", one for "CompletionRatio".
 */
export function buildUpdatePayload(
  currentConfig: RatioConfig,
  selectedRows: ComparisonRow[],
): OptionUpdateRequest[] {
  // Start with a copy of the full current config
  const mergedModelRatio: Record<string, number> = { ...currentConfig.modelRatio };
  const mergedCompletionRatio: Record<string, number> = { ...currentConfig.completionRatio };

  // Override with selected rows' new values
  for (const row of selectedRows) {
    if (row.newRatio !== undefined) {
      mergedModelRatio[row.modelId] = row.newRatio;
    }
    if (row.newCompletionRatio !== undefined) {
      mergedCompletionRatio[row.modelId] = row.newCompletionRatio;
    }
  }

  return [
    { key: 'ModelRatio', value: JSON.stringify(mergedModelRatio) },
    { key: 'CompletionRatio', value: JSON.stringify(mergedCompletionRatio) },
  ];
}
