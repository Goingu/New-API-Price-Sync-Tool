export interface ComparisonRow {
  key: string;
  channelId: number;
  channelName: string;
  modelRatio: number | null;
  priceRate: number | null;
  effectiveUnitCost: number | null;
}

export interface SourceGroup {
  key: string;
  sourceName: string;
  baseUrl: string;
  channelCount: number;
  modelCount: number;
  models: string[];
  channels: import('@newapi-sync/shared').Channel[];
  isOwnInstance?: boolean;
}
