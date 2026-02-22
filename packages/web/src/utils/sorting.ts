import type { ComparisonRow } from '@newapi-sync/shared';

/**
 * Sort comparison rows by the given field and order.
 * Supported sortBy values: 'modelId', 'ratioDiffPercent', 'provider'.
 */
export function sortComparison(
  rows: ComparisonRow[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): ComparisonRow[] {
  const sorted = [...rows];
  const dir = sortOrder === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'modelId':
        cmp = a.modelId.localeCompare(b.modelId);
        break;
      case 'ratioDiffPercent':
        cmp = (a.ratioDiffPercent ?? 0) - (b.ratioDiffPercent ?? 0);
        break;
      case 'provider':
        cmp = a.provider.localeCompare(b.provider);
        break;
      default:
        cmp = 0;
    }
    return cmp * dir;
  });

  return sorted;
}

/**
 * Filter comparison rows by provider, status, and/or search text.
 */
export function filterComparison(
  rows: ComparisonRow[],
  filters: { provider?: string; status?: string; searchText?: string },
): ComparisonRow[] {
  return rows.filter((row) => {
    if (filters.provider && row.provider !== filters.provider) {
      return false;
    }
    if (filters.status && row.status !== filters.status) {
      return false;
    }
    if (
      filters.searchText &&
      !row.modelId.toLowerCase().includes(filters.searchText.toLowerCase())
    ) {
      return false;
    }
    return true;
  });
}
