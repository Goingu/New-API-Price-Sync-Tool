import type { RatioConfig } from '@newapi-sync/shared';

export interface SourceRatioData {
  sourceId: number;
  sourceName: string;
  success: boolean;
  ratioConfig?: RatioConfig;
  error?: string;
  fetchedAt?: string;
  isFromCache?: boolean;
  detectedBasePrice?: number;
}

export interface ComparisonRow {
  modelId: string;
  sources: Record<number, { modelRatio: number; completionRatio: number; modelPrice?: number }>;
  lowestSourceId?: number;
  lowestRatio?: number;
}
