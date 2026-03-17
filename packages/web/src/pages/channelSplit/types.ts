import type { SplitPreview, SplitExecutionOptions } from '@newapi-sync/shared';

export interface SplitSelection {
  channelIds: number[];
  modelFilters: Record<number, string[]>;
}

export interface SplitExecution {
  preview: SplitPreview;
  options: SplitExecutionOptions;
}
