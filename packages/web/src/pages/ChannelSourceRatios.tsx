import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
  CheckOutlined,
  InfoCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ChannelSource, RatioConfig } from '@newapi-sync/shared';
import { useAppContext } from '../context/AppContext';
import {
  getChannelSources,
  compareChannelSourceRatios,
  proxyForward,
  getCachedRatios,
  saveCachedRatio,
  getChannelSourcePriceRates,
} from '../api/client';

const { Title, Text } = Typography;

interface SourceRatioData {
  sourceId: number;
  sourceName: string;
  success: boolean;
  ratioConfig?: RatioConfig;
  error?: string;
  fetchedAt?: string;
  isFromCache?: boolean;
}

interface ComparisonRow {
  modelId: string;
  sources: Record<number, { modelRatio: number; completionRatio: number; modelPrice?: number }>;
  lowestSourceId?: number;
  lowestRatio?: number;
}

export default function ChannelSourceRatios() {
  const { state } = useAppContext();
  const { settings } = state.connection;

  const [sources, setSources] = useState<ChannelSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const [ratioData, setRatioData] = useState<SourceRatioData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState('');
  const [markupPercent, setMarkupPercent] = useState(20); // Default 20% markup
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [showUnsetOnly, setShowUnsetOnly] = useState(false);
  const [ownedModels, setOwnedModels] = useState<Set<string>>(new Set());
  const [loadingOwned, setLoadingOwned] = useState(false);
  const [upstreamPrices, setUpstreamPrices] = useState<Map<string, { inputPrice: number; outputPrice: number }>>(new Map());
  const [showRealCost, setShowRealCost] = useState(false);
  const [sourcePriceRates, setSourcePriceRates] = useState<Map<number, number>>(new Map());
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  // Group selection state
  const [selectedGroups, setSelectedGroups] = useState<Map<string, Set<number>>>(new Map()); // channelName -> Set of sourceIds

  // Cache-related state
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [fetchedTimes, setFetchedTimes] = useState<Map<number, string>>(new Map());

  // Fetch channel sources
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const resp = await getChannelSources();
        if (resp.success) {
          const enabledSources = resp.sources.filter((s) => s.enabled);
          setSources(enabledSources);

          // Initialize group selection: group sources by base name
          const groupMap = new Map<string, Set<number>>();
          enabledSources.forEach(source => {
            // Use the base name (without group suffix) as the group key
            const baseName = source.name;
            if (!groupMap.has(baseName)) {
              groupMap.set(baseName, new Set());
            }
            groupMap.get(baseName)!.add(source.id!);
          });

          // Auto-select first group of each channel
          const initialSelection = new Map<string, Set<number>>();
          groupMap.forEach((sourceIds, channelName) => {
            const firstSourceId = Array.from(sourceIds)[0];
            initialSelection.set(channelName, new Set([firstSourceId]));
          });
          setSelectedGroups(initialSelection);
        }
      } catch (err) {
        console.error('Failed to fetch channel sources:', err);
      }
    };
    fetchSources();
  }, []);

  // Load upstream prices from state
  useEffect(() => {
    if (state.upstreamPrices.results.length > 0) {
      const priceMap = new Map<string, { inputPrice: number; outputPrice: number }>();

      state.upstreamPrices.results.forEach(result => {
        if (result.success) {
          result.models.forEach(model => {
            if (model.pricingType === 'per_token') {
              const price = {
                inputPrice: model.inputPricePerMillion,
                outputPrice: model.outputPricePerMillion,
              };

              // Store with original model ID
              priceMap.set(model.modelId, price);

              // Also store with normalized key (remove provider prefix for fuzzy matching)
              // e.g., "minimax/MiniMax-M2.5" -> "MiniMax-M2.5"
              const normalized = model.modelId.includes('/')
                ? model.modelId.split('/').slice(1).join('/')
                : model.modelId;
              if (normalized !== model.modelId) {
                priceMap.set(normalized, price);
              }

              // Also store lowercase version for case-insensitive matching
              const lowerKey = model.modelId.toLowerCase();
              if (lowerKey !== model.modelId) {
                priceMap.set(lowerKey, price);
              }
            }
          });
        }
      });

      setUpstreamPrices(priceMap);
      console.log('Loaded upstream prices for', priceMap.size, 'models (including normalized keys)');
    }
  }, [state.upstreamPrices.results]);

  // Load channel source price rates (exchange rates)
  useEffect(() => {
    const loadSourcePriceRates = async () => {
      try {
        const resp = await getChannelSourcePriceRates();
        if (resp.success) {
          const rateMap = new Map<number, number>();
          console.log('=== Channel Source Price Rates Response ===');
          console.log('Full response:', resp);
          resp.data.forEach(rate => {
            const unitCost = 1 / rate.priceRate;
            console.log(`Source ID ${rate.sourceId} (${rate.sourceName}):`);
            console.log(`  - priceRate (费率): ${rate.priceRate}`);
            console.log(`  - unitCost (单位成本): ${unitCost.toFixed(4)} 元/美元`);
            rateMap.set(rate.sourceId, rate.priceRate);
          });
          setSourcePriceRates(rateMap);
          console.log('Loaded source price rates for', rateMap.size, 'sources');
          console.log('Rate map entries:', Array.from(rateMap.entries()));
        }
      } catch (err) {
        console.error('Failed to load channel source price rates:', err);
      }
    };
    loadSourcePriceRates();
  }, []);

  // Load cached ratios on mount
  useEffect(() => {
    loadCachedRatios();
  }, []);

  // Compute actually selected source IDs from group selection
  const actualSelectedSourceIds = useMemo(() => {
    const ids: number[] = [];
    selectedGroups.forEach((sourceIds) => {
      ids.push(...Array.from(sourceIds));
    });
    return ids;
  }, [selectedGroups]);

  // Load cached ratios from database
  const loadCachedRatios = useCallback(async () => {
    setCacheLoading(true);
    try {
      const resp = await getCachedRatios();
      if (resp.success && resp.cached.length > 0) {
        console.log('Loaded cached ratios:', resp.cached);

        // Convert cached entries to SourceRatioData format
        const cachedData: SourceRatioData[] = resp.cached.map((entry) => ({
          sourceId: entry.sourceId,
          sourceName: entry.sourceName,
          success: true,
          ratioConfig: entry.ratioConfig,
          fetchedAt: entry.fetchedAt,
          isFromCache: true,
        }));

        setRatioData(cachedData);

        // Update fetched times
        const times = new Map<number, string>();
        resp.cached.forEach((entry) => {
          times.set(entry.sourceId, entry.fetchedAt);
        });
        setFetchedTimes(times);

        // Auto-select cached sources
        const cachedSourceIds = resp.cached.map((e) => e.sourceId);
        setSelectedSourceIds(cachedSourceIds);

        setCacheLoaded(true);
        message.success(`已加载 ${resp.cached.length} 个渠道源的缓存数据`);
      } else {
        setCacheLoaded(true);
      }
    } catch (err) {
      console.error('Failed to load cached ratios:', err);
      setCacheLoaded(true);
      // Don't show error message - cache loading failure shouldn't block user
    } finally {
      setCacheLoading(false);
    }
  }, []);

  // Save ratios to cache after fetching
  const saveCachedRatios = useCallback(async (data: SourceRatioData[]) => {
    try {
      const savePromises = data
        .filter((d) => d.success && d.ratioConfig)
        .map((d) =>
          saveCachedRatio(d.sourceId, d.sourceName, d.ratioConfig!)
        );

      await Promise.all(savePromises);
      console.log('Saved ratios to cache');
    } catch (err) {
      console.error('Failed to save cached ratios:', err);
      // Don't show error message - cache save failure shouldn't block user
    }
  }, []);

  // Fetch and compare ratios
  const fetchRatios = useCallback(async () => {
    if (actualSelectedSourceIds.length === 0) {
      message.warning('请至少选择一个渠道源');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const resp = await compareChannelSourceRatios(actualSelectedSourceIds);
      console.log('Compare ratios response:', resp);

      if (resp.success) {
        console.log('Ratio data:', resp.results);

        // Mark as live data and add current timestamp
        const now = new Date().toISOString();
        const liveData: SourceRatioData[] = resp.results.map((r) => ({
          ...r,
          fetchedAt: now,
          isFromCache: false,
        }));

        setRatioData(liveData);

        // Update fetched times
        const times = new Map<number, string>();
        liveData.forEach((d) => {
          if (d.success) {
            times.set(d.sourceId, now);
          }
        });
        setFetchedTimes(times);

        const failedCount = resp.results.filter((r) => !r.success).length;
        const successCount = resp.results.filter((r) => r.success).length;

        console.log(`Success: ${successCount}, Failed: ${failedCount}`);

        if (failedCount > 0) {
          message.warning(`${successCount} 个成功，${failedCount} 个失败`);
        } else {
          message.success('获取成功');
        }

        // Save successful results to cache
        saveCachedRatios(liveData);

        // Auto-fetch owned models when showing unset only
        if (showUnsetOnly && ownedModels.size === 0) {
          fetchOwnedModels();
        }
      } else {
        setError('获取倍率失败');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Fetch ratios error:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [actualSelectedSourceIds, showUnsetOnly, ownedModels.size, saveCachedRatios]);

  // Fetch owned models from user's instance
  const fetchOwnedModels = useCallback(async () => {
    if (!settings) return;
    setLoadingOwned(true);
    try {
      const resp = await proxyForward<{ success: boolean; data: Array<{ model_name: string }> }>(
        settings,
        'GET',
        '/api/pricing'
      );
      if (resp.success && resp.data?.data) {
        const models = new Set<string>();
        resp.data.data.forEach((item) => {
          if (item.model_name) {
            models.add(item.model_name);
          }
        });
        setOwnedModels(models);
      }
    } catch (err) {
      console.error('Failed to fetch owned models:', err);
    } finally {
      setLoadingOwned(false);
    }
  }, [settings]);

  // Format relative time (e.g., "5 分钟前", "2 小时前")
  const formatRelativeTime = (isoString: string): string => {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    return `${diffDays} 天前`;
  };

  // Check if data is expired (> 12 hours old)
  const isDataExpired = (isoString: string): boolean => {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffHours = (now - then) / 3600000;
    return diffHours > 12;
  };

  // Build comparison rows
  const comparisonRows = useMemo(() => {
    console.log('Building comparison rows from ratioData:', ratioData);

    const modelMap = new Map<string, ComparisonRow>();

    for (const data of ratioData) {
      console.log(`Processing source ${data.sourceName}:`, data);

      if (!data.success || !data.ratioConfig) {
        console.log(`Skipping ${data.sourceName}: success=${data.success}, hasConfig=${!!data.ratioConfig}`);
        continue;
      }

      const ratioConfig = data.ratioConfig;

      // Collect all unique model IDs from both modelRatio and modelPrice
      const allModelIds = new Set([
        ...Object.keys(ratioConfig.modelRatio || {}),
        ...Object.keys(ratioConfig.modelPrice || {}),
      ]);

      console.log(`${data.sourceName} has ${allModelIds.size} models (${Object.keys(ratioConfig.modelRatio || {}).length} token-based, ${Object.keys(ratioConfig.modelPrice || {}).length} per-request)`);
      
      // Log sample modelPrice data
      if (ratioConfig.modelPrice && Object.keys(ratioConfig.modelPrice).length > 0) {
        const sampleKeys = Object.keys(ratioConfig.modelPrice).slice(0, 5);
        console.log(`${data.sourceName} modelPrice sample:`, sampleKeys.map(k => ({
          model: k,
          price: ratioConfig.modelPrice![k]
        })));
      }

      for (const modelId of allModelIds) {
        if (!modelMap.has(modelId)) {
          modelMap.set(modelId, {
            modelId,
            sources: {},
          });
        }

        const row = modelMap.get(modelId)!;
        
        // Check if this is a per-request pricing model
        const modelPrice = ratioConfig.modelPrice?.[modelId];
        const modelRatio = ratioConfig.modelRatio?.[modelId] ?? 0;
        const completionRatio = ratioConfig.completionRatio?.[modelId] ?? 1;
        
        row.sources[data.sourceId] = {
          modelRatio,
          completionRatio,
          modelPrice,
        };
      }
    }

    console.log(`Total unique models: ${modelMap.size}`);

    // Find lowest ratio for each model (considering exchange rates if showRealCost is enabled)
    const rows = Array.from(modelMap.values());
    for (const row of rows) {
      let lowestCost = Infinity;
      let lowestSourceId: number | undefined;

      for (const [sourceId, ratios] of Object.entries(row.sources)) {
        // Skip per-request models (ratio = 0) when finding lowest
        if (ratios.modelRatio <= 0) continue;

        let cost: number;
        if (showRealCost) {
          // Calculate real cost in CNY
          const priceRate = sourcePriceRates.get(parseInt(sourceId, 10));
          console.log(`[Lowest calc] Source ${sourceId}, priceRate: ${priceRate}, modelRatio: ${ratios.modelRatio}`);
          
          if (!priceRate || priceRate <= 0) {
            console.log(`[Lowest calc] Skipping source ${sourceId} - no price rate`);
            continue;
          }
          
          const unitCost = 1 / priceRate;
          const inputPrice = ratios.modelRatio * 0.75;
          cost = inputPrice * unitCost; // Real cost in CNY
          console.log(`[Lowest calc] Source ${sourceId}, unitCost: ${unitCost}, inputPrice: $${inputPrice}, realCost: ¥${cost}`);
        } else {
          // Use USD price (model ratio)
          cost = ratios.modelRatio;
        }

        if (cost < lowestCost) {
          lowestCost = cost;
          lowestSourceId = parseInt(sourceId, 10);
          console.log(`[Lowest calc] New lowest: source ${sourceId}, cost: ${cost}`);
        }
      }

      row.lowestSourceId = lowestSourceId;
      row.lowestRatio = lowestCost === Infinity ? undefined : lowestCost;
    }

    console.log('Final comparison rows:', rows.slice(0, 3));

    return rows;
  }, [ratioData, showRealCost, sourcePriceRates]);

  // Extract provider from model ID
  const extractProvider = (modelId: string): string => {
    const lower = modelId.toLowerCase();
    
    // Check for common providers
    if (lower.includes('gpt') || lower.includes('openai') || lower.includes('o1') || lower.includes('chatgpt')) return 'OpenAI';
    if (lower.includes('claude')) return 'Anthropic';
    if (lower.includes('gemini') || lower.includes('palm')) return 'Google';
    if (lower.includes('llama')) return 'Meta';
    if (lower.includes('mistral') || lower.includes('mixtral')) return 'Mistral';
    if (lower.includes('deepseek')) return 'DeepSeek';
    if (lower.includes('qwen')) return 'Qwen';
    if (lower.includes('glm') || lower.includes('chatglm')) return 'Zhipu';
    if (lower.includes('moonshot') || lower.includes('kimi')) return 'Moonshot';
    if (lower.includes('doubao')) return 'Doubao';
    if (lower.includes('yi-')) return 'Yi';
    if (lower.includes('baichuan')) return 'Baichuan';
    if (lower.includes('spark')) return 'iFlytek';
    if (lower.includes('ernie')) return 'Baidu';
    if (lower.includes('hunyuan')) return 'Tencent';
    if (lower.includes('360')) return '360AI';
    if (lower.includes('grok')) return 'xAI';
    if (lower.includes('command')) return 'Cohere';
    
    return '其他';
  };

  // Get all unique providers from comparison rows
  const allProviders = useMemo(() => {
    const providers = new Set<string>();
    comparisonRows.forEach(row => {
      providers.add(extractProvider(row.modelId));
    });
    return Array.from(providers).sort();
  }, [comparisonRows]);

  // Filter by search
  const filteredRows = useMemo(() => {
    if (!search.trim() && !showUnsetOnly && selectedProviders.length === 0) return comparisonRows;

    let filtered = comparisonRows;

    // Filter by search text
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) => r.modelId.toLowerCase().includes(q));
    }

    // Filter by provider
    if (selectedProviders.length > 0) {
      filtered = filtered.filter((r) => selectedProviders.includes(extractProvider(r.modelId)));
    }

    // Filter by unset ratios (owned but not configured)
    if (showUnsetOnly && ownedModels.size > 0 && state.currentRatios.data) {
      const configuredModels = new Set(Object.keys(state.currentRatios.data.modelRatio));
      filtered = filtered.filter((r) =>
        ownedModels.has(r.modelId) && !configuredModels.has(r.modelId)
      );
    }

    return filtered;
  }, [comparisonRows, search, showUnsetOnly, ownedModels, state.currentRatios.data, selectedProviders]);

  // Apply ratios to own instance
  const handleApplyRatios = useCallback(async () => {
    if (!settings) {
      message.error('请先配置 New API 连接');
      return;
    }

    if (selectedModels.size === 0) {
      message.warning('请至少选择一个模型');
      return;
    }

    setApplying(true);
    try {
      // Get current ratios
      const currentResp = await proxyForward<{ data: any }>(settings, 'GET', '/api/ratio_config');
      if (!currentResp.success || !currentResp.data) {
        throw new Error('获取当前倍率失败');
      }

      const apiData = currentResp.data.data || currentResp.data;
      const currentConfig: RatioConfig = {
        modelRatio: apiData.model_ratio || apiData.modelRatio || {},
        completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
      };

      // Apply selected models' ratios with markup
      const markup = 1 + markupPercent / 100;
      let updateCount = 0;

      for (const modelId of selectedModels) {
        const row = comparisonRows.find((r) => r.modelId === modelId);
        if (!row || !row.lowestSourceId) continue;

        const lowestRatios = row.sources[row.lowestSourceId];

        // Validate ratios before applying
        if (lowestRatios.modelRatio <= 0) {
          console.warn(`Skipping ${modelId}: invalid modelRatio ${lowestRatios.modelRatio}`);
          continue;
        }

        currentConfig.modelRatio[modelId] = lowestRatios.modelRatio * markup;
        // Use 1 as default if completionRatio is 0 or invalid
        currentConfig.completionRatio[modelId] = lowestRatios.completionRatio > 0
          ? lowestRatios.completionRatio
          : 1;
        updateCount++;
      }

      if (updateCount === 0) {
        message.warning('没有可更新的模型');
        return;
      }

      // Update ratios - send complete config
      const modelRatioStr = JSON.stringify(currentConfig.modelRatio);
      const completionRatioStr = JSON.stringify(currentConfig.completionRatio);

      const totalSize = modelRatioStr.length + completionRatioStr.length;
      console.log(`Updating ${updateCount} models, payload size: ${Math.round(totalSize / 1024)}KB`);

      // Check if payload is too large
      if (totalSize > 100000) {
        throw new Error(`配置数据过大（${Math.round(totalSize / 1024)}KB），请联系管理员`);
      }

      // Send each option separately (New API expects individual objects, not an array)
      const updatePayloads = [
        { key: 'ModelRatio', value: modelRatioStr },
        { key: 'CompletionRatio', value: completionRatioStr },
      ];

      console.log('Sending payloads:', updatePayloads.map(p => ({ key: p.key, valueLength: p.value.length })));

      // Send each payload separately
      for (const payload of updatePayloads) {
        const resp = await proxyForward(settings, 'PUT', '/api/option/', payload);
        console.log(`Update response for ${payload.key}:`, resp);

        if (!resp.success) {
          throw new Error(`更新 ${payload.key} 失败: ${resp.error ?? '未知错误'}`);
        }
      }

      message.success(`成功更新 ${updateCount} 个模型的倍率`);
      setApplyModalVisible(false);
      setSelectedModels(new Set());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`更新失败: ${msg}`);
    } finally {
      setApplying(false);
    }
  }, [settings, selectedModels, comparisonRows, markupPercent]);

  // Table columns
  const columns: ColumnsType<ComparisonRow> = [
    {
      title: '模型名称',
      dataIndex: 'modelId',
      fixed: 'left',
      width: 250,
      sorter: (a, b) => a.modelId.localeCompare(b.modelId),
    },
    {
      title: '官方价格',
      key: 'officialPrice',
      width: 180,
      render: (_: unknown, row: ComparisonRow) => {
        // Try multiple matching strategies
        let price = upstreamPrices.get(row.modelId);

        // If not found, try case-insensitive match
        if (!price) {
          price = upstreamPrices.get(row.modelId.toLowerCase());
        }

        // If still not found, try matching with provider prefix removed
        // e.g., "minimax/MiniMax-M2.5" should match "MiniMax-M2.5"
        if (!price) {
          for (const [key, value] of upstreamPrices.entries()) {
            if (key.includes('/')) {
              const withoutPrefix = key.split('/').slice(1).join('/');
              if (withoutPrefix === row.modelId || withoutPrefix.toLowerCase() === row.modelId.toLowerCase()) {
                price = value;
                break;
              }
            }
          }
        }

        if (!price) {
          return <Text type="secondary">未获取</Text>;
        }

        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12, color: '#1890ff' }}>
              输入: ${price.inputPrice.toFixed(4)}/M
            </Text>
            <Text style={{ fontSize: 12, color: '#1890ff' }}>
              输出: ${price.outputPrice.toFixed(4)}/M
            </Text>
          </Space>
        );
      },
    },
    ...ratioData
      .filter((d) => d.success)
      .map((data) => {
        const fetchedAt = data.fetchedAt || fetchedTimes.get(data.sourceId);
        const isFromCache = data.isFromCache ?? false;
        const isExpired = fetchedAt ? isDataExpired(fetchedAt) : false;
        const priceRate = sourcePriceRates.get(data.sourceId);
        
        console.log(`Column for source ${data.sourceName} (ID: ${data.sourceId}): priceRate = ${priceRate}`);

        return {
          title: (
            <Space direction="vertical" size={0}>
              <Space size={4}>
                <Text>{data.sourceName}</Text>
                {isFromCache ? (
                  <Tooltip title="数据来自缓存">
                    <Tag icon={<DatabaseOutlined />} color="blue" style={{ margin: 0 }}>
                      缓存
                    </Tag>
                  </Tooltip>
                ) : (
                  <Tooltip title="实时获取的数据">
                    <Tag icon={<ThunderboltOutlined />} color="green" style={{ margin: 0 }}>
                      实时
                    </Tag>
                  </Tooltip>
                )}
              </Space>
              {priceRate && (
                <Tooltip title={`单位成本: 1美元 = ${(1 / priceRate).toFixed(4)}元人民币`}>
                  <Tag color="orange" style={{ margin: 0 }}>
                    单位成本 {(1 / priceRate).toFixed(4)}
                  </Tag>
                </Tooltip>
              )}
              {fetchedAt && (
                <Text
                  type="secondary"
                  style={{
                    fontSize: 11,
                    color: isExpired ? '#ff4d4f' : undefined,
                  }}
                >
                  <ClockCircleOutlined style={{ marginRight: 2 }} />
                  {formatRelativeTime(fetchedAt)}
                  {isExpired && ' (已过期)'}
                </Text>
              )}
            </Space>
          ),
          key: `source-${data.sourceId}`,
          width: showRealCost ? 250 : 200,
          render: (_: unknown, row: ComparisonRow) => {
            const ratios = row.sources[data.sourceId];
            if (!ratios) return <Text type="secondary">-</Text>;

            // Check if this is a per-request pricing model
            const isPerRequest = ratios.modelPrice !== undefined && ratios.modelPrice > 0;
            const isLowest = row.lowestSourceId === data.sourceId;

            if (isPerRequest) {
              // Display per-request pricing
              let realCost: number | undefined;
              if (showRealCost && priceRate && priceRate > 0) {
                const unitCost = 1 / priceRate;
                realCost = ratios.modelPrice! * unitCost;
              }

              return (
                <Space direction="vertical" size={0}>
                  <Text strong={isLowest} style={{ color: isLowest ? '#52c41a' : undefined }}>
                    按次计费
                    {isLowest && (
                      <Tag color="success" style={{ marginLeft: 4 }}>
                        最低
                      </Tag>
                    )}
                  </Text>
                  {!showRealCost ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ${ratios.modelPrice!.toFixed(4)}/次
                    </Text>
                  ) : (
                    <>
                      {realCost !== undefined ? (
                        <>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ¥{realCost.toFixed(4)}/次
                          </Text>
                          <Text type="secondary" style={{ fontSize: 11, color: '#999' }}>
                            (${ratios.modelPrice!.toFixed(4)}/次)
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ${ratios.modelPrice!.toFixed(4)}/次
                          </Text>
                          <Text type="warning" style={{ fontSize: 11 }}>
                            (未配置汇率)
                          </Text>
                        </>
                      )}
                    </>
                  )}
                </Space>
              );
            }

            // Display token-based pricing
            const inputPrice = ratios.modelRatio * 0.75;
            const outputPrice = inputPrice * ratios.completionRatio;

            // Calculate real cost if exchange rate is available
            let realInputCost: number | undefined;
            let realOutputCost: number | undefined;
            let unitCost: number | undefined;
            if (showRealCost && priceRate && priceRate > 0) {
              // Unit cost (单位成本) = 1 / priceRate
              // This represents: 1 USD = X CNY
              unitCost = 1 / priceRate;
              // Real cost = USD price × unit cost
              // Example: $0.75/M × 1元/美元 = 0.75元/M
              realInputCost = inputPrice * unitCost;
              realOutputCost = outputPrice * unitCost;
              
              console.log(`[${data.sourceName}] Model: ${row.modelId}, priceRate: ${priceRate}, unitCost: ${unitCost}, inputPrice: $${inputPrice}, realInputCost: ¥${realInputCost}`);
            }

            return (
              <Space direction="vertical" size={0}>
                <Text strong={isLowest} style={{ color: isLowest ? '#52c41a' : undefined }}>
                  倍率: {ratios.modelRatio.toFixed(4)}
                  {isLowest && (
                    <Tag color="success" style={{ marginLeft: 4 }}>
                      最低
                    </Tag>
                  )}
                </Text>
                {!showRealCost ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      输入: ${inputPrice.toFixed(4)}/M
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      输出: ${outputPrice.toFixed(4)}/M
                    </Text>
                  </>
                ) : (
                  <>
                    {realInputCost !== undefined && realOutputCost !== undefined ? (
                      <>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          输入: ¥{realInputCost.toFixed(4)}/M
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          输出: ¥{realOutputCost.toFixed(4)}/M
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11, color: '#999' }}>
                          (${inputPrice.toFixed(4)}/M)
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          输入: ${inputPrice.toFixed(4)}/M
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          输出: ${outputPrice.toFixed(4)}/M
                        </Text>
                        <Text type="warning" style={{ fontSize: 11 }}>
                          (未配置汇率)
                        </Text>
                      </>
                    )}
                  </>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  补全倍率: {ratios.completionRatio.toFixed(2)}
                </Text>
              </Space>
            );
          },
        };
      }),
  ];

  const rowSelection = {
    selectedRowKeys: Array.from(selectedModels),
    onChange: (keys: React.Key[]) => {
      setSelectedModels(new Set(keys as string[]));
    },
  };

  if (!settings) {
    return <Alert type="warning" showIcon message="请先配置 New API 连接" />;
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        实例站倍率同步
      </Title>

      <Alert
        type="info"
        showIcon
        message="功能说明"
        description="对比多个渠道源（中转商）的倍率配置，找出最便宜的渠道源，并可以一键应用到您的实例。数据会自动缓存 24 小时，下次访问时自动加载。"
        style={{ marginBottom: 16 }}
        closable
      />

      {/* Cache status summary */}
      {cacheLoaded && ratioData.length > 0 && (
        <Alert
          type="success"
          showIcon
          icon={<DatabaseOutlined />}
          message={
            <Space>
              <span>缓存状态</span>
              {ratioData.some((d) => d.isFromCache) && (
                <Tag color="blue">已加载 {ratioData.filter((d) => d.isFromCache).length} 个缓存</Tag>
              )}
              {ratioData.some((d) => !d.isFromCache) && (
                <Tag color="green">已获取 {ratioData.filter((d) => !d.isFromCache).length} 个实时数据</Tag>
              )}
            </Space>
          }
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      {/* Controls */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Channel Group Selection */}
          <div>
            <Text strong style={{ marginBottom: 8, display: 'block' }}>选择渠道源分组:</Text>
            {Array.from(
              sources.reduce((map, source) => {
                const baseName = source.name;
                if (!map.has(baseName)) {
                  map.set(baseName, []);
                }
                map.get(baseName)!.push(source);
                return map;
              }, new Map<string, ChannelSource[]>())
            ).map(([channelName, channelSources]) => {
              // Only show channels with multiple groups
              if (channelSources.length === 1 && !channelSources[0].groupName) {
                // Single source without group, use simple checkbox
                const source = channelSources[0];
                const isSelected = selectedGroups.get(channelName)?.has(source.id!) || false;
                return (
                  <div key={channelName} style={{ marginBottom: 8 }}>
                    <Checkbox
                      checked={isSelected}
                      onChange={(e) => {
                        const newGroups = new Map(selectedGroups);
                        if (e.target.checked) {
                          newGroups.set(channelName, new Set([source.id!]));
                        } else {
                          newGroups.delete(channelName);
                        }
                        setSelectedGroups(newGroups);
                      }}
                    >
                      {channelName}
                    </Checkbox>
                  </div>
                );
              }

              // Multiple groups or has group names
              const selectedIds = selectedGroups.get(channelName) || new Set();
              return (
                <div key={channelName} style={{ marginBottom: 12 }}>
                  <Text strong>{channelName}:</Text>
                  <Space style={{ marginLeft: 16 }} wrap>
                    {channelSources.map((source) => (
                      <Checkbox
                        key={source.id}
                        checked={selectedIds.has(source.id!)}
                        onChange={(e) => {
                          const newGroups = new Map(selectedGroups);
                          const newIds = new Set(selectedIds);
                          if (e.target.checked) {
                            newIds.add(source.id!);
                          } else {
                            newIds.delete(source.id!);
                          }
                          if (newIds.size > 0) {
                            newGroups.set(channelName, newIds);
                          } else {
                            newGroups.delete(channelName);
                          }
                          setSelectedGroups(newGroups);
                        }}
                      >
                        {source.groupName || '默认'}
                      </Checkbox>
                    ))}
                  </Space>
                </div>
              );
            })}
          </div>

          <Space wrap>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={fetchRatios}
              loading={loading}
              disabled={actualSelectedSourceIds.length === 0}
            >
              获取倍率 ({actualSelectedSourceIds.length})
            </Button>
          </Space>

          {ratioData.length > 0 && (
            <Space wrap>
              <Input
                placeholder="搜索模型名称"
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                style={{ width: 250 }}
              />
              <Select
                mode="multiple"
                placeholder="筛选模型提供商"
                value={selectedProviders}
                onChange={setSelectedProviders}
                style={{ minWidth: 200 }}
                maxTagCount="responsive"
                allowClear
              >
                {allProviders.map(provider => (
                  <Select.Option key={provider} value={provider}>
                    {provider}
                  </Select.Option>
                ))}
              </Select>
              <Space direction="vertical" size="small">
                <Space>
                  <Switch
                    checked={showRealCost}
                    onChange={setShowRealCost}
                  />
                  <span style={{ fontSize: 14 }}>显示实际成本（含汇率）</span>
                  <Tooltip title="开启后，价格会根据渠道源的充值汇率转换为人民币显示">
                    <InfoCircleOutlined style={{ color: '#999', cursor: 'help' }} />
                  </Tooltip>
                </Space>
                <Space>
                  <Switch
                    checked={showUnsetOnly}
                    onChange={(checked) => {
                      setShowUnsetOnly(checked);
                      if (checked && ownedModels.size === 0) {
                        fetchOwnedModels();
                      }
                    }}
                    loading={loadingOwned}
                  />
                  <span style={{ fontSize: 14 }}>只看未设置倍率的模型</span>
                  <Tooltip title="只显示在您的实例中已启用但还没有配置倍率的模型">
                    <InfoCircleOutlined style={{ color: '#999', cursor: 'help' }} />
                  </Tooltip>
                </Space>
              </Space>
              <Button
                type="default"
                icon={<SyncOutlined />}
                disabled={selectedModels.size === 0}
                onClick={() => setApplyModalVisible(true)}
              >
                应用选中的倍率 ({selectedModels.size})
              </Button>
              <Text type="secondary">
                共 {filteredRows.length} 个模型
                {showUnsetOnly && ownedModels.size > 0 && ` (实例中已启用 ${ownedModels.size} 个)`}
              </Text>
            </Space>
          )}
        </Space>
      </Card>

      {/* Error */}
      {error && (
        <Alert
          type="error"
          showIcon
          message="获取失败"
          description={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(undefined)}
        />
      )}

      {/* Failed sources details */}
      {ratioData.length > 0 && ratioData.some((d) => !d.success) && (
        <Alert
          type="warning"
          showIcon
          message="部分渠道源获取失败"
          description={
            <div>
              {ratioData
                .filter((d) => !d.success)
                .map((d) => (
                  <div key={d.sourceId} style={{ marginBottom: 4 }}>
                    <Text strong>{d.sourceName}</Text>: {d.error || '未知错误'}
                  </div>
                ))}
            </div>
          }
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      {/* Loading */}
      {(loading || cacheLoading) && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin
            size="large"
            tip={cacheLoading ? '正在加载缓存数据...' : '正在获取倍率数据...'}
          />
        </div>
      )}

      {/* Table */}
      {!loading && !cacheLoading && ratioData.length > 0 && (
        <Table<ComparisonRow>
          rowKey="modelId"
          columns={columns}
          dataSource={filteredRows}
          rowSelection={rowSelection}
          size="small"
          scroll={{ x: 800 }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个模型`,
          }}
        />
      )}

      {/* Apply Modal */}
      <Modal
        title="应用倍率到您的实例"
        open={applyModalVisible}
        onCancel={() => setApplyModalVisible(false)}
        onOk={handleApplyRatios}
        confirmLoading={applying}
        okText="确认应用"
        cancelText="取消"
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message="操作说明"
            description="系统将使用每个模型的最低倍率（来自最便宜的渠道源），并加上您设置的加价比例，更新到您的 New API 实例。"
          />

          <Space>
            <Text>加价比例:</Text>
            <InputNumber
              value={markupPercent}
              onChange={(v) => setMarkupPercent(v ?? 20)}
              min={0}
              max={200}
              step={5}
              formatter={(value) => `${value}%`}
              parser={(value) => value?.replace('%', '') as unknown as number}
              style={{ width: 120 }}
            />
            <Text type="secondary">
              (在最低倍率基础上加价，例如 20% 表示最终倍率 = 最低倍率 × 1.2)
            </Text>
          </Space>

          <div>
            <Text strong>将要更新 {selectedModels.size} 个模型:</Text>
            <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
              {Array.from(selectedModels).map((modelId) => {
                const row = comparisonRows.find((r) => r.modelId === modelId);
                if (!row || !row.lowestSourceId) return null;

                const lowestRatios = row.sources[row.lowestSourceId];
                const sourceName = ratioData.find((d) => d.sourceId === row.lowestSourceId)?.sourceName;
                const finalRatio = lowestRatios.modelRatio * (1 + markupPercent / 100);

                return (
                  <div key={modelId} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Text>{modelId}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      来源: {sourceName} | 原倍率: {lowestRatios.modelRatio.toFixed(4)} → 最终倍率: {finalRatio.toFixed(4)}
                    </Text>
                  </div>
                );
              })}
            </div>
          </div>
        </Space>
      </Modal>
    </div>
  );
}
