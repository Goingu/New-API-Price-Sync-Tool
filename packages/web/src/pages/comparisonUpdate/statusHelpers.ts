import type { ComparisonRow } from '@newapi-sync/shared';

export const STATUS_COLOR: Record<ComparisonRow['status'], string> = {
  decreased: 'green',
  increased: 'red',
  new: 'blue',
  removed: 'default',
  unchanged: '',
};

export const STATUS_LABEL: Record<ComparisonRow['status'], string> = {
  decreased: '可以降价',
  increased: '需要涨价',
  new: '新模型',
  removed: '已下架',
  unchanged: '无需调整',
};

export const STATUS_DESCRIPTION: Record<ComparisonRow['status'], string> = {
  decreased: '上游价格降低了，您可以降低倍率以提高竞争力',
  increased: '上游价格提高了，您需要提高倍率避免亏本',
  new: '上游新增的模型，您还没有配置倍率',
  removed: '您配置了倍率，但上游已经下架',
  unchanged: '价格没有变化，无需调整',
};

export function rowClassName(row: ComparisonRow): string {
  switch (row.status) {
    case 'decreased': return 'row-decreased';
    case 'increased': return 'row-increased';
    case 'new': return 'row-new';
    case 'removed': return 'row-removed';
    default: return '';
  }
}

export const ROW_HIGHLIGHT_CSS = `
  .row-decreased { background-color: #f6ffed !important; }
  .row-increased { background-color: #fff2f0 !important; }
  .row-new { background-color: #e6f4ff !important; }
  .row-removed { background-color: #fafafa !important; color: #999; }
  .row-decreased:hover td, .row-increased:hover td,
  .row-new:hover td, .row-removed:hover td {
    background: inherit !important;
  }
`;
