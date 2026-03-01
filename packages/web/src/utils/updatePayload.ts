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
 * Splits rows by pricingType:
 * - per-token rows → ModelRatio + CompletionRatio payloads
 * - per-request rows → ModelPrice payload (merged with existing modelPrice config)
 */
export function buildUpdatePayload(
  currentConfig: RatioConfig,
  selectedRows: ComparisonRow[],
): OptionUpdateRequest[] {
  // Split selected rows by pricing type
  const tokenRows = selectedRows.filter(r => r.pricingType !== 'per_request');
  const requestRows = selectedRows.filter(r => r.pricingType === 'per_request');

  const payloads: OptionUpdateRequest[] = [];

  // Per-token payload (always include ModelRatio/CompletionRatio for backward compat)
  const mergedModelRatio: Record<string, number> = { ...currentConfig.modelRatio };
  const mergedCompletionRatio: Record<string, number> = { ...currentConfig.completionRatio };

  for (const row of tokenRows) {
    if (row.newRatio !== undefined) {
      mergedModelRatio[row.modelId] = row.newRatio;
    }
    if (row.newCompletionRatio !== undefined) {
      mergedCompletionRatio[row.modelId] = row.newCompletionRatio;
    }
  }

  payloads.push(
    { key: 'ModelRatio', value: JSON.stringify(mergedModelRatio) },
    { key: 'CompletionRatio', value: JSON.stringify(mergedCompletionRatio) },
  );

  // Per-request payload (only when per-request models exist in config or selection)
  if (requestRows.length > 0 || Object.keys(currentConfig.modelPrice ?? {}).length > 0) {
    const mergedModelPrice: Record<string, number> = { ...(currentConfig.modelPrice ?? {}) };
    for (const row of requestRows) {
      if (row.newPrice !== undefined) {
        mergedModelPrice[row.modelId] = row.newPrice;
      }
    }
    payloads.push({ key: 'ModelPrice', value: JSON.stringify(mergedModelPrice) });
  }

  return payloads;
}

