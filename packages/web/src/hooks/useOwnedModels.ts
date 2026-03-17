import { useCallback, useEffect, useState } from 'react';
import { proxyForward } from '../api/client';
import { useAppContext } from '../context/AppContext';

/**
 * Fetch owned models (enabled in the user's instance pricing page)
 * and configured models (already have ratio/price set).
 *
 * Shared by ChannelSourceRatios and ComparisonUpdate.
 */
export function useOwnedModels() {
  const { state } = useAppContext();
  const settings = state.connection.settings;

  const [ownedModels, setOwnedModels] = useState<Set<string>>(new Set());
  const [configuredModels, setConfiguredModels] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!settings) return;
    setLoading(true);
    try {
      const [pricingResp, ratioResp] = await Promise.all([
        proxyForward<{ success: boolean; data: Array<{ model_name: string }> }>(
          settings,
          'GET',
          '/api/pricing',
        ),
        proxyForward<{
          data: {
            model_ratio: Record<string, number>;
            completion_ratio: Record<string, number>;
            model_price?: Record<string, number>;
          };
        }>(settings, 'GET', '/api/ratio_config'),
      ]);

      if (pricingResp.success && pricingResp.data?.data) {
        const models = new Set<string>();
        (pricingResp.data.data as Array<{ model_name: string }>).forEach((item: { model_name: string }) => {
          if (item.model_name) models.add(item.model_name);
        });
        setOwnedModels(models);
      }

      if (ratioResp.success && ratioResp.data) {
        const apiData = (ratioResp.data as any).data || ratioResp.data;
        const configured = new Set<string>([
          ...Object.keys(apiData.model_ratio || apiData.modelRatio || {}),
          ...Object.keys(apiData.model_price || apiData.modelPrice || {}),
        ]);
        setConfiguredModels(configured);
      }
    } catch (err) {
      console.error('Failed to fetch owned models:', err);
    } finally {
      setLoading(false);
    }
  }, [settings]);

  return { ownedModels, configuredModels, loading, fetch };
}
