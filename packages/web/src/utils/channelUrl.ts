import type { Channel, ChannelSource, ChannelSourcePriceRateConfig } from '@newapi-sync/shared';

export function normalizeBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalizePath = (path: string): string => {
    let normalized = path.replace(/\/+$/, '');
    normalized = normalized.replace(/\/v1$/i, '');
    normalized = normalized.replace(/\/api$/i, '');
    return normalized;
  };

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.host.toLowerCase();
    const pathname = normalizePath(parsed.pathname);
    return `${protocol}//${host}${pathname}`;
  } catch {
    return normalizePath(trimmed.toLowerCase());
  }
}

export function getChannelBaseUrl(channel: Channel): string | null {
  if (channel.base_url?.trim()) return channel.base_url.trim();
  if (channel.key?.trim() && /^https?:\/\//i.test(channel.key)) return channel.key.trim();
  return null;
}

export function buildChannelRateMap(
  channels: Channel[],
  sources: ChannelSource[],
  sourceRates: ChannelSourcePriceRateConfig[],
): Map<number, number> {
  const sourceById = new Map<number, ChannelSource>();
  for (const source of sources) {
    if (source.id != null) sourceById.set(source.id, source);
  }

  const rateByBaseUrl = new Map<string, number>();
  for (const rate of sourceRates) {
    const source = sourceById.get(rate.sourceId);
    if (!source) continue;
    const normalized = normalizeBaseUrl(source.baseUrl);
    if (!normalized) continue;
    rateByBaseUrl.set(normalized, rate.priceRate);
  }

  const channelRateMap = new Map<number, number>();
  for (const channel of channels) {
    const channelBaseUrl = normalizeBaseUrl(getChannelBaseUrl(channel) ?? undefined);
    if (!channelBaseUrl) continue;
    const priceRate = rateByBaseUrl.get(channelBaseUrl);
    if (priceRate != null) channelRateMap.set(channel.id, priceRate);
  }

  return channelRateMap;
}
