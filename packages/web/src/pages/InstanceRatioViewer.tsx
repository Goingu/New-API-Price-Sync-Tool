import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  Select,
  Checkbox,
  Tooltip,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
  CopyOutlined,
  DeleteOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { RatioConfig, Channel, ChannelSource } from '@newapi-sync/shared';
import { useAppContext } from '../context/AppContext';
import {
  getChannelSources,
  compareChannelSourceRatios,
  proxyForward,
  fetchChannels,
} from '../api/client';

const { Title, Text } = Typography;

// --- Source Ratio Comparison Sub-component ---

interface SourceComparisonRow {
  modelId: string;
  sourceModelRatio?: number;
  sourceCompletionRatio?: number;
  sourceModelPrice?: number;
  localModelRatio?: number;
  localCompletionRatio?: number;
  localModelPrice?: number;
  hasDiff: boolean;
}

function SourceRatioContent({
  sourceRatioConfig,
  localRatioConfig,
  focusModelId,
  sourceSearch,
  setSourceSearch,
  selectedSyncModels,
  setSelectedSyncModels,
  syncMarkupPercent,
  setSyncMarkupPercent,
  syncing,
  onSync,
}: {
  sourceRatioConfig: RatioConfig;
  localRatioConfig: RatioConfig | null;
  focusModelId: string;
  sourceSearch: string;
  setSourceSearch: (v: string) => void;
  selectedSyncModels: Set<string>;
  setSelectedSyncModels: (v: Set<string>) => void;
  syncMarkupPercent: number;
  setSyncMarkupPercent: (v: number) => void;
  syncing: boolean;
  onSync: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const allModels = new Set([
      ...Object.keys(sourceRatioConfig.modelRatio || {}),
      ...Object.keys(sourceRatioConfig.modelPrice || {}),
    ]);

    const result: SourceComparisonRow[] = [];
    allModels.forEach(modelId => {
      const srcMR = sourceRatioConfig.modelRatio?.[modelId];
      const srcCR = sourceRatioConfig.completionRatio?.[modelId];
      const srcMP = sourceRatioConfig.modelPrice?.[modelId];
      const locMR = localRatioConfig?.modelRatio?.[modelId];
      const locCR = localRatioConfig?.completionRatio?.[modelId];
      const locMP = localRatioConfig?.modelPrice?.[modelId];

      const hasDiff = srcMR !== locMR || srcCR !== locCR || srcMP !== locMP;

      result.push({
        modelId,
        sourceModelRatio: srcMR,
        sourceCompletionRatio: srcCR,
        sourceModelPrice: srcMP,
        localModelRatio: locMR,
        localCompletionRatio: locCR,
        localModelPrice: locMP,
        hasDiff,
      });
    });

    return result.sort((a, b) => a.modelId.localeCompare(b.modelId));
  }, [sourceRatioConfig, localRatioConfig]);

  const filtered = useMemo(() => {
    // If not showing all, only show the focused model
    if (!showAll) {
      return rows.filter(r => r.modelId === focusModelId);
    }
    // When showing all, apply search filter
    if (!sourceSearch.trim()) return rows;
    const q = sourceSearch.toLowerCase();
    return rows.filter(r => r.modelId.toLowerCase().includes(q));
  }, [rows, focusModelId, showAll, sourceSearch]);

  const sourceColumns: ColumnsType<SourceComparisonRow> = [
    {
      title: '模型名称',
      dataIndex: 'modelId',
      width: 250,
      sorter: (a, b) => a.modelId.localeCompare(b.modelId),
    },
    {
      title: '渠道源倍率',
      key: 'sourceRatio',
      width: 150,
      render: (_, r) => {
        if (r.sourceModelPrice !== undefined && r.sourceModelPrice > 0) {
          return <Text>{r.sourceModelPrice.toFixed(6)}/次</Text>;
        }
        return <Text>{(r.sourceModelRatio ?? 1).toFixed(4)} / {(r.sourceCompletionRatio ?? 1).toFixed(2)}</Text>;
      },
    },
    {
      title: '当前实例倍率',
      key: 'localRatio',
      width: 150,
      render: (_, r) => {
        if (r.localModelPrice !== undefined && r.localModelPrice > 0) {
          return <Text>{r.localModelPrice.toFixed(6)}/次</Text>;
        }
        if (r.localModelRatio === undefined && r.localModelPrice === undefined) {
          return <Text type="secondary">未配置</Text>;
        }
        return <Text>{(r.localModelRatio ?? 1).toFixed(4)} / {(r.localCompletionRatio ?? 1).toFixed(2)}</Text>;
      },
    },
    {
      title: '差异',
      key: 'diff',
      width: 80,
      filters: [{ text: '有差异', value: 'diff' }],
      onFilter: (_, r) => r.hasDiff,
      render: (_, r) => r.hasDiff ? <Tag color="warning">不同</Tag> : <Tag color="success">一致</Tag>,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space>
        <Checkbox checked={showAll} onChange={e => setShowAll(e.target.checked)}>
          显示该渠道源全部模型
        </Checkbox>
        {showAll && (
          <>
            <Input
              placeholder="搜索模型名称"
              prefix={<SearchOutlined />}
              value={sourceSearch}
              onChange={e => setSourceSearch(e.target.value)}
              allowClear
              style={{ width: 250 }}
            />
            <Text type="secondary">共 {filtered.length} 个模型</Text>
          </>
        )}
      </Space>

      <Table<SourceComparisonRow>
        rowKey="modelId"
        columns={sourceColumns}
        dataSource={filtered}
        size="small"
        scroll={{ y: 400 }}
        pagination={false}
        rowSelection={{
          selectedRowKeys: Array.from(selectedSyncModels),
          onChange: (keys) => setSelectedSyncModels(new Set(keys as string[])),
        }}
      />

      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Text>加价百分比:</Text>
          <InputNumber
            value={syncMarkupPercent}
            onChange={v => setSyncMarkupPercent(v ?? 0)}
            min={0}
            max={500}
            addonAfter="%"
            style={{ width: 120 }}
          />
        </Space>
        <Button
          type="primary"
          icon={<SyncOutlined />}
          onClick={onSync}
          loading={syncing}
          disabled={selectedSyncModels.size === 0}
        >
          同步选中倍率 ({selectedSyncModels.size})
        </Button>
      </Space>
    </Space>
  );
}

// --- Main Component ---

interface RatioRow {
  modelId: string;
  provider: string;
  modelRatio: number;
  completionRatio: number;
  inputPrice: number;
  outputPrice: number;
  isAvailable?: boolean;
  pricingType?: 'per_token' | 'per_request';
  pricePerRequest?: number;
  channelNames?: string; // 渠道商名称列表
  channelDetails?: { name: string; id: number; baseUrl?: string; key?: string }[]; // 渠道连接信息
  isConfigured: boolean; // 是否在倍率配置中有明确条目
}

export default function InstanceRatioViewer() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [ratioConfig, setRatioConfig] = useState<RatioConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<string>();
  const [showUnsetOnly, setShowUnsetOnly] = useState(false);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [availableModels, setAvailableModels] = useState<Set<string>>(new Set());
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelSources, setChannelSources] = useState<ChannelSource[]>([]);

  // Source ratio modal state
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceRatioConfig, setSourceRatioConfig] = useState<RatioConfig | null>(null);
  const [sourceChannelName, setSourceChannelName] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [selectedSyncModels, setSelectedSyncModels] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMarkupPercent, setSyncMarkupPercent] = useState(0);
  const [sourceModelId, setSourceModelId] = useState<string>('');

  // Cache key for localStorage
  const getCacheKey = () => {
    if (!connection) return null;
    return `instance-ratio-cache-${connection.baseUrl}`;
  };

  // Load cached data on mount
  useEffect(() => {
    const cacheKey = getCacheKey();
    if (!cacheKey) return;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { ratioConfig: cachedConfig, fetchedAt, availableModels: cachedModels } = JSON.parse(cached);
        setRatioConfig(cachedConfig);
        setLastFetchedAt(fetchedAt);
        if (cachedModels) {
          setAvailableModels(new Set(cachedModels));
        }
      }
    } catch (err: unknown) {
      console.error('Failed to load cached ratio config:', err);
    }
  }, [connection?.baseUrl]);

  // Fetch available models from instance
  const fetchAvailableModels = async () => {
    if (!connection) return null;

    setLoadingModels(true);
    try {
      // Use /api/pricing endpoint to get owned models (same as ComparisonUpdate page)
      const resp = await proxyForward<{ success: boolean; data: Array<{ model_name: string }> }>(
        connection,
        'GET',
        '/api/pricing'
      );

      if (resp.success && resp.data) {
        // Handle both direct array and nested data structure
        let dataArray: Array<{ model_name: string }> = [];
        
        if (Array.isArray(resp.data)) {
          // Direct array response
          dataArray = resp.data;
        } else if (resp.data.data && Array.isArray(resp.data.data)) {
          // Nested data.data response
          dataArray = resp.data.data;
        } else {
          // Try to extract from object with numeric keys
          const dataObj = resp.data as any;
          
          // Flatten all arrays from numeric keys
          Object.keys(dataObj).forEach(key => {
            if (Array.isArray(dataObj[key])) {
              dataArray = dataArray.concat(dataObj[key]);
            }
          });
        }
        
        const modelList: string[] = [];
        dataArray.forEach((item) => {
          if (item && item.model_name) {
            modelList.push(item.model_name);
          }
        });
        
        
        const models = new Set(modelList);
        setAvailableModels(models);
        return models;
      } else {
      }
    } catch (err: unknown) {
      console.error('Failed to fetch available models:', err);
    } finally {
      setLoadingModels(false);
    }
    return null;
  };

  const fetchRatios = async () => {
    if (!connection) {
      message.warning('请先在设置页面配置 New API 连接');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      // Fetch ratio config, available models, channels, and channel sources
      const [ratioResp, models, channelResp, sourcesResp] = await Promise.all([
        proxyForward<{
          data: {
            model_ratio: Record<string, number>;
            completion_ratio: Record<string, number>;
            model_price?: Record<string, number>;
          };
        }>(connection, 'GET', '/api/ratio_config'),
        fetchAvailableModels(),
        fetchChannels(connection),
        getChannelSources().catch(() => ({ success: false, sources: [] as ChannelSource[] })),
      ]);


      // Store channels data
      if (channelResp.success && channelResp.data) {
        const channelList: Channel[] = Array.isArray(channelResp.data)
          ? channelResp.data
          : (channelResp.data as any)?.data || [];
        setChannels(channelList);
      }

      // Store channel sources
      if (sourcesResp.success && sourcesResp.sources) {
        setChannelSources(sourcesResp.sources);
      }

      if (ratioResp.success && ratioResp.data?.data) {
        const rawData = ratioResp.data.data;
        
        // Convert snake_case to camelCase
        const ratioConfig: RatioConfig = {
          modelRatio: rawData.model_ratio || {},
          completionRatio: rawData.completion_ratio || {},
          modelPrice: rawData.model_price,
        };

        // Validate the response data structure
        if (!ratioConfig.modelRatio || typeof ratioConfig.modelRatio !== 'object') {
          console.error('Invalid ratio config structure:', rawData);
          setError('返回的数据格式不正确：缺少 model_ratio 字段');
          return;
        }

        const fetchedAt = new Date().toISOString();
        setRatioConfig(ratioConfig);
        setLastFetchedAt(fetchedAt);

        // Save to localStorage
        const cacheKey = getCacheKey();
        if (cacheKey) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ 
              ratioConfig, 
              fetchedAt,
              availableModels: models ? Array.from(models) : [],
            }));
          } catch (err: unknown) {
            console.error('Failed to save ratio config to cache:', err);
          }
        }

        const modelCount = Object.keys(ratioConfig.modelRatio).length;
        const availableCount = models ? models.size : 0;
        message.success(`成功获取 ${modelCount} 个模型的倍率配置，实例支持 ${availableCount} 个模型`);
      } else {
        const errorMsg = ratioResp.error || '获取倍率失败';
        console.error('Fetch ratios failed:', errorMsg);
        setError(errorMsg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Fetch ratios error:', err);
      setError(`请求失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // Extract provider from model ID (e.g., "gpt-4" -> "openai", "gemini-pro" -> "google")
  const extractProvider = (modelId: string): string => {
    const lowerModelId = modelId.toLowerCase();
    
    // OpenAI models
    if (lowerModelId.includes('gpt') || lowerModelId.includes('o1') || lowerModelId.includes('chatgpt')) {
      return 'OpenAI';
    }
    // Anthropic models
    if (lowerModelId.includes('claude')) {
      return 'Anthropic';
    }
    // Google models
    if (lowerModelId.includes('gemini') || lowerModelId.includes('palm')) {
      return 'Google';
    }
    // Meta models
    if (lowerModelId.includes('llama')) {
      return 'Meta';
    }
    // Mistral models
    if (lowerModelId.includes('mistral')) {
      return 'Mistral';
    }
    // Cohere models
    if (lowerModelId.includes('command')) {
      return 'Cohere';
    }
    // DeepSeek models
    if (lowerModelId.includes('deepseek')) {
      return 'DeepSeek';
    }
    // Qwen models
    if (lowerModelId.includes('qwen')) {
      return 'Qwen';
    }
    // 360 models
    if (lowerModelId.includes('360gpt')) {
      return '360AI';
    }
    // Baichuan models
    if (lowerModelId.includes('baichuan')) {
      return 'Baichuan';
    }
    // Yi models
    if (lowerModelId.includes('yi-')) {
      return 'Yi';
    }
    // Moonshot models
    if (lowerModelId.includes('moonshot')) {
      return 'Moonshot';
    }
    // Doubao models
    if (lowerModelId.includes('doubao')) {
      return 'Doubao';
    }
    // Hunyuan models
    if (lowerModelId.includes('hunyuan')) {
      return 'Hunyuan';
    }
    // GLM models
    if (lowerModelId.includes('glm') || lowerModelId.includes('chatglm')) {
      return 'Zhipu';
    }
    // Spark models
    if (lowerModelId.includes('spark')) {
      return 'iFlytek';
    }
    // ERNIE models
    if (lowerModelId.includes('ernie')) {
      return 'Baidu';
    }
    
    return 'Other';
  };

  // Build table rows
  const ratioRows: RatioRow[] = useMemo(() => {
    if (!ratioConfig) return [];

    const rows: RatioRow[] = [];
    const processedModels = new Set<string>();

    // Build model to channels mapping (including model_mapping)
    const modelToChannels = new Map<string, string[]>();
    const modelToChannelDetails = new Map<string, { name: string; id: number; baseUrl?: string; key?: string }[]>();
    channels.forEach(channel => {
      if (!channel.models) return;
      const modelList = channel.models.split(',').map(m => m.trim()).filter(Boolean);

      // Parse model_mapping: maps original model name -> exposed model name
      let mapping: Record<string, string> = {};
      if (channel.model_mapping && channel.model_mapping.trim()) {
        try {
          mapping = JSON.parse(channel.model_mapping);
        } catch { /* ignore */ }
      }

      const detail = { name: channel.name, id: channel.id, baseUrl: channel.base_url, key: channel.key };

      // Collect all model names this channel exposes
      const exposedNames = new Set<string>();
      modelList.forEach(modelId => {
        exposedNames.add(modelId);
        // If this model is mapped to a different name, also add the mapped name
        if (mapping[modelId]) {
          exposedNames.add(mapping[modelId]);
        }
      });
      // Also add mapping targets where the key might not be in models list
      Object.values(mapping).forEach(target => exposedNames.add(target));

      exposedNames.forEach(modelId => {
        if (!modelToChannels.has(modelId)) {
          modelToChannels.set(modelId, []);
        }
        modelToChannels.get(modelId)!.push(channel.name);

        if (!modelToChannelDetails.has(modelId)) {
          modelToChannelDetails.set(modelId, []);
        }
        const details = modelToChannelDetails.get(modelId)!;
        // Deduplicate by channel name
        if (!details.some(d => d.name === channel.name)) {
          details.push(detail);
        }
      });
    });

    // Combine all unique model IDs from modelRatio, modelPrice, and availableModels
    const allModelIds = new Set([
      ...(ratioConfig.modelRatio ? Object.keys(ratioConfig.modelRatio) : []),
      ...(ratioConfig.modelPrice ? Object.keys(ratioConfig.modelPrice) : []),
      ...(availableModels.size > 0 ? Array.from(availableModels) : []),
    ]);


    // Process each model
    allModelIds.forEach((modelId) => {
      const modelRatio = ratioConfig.modelRatio?.[modelId] ?? 1;
      const completionRatio = ratioConfig.completionRatio?.[modelId] ?? 1;
      const pricePerRequest = ratioConfig.modelPrice?.[modelId];

      // Determine pricing type based on whether pricePerRequest exists
      const pricingType: 'per_token' | 'per_request' = pricePerRequest !== undefined ? 'per_request' : 'per_token';

      const inputPrice = modelRatio * 0.75;
      const outputPrice = inputPrice * completionRatio;
      const provider = extractProvider(modelId);
      const isAvailable = availableModels.size > 0 ? availableModels.has(modelId) : undefined;

      // Check if model has an explicit entry in ratio config
      const hasModelRatio = ratioConfig.modelRatio ? modelId in ratioConfig.modelRatio : false;
      const hasModelPrice = ratioConfig.modelPrice ? modelId in ratioConfig.modelPrice : false;
      const isConfigured = hasModelRatio || hasModelPrice;

      // Get channel names for this model
      const channelNames = modelToChannels.get(modelId)?.join(', ') || '';
      const channelDetails = modelToChannelDetails.get(modelId) || [];

      rows.push({
        modelId,
        provider,
        modelRatio,
        completionRatio,
        inputPrice,
        outputPrice,
        isAvailable,
        pricingType,
        pricePerRequest,
        channelNames,
        channelDetails,
        isConfigured,
      });
      processedModels.add(modelId);
    });


    return rows;
  }, [ratioConfig, availableModels, channels]);

  // Get unique providers for filter
  const allProviders = Array.from(new Set(ratioRows.map(r => r.provider))).sort();

  // Filter by search and selected providers
  const filteredRows = ratioRows.filter((r) => {
    const matchesSearch = search.trim()
      ? r.modelId.toLowerCase().includes(search.toLowerCase())
      : true;
    const matchesProvider = selectedProviders.length > 0
      ? selectedProviders.includes(r.provider)
      : true;
    // "仅显示未配置倍率" = 模型在倍率配置中没有明确条目
    // 如果已加载可用模型列表，还要求模型是真实拥有的
    const matchesUnset = showUnsetOnly
      ? !r.isConfigured && (availableModels.size === 0 || r.isAvailable === true)
      : true;
    const matchesAvailable = showAvailableOnly
      ? r.isAvailable === true
      : true;
    return matchesSearch && matchesProvider && matchesUnset && matchesAvailable;
  });

  // Count unset models (not configured in ratio config)
  const unsetCount = ratioRows.filter(r =>
    !r.isConfigured && (availableModels.size === 0 || r.isAvailable === true)
  ).length;
  const availableCount = ratioRows.filter(r => r.isAvailable === true).length;
  const unavailableCount = ratioRows.filter(r => r.isAvailable === false).length;

  // Copy model name to clipboard
  const handleCopyModelName = (modelId: string) => {
    navigator.clipboard.writeText(modelId).then(() => {
      message.success(`已复制: ${modelId}`);
    }).catch(() => {
      message.error('复制失败');
    });
  };

  // Batch delete selected models from New API instance (remove from channels + clean ratio config)
  const handleBatchDelete = () => {
    if (selectedModelIds.length === 0) {
      message.warning('请先选择要删除的模型');
      return;
    }
    Modal.confirm({
      title: '确认删除模型',
      content: (
        <div>
          <p>确定要从 New API 实例中彻底删除选中的 <strong>{selectedModelIds.length}</strong> 个模型吗？</p>
          <p>此操作将：</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>从所有包含这些模型的渠道中移除该模型</li>
            <li>如果渠道移除后没有剩余模型，将删除该渠道</li>
            <li>同时清理实例上的倍率配置（ModelRatio、CompletionRatio、ModelPrice）</li>
          </ul>
          <p style={{ color: '#ef4444' }}>此操作不可撤销，请谨慎操作。</p>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      width: 500,
      onOk: async () => {
        if (!connection) return;
        setDeleting(true);
        const toDelete = new Set(selectedModelIds);
        let channelUpdateSuccess = 0;
        let channelUpdateFailed = 0;
        let channelDeleteSuccess = 0;
        let emptyChannelCount = 0;

        try {
          // 1. Fetch all channels from instance
          const channelResp = await fetchChannels(connection);
          if (!channelResp.success || !channelResp.data) {
            message.error('获取渠道列表失败: ' + (channelResp.error || '未知错误'));
            return;
          }

          const allChannels: Channel[] = Array.isArray(channelResp.data)
            ? channelResp.data
            : (channelResp.data as any)?.data || [];

          // 2. Find channels that contain any of the selected models and update them
          for (const ch of allChannels) {
            if (!ch.models) continue;
            const currentModels = ch.models.split(',').map((m) => m.trim()).filter(Boolean);
            const filteredModels = currentModels.filter((m) => !toDelete.has(m));

            if (filteredModels.length === currentModels.length) continue; // no change needed

            if (filteredModels.length === 0) {
              // Channel would be empty - delete it
              emptyChannelCount++;
              try {
                const delResp = await proxyForward(connection, 'DELETE', `/api/channel/${ch.id}`);
                if (delResp.success) {
                  channelDeleteSuccess++;
                } else {
                  console.error(`Failed to delete empty channel ${ch.id}:`, delResp.error);
                  channelUpdateFailed++;
                }
              } catch (err: unknown) {
                console.error(`Failed to delete empty channel ${ch.id}:`, err);
                channelUpdateFailed++;
              }
            } else {
              // Update channel with remaining models
              try {
                const updateResp = await proxyForward(connection, 'PUT', '/api/channel/', {
                  id: ch.id,
                  models: filteredModels.join(','),
                });
                if (updateResp.success) {
                  channelUpdateSuccess++;
                } else {
                  console.error(`Failed to update channel ${ch.id}:`, updateResp.error);
                  channelUpdateFailed++;
                }
              } catch (err: unknown) {
                console.error(`Failed to update channel ${ch.id}:`, err);
                channelUpdateFailed++;
              }
            }
          }

          // 3. Clean up ratio config
          const ratioResp = await proxyForward<{
            data: {
              model_ratio: Record<string, number>;
              completion_ratio: Record<string, number>;
              model_price?: Record<string, number>;
            };
          }>(connection, 'GET', '/api/ratio_config');

          if (ratioResp.success && ratioResp.data?.data) {
            const raw = ratioResp.data.data;
            const updatedModelRatio = { ...raw.model_ratio };
            const updatedCompletionRatio = { ...raw.completion_ratio };
            const updatedModelPrice = raw.model_price ? { ...raw.model_price } : undefined;

            toDelete.forEach((id) => {
              delete updatedModelRatio[id];
              delete updatedCompletionRatio[id];
              if (updatedModelPrice) delete updatedModelPrice[id];
            });

            const payloads: { key: string; value: string }[] = [
              { key: 'ModelRatio', value: JSON.stringify(updatedModelRatio) },
              { key: 'CompletionRatio', value: JSON.stringify(updatedCompletionRatio) },
            ];
            if (updatedModelPrice) {
              payloads.push({ key: 'ModelPrice', value: JSON.stringify(updatedModelPrice) });
            }

            for (const payload of payloads) {
              const putResp = await proxyForward(connection, 'PUT', '/api/option/', payload);
              if (!putResp.success) {
                console.error(`Failed to update ${payload.key}:`, putResp.error);
              }
            }

            // Update local ratio state
            const newRatioConfig: RatioConfig = {
              modelRatio: updatedModelRatio,
              completionRatio: updatedCompletionRatio,
              modelPrice: updatedModelPrice,
            };
            setRatioConfig(newRatioConfig);

            // Update localStorage cache
            const cacheKey = getCacheKey();
            if (cacheKey) {
              try {
                const newAvailable = new Set(availableModels);
                toDelete.forEach((id) => newAvailable.delete(id));
                setAvailableModels(newAvailable);
                localStorage.setItem(cacheKey, JSON.stringify({
                  ratioConfig: newRatioConfig,
                  fetchedAt: new Date().toISOString(),
                  availableModels: Array.from(newAvailable),
                }));
              } catch (err: unknown) {
                console.error('Failed to update cache:', err);
              }
            }
          }

          // 4. Show result summary
          const parts: string[] = [];
          parts.push(`已删除 ${toDelete.size} 个模型`);
          if (channelUpdateSuccess > 0) parts.push(`更新了 ${channelUpdateSuccess} 个渠道`);
          if (channelDeleteSuccess > 0) parts.push(`删除了 ${channelDeleteSuccess} 个空渠道`);
          if (channelUpdateFailed > 0) parts.push(`${channelUpdateFailed} 个渠道操作失败`);

          if (channelUpdateFailed > 0) {
            message.warning(parts.join('，'));
          } else {
            message.success(parts.join('，'));
          }

          setSelectedModelIds([]);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          message.error(`删除失败: ${msg}`);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  // Open source ratio modal for a channel
  const handleOpenSourceRatio = useCallback(async (modelId: string, detail: { name: string; id: number; baseUrl?: string; key?: string }) => {
    if (!detail.baseUrl) {
      message.warning(`渠道「${detail.name}」没有 base_url，无法查询上游倍率`);
      return;
    }

    // Match channel's base_url to a configured channel source
    const normalizeUrl = (u: string) => u.replace(/\/+$/, '').toLowerCase();
    const channelBaseUrl = normalizeUrl(detail.baseUrl);
    const matchedSource = channelSources.find(s =>
      s.enabled && normalizeUrl(s.baseUrl) === channelBaseUrl
    );

    if (!matchedSource || !matchedSource.id) {
      message.warning(`未找到与「${detail.name}」(${detail.baseUrl}) 匹配的渠道源配置，请先在「渠道源管理」中添加该上游`);
      return;
    }

    setSourceChannelName(detail.name);
    setSourceModelId(modelId);
    setSourceModalVisible(true);
    setSourceLoading(true);
    setSourceRatioConfig(null);
    setSelectedSyncModels(new Set());
    setSourceSearch('');

    try {
      // Use the backend compare-ratios endpoint (same as 实例站倍率同步)
      const resp = await compareChannelSourceRatios([matchedSource.id]);

      if (resp.success && resp.results.length > 0) {
        const result = resp.results[0];
        if (result.success && result.ratioConfig) {
          setSourceRatioConfig(result.ratioConfig);
        } else {
          message.error('获取渠道源倍率失败: ' + (result.error || '未知错误'));
          setSourceModalVisible(false);
        }
      } else {
        message.error('获取渠道源倍率失败');
        setSourceModalVisible(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`请求渠道源失败: ${msg}`);
      setSourceModalVisible(false);
    } finally {
      setSourceLoading(false);
    }
  }, [channelSources]);

  // Sync selected models from source to own instance
  const handleSyncSourceRatios = useCallback(async () => {
    if (!connection || !sourceRatioConfig) return;
    if (selectedSyncModels.size === 0) {
      message.warning('请至少选择一个模型');
      return;
    }

    setSyncing(true);
    try {
      // Get current instance ratios
      const currentResp = await proxyForward<{ data: any }>(connection, 'GET', '/api/ratio_config');
      if (!currentResp.success || !currentResp.data) {
        throw new Error('获取当前倍率失败');
      }

      const apiData = currentResp.data.data || currentResp.data;
      const currentConfig: RatioConfig = {
        modelRatio: apiData.model_ratio || apiData.modelRatio || {},
        completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
        modelPrice: apiData.model_price || apiData.modelPrice || {},
      };

      const markup = 1 + syncMarkupPercent / 100;
      let updateCount = 0;

      for (const modelId of selectedSyncModels) {
        const srcModelPrice = sourceRatioConfig.modelPrice?.[modelId];

        // Per-request model: has modelPrice entry
        if (srcModelPrice !== undefined) {
          if (!currentConfig.modelPrice) currentConfig.modelPrice = {};
          currentConfig.modelPrice[modelId] = srcModelPrice * markup;
          updateCount++;
          continue;
        }

        // Token-based model: use modelRatio + completionRatio
        const srcModelRatio = sourceRatioConfig.modelRatio?.[modelId];
        if (srcModelRatio === undefined) continue;

        currentConfig.modelRatio[modelId] = srcModelRatio * markup;
        currentConfig.completionRatio[modelId] = sourceRatioConfig.completionRatio?.[modelId] ?? 1;
        updateCount++;
      }

      if (updateCount === 0) {
        message.warning('没有可更新的模型');
        return;
      }

      const payloads: { key: string; value: string }[] = [
        { key: 'ModelRatio', value: JSON.stringify(currentConfig.modelRatio) },
        { key: 'CompletionRatio', value: JSON.stringify(currentConfig.completionRatio) },
      ];
      if (currentConfig.modelPrice && Object.keys(currentConfig.modelPrice).length > 0) {
        payloads.push({ key: 'ModelPrice', value: JSON.stringify(currentConfig.modelPrice) });
      }

      for (const payload of payloads) {
        const resp = await proxyForward(connection, 'PUT', '/api/option/', payload);
        if (!resp.success) {
          throw new Error(`更新 ${payload.key} 失败: ${resp.error ?? '未知错误'}`);
        }
      }

      message.success(`成功同步 ${updateCount} 个模型的倍率`);
      setSourceModalVisible(false);
      // Refresh local data
      fetchRatios();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`同步失败: ${msg}`);
    } finally {
      setSyncing(false);
    }
  }, [connection, sourceRatioConfig, selectedSyncModels, syncMarkupPercent]);

  // Row selection config for batch delete
  const rowSelection = {
    selectedRowKeys: selectedModelIds,
    onChange: (keys: React.Key[]) => setSelectedModelIds(keys as string[]),
  };

  // Table columns
  const columns: ColumnsType<RatioRow> = [
    {
      title: '模型名称',
      dataIndex: 'modelId',
      key: 'modelId',
      fixed: 'left',
      width: 300,
      sorter: (a, b) => a.modelId.localeCompare(b.modelId),
      render: (modelId: string, record: RatioRow) => {
        return (
          <Space>
            <Tooltip title="点击复制模型名称">
              <span
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleCopyModelName(modelId)}
              >
                {modelId}
                <CopyOutlined style={{ marginLeft: 8, color: '#3b82f6', fontSize: 12 }} />
              </span>
            </Tooltip>
            {record.isAvailable !== undefined && (
              record.isAvailable ? (
                <Tag color="success">可用</Tag>
              ) : (
                <Tag color="default">不可用</Tag>
              )
            )}
          </Space>
        );
      },
    },
    {
      title: '模型商',
      dataIndex: 'provider',
      key: 'provider',
      width: 120,
      sorter: (a, b) => a.provider.localeCompare(b.provider),
      render: (provider: string) => {
        const colors: Record<string, string> = {
          'OpenAI': 'green',
          'Anthropic': 'orange',
          'Google': 'blue',
          'Meta': 'purple',
          'Mistral': 'cyan',
          'DeepSeek': 'magenta',
          'Qwen': 'red',
          'Zhipu': 'geekblue',
          'Other': 'default',
        };
        return <Tag color={colors[provider] || 'default'}>{provider}</Tag>;
      },
    },
    {
      title: '渠道商',
      dataIndex: 'channelNames',
      key: 'channelNames',
      width: 200,
      ellipsis: {
        showTitle: false,
      },
      render: (_: string, record: RatioRow) => {
        const details = record.channelDetails;
        if (!details || details.length === 0) {
          return <Text type="secondary">-</Text>;
        }
        // Deduplicate by name
        const seen = new Set<string>();
        const unique = details.filter(d => {
          if (seen.has(d.name)) return false;
          seen.add(d.name);
          return true;
        });
        return (
          <Space size={[4, 0]} wrap>
            {unique.map((d, i) => (
              <span key={d.name}>
                <a
                  onClick={(e) => { e.stopPropagation(); handleOpenSourceRatio(record.modelId, d); }}
                  style={{ fontSize: 12 }}
                >
                  {d.name}
                </a>
                {i < unique.length - 1 && <Text type="secondary">, </Text>}
              </span>
            ))}
          </Space>
        );
      },
    },
    {
      title: '计费类型',
      dataIndex: 'pricingType',
      key: 'pricingType',
      width: 100,
      filters: [
        { text: '按 Token', value: 'per_token' },
        { text: '按次', value: 'per_request' },
      ],
      onFilter: (value, record) => record.pricingType === value,
      render: (type?: string) =>
        type === 'per_request' ? (
          <Tag color="orange">按次</Tag>
        ) : (
          <Tag color="blue">按 Token</Tag>
        ),
    },
    {
      title: '模型倍率',
      dataIndex: 'modelRatio',
      key: 'modelRatio',
      width: 120,
      sorter: (a, b) => a.modelRatio - b.modelRatio,
      render: (ratio: number, record: RatioRow) => {
        if (record.pricingType === 'per_request') {
          return <span style={{ color: '#a1a1aa' }}>不适用</span>;
        }
        const isUnset = record.isAvailable === true && ratio === 1 && record.completionRatio === 1;
        return (
          <span style={{ color: isUnset ? '#ef4444' : undefined }}>
            {ratio.toFixed(4)}
            {isUnset && ' ⚠️'}
          </span>
        );
      },
    },
    {
      title: '补全倍率',
      dataIndex: 'completionRatio',
      key: 'completionRatio',
      width: 120,
      sorter: (a, b) => a.completionRatio - b.completionRatio,
      render: (ratio: number, record: RatioRow) => {
        if (record.pricingType === 'per_request') {
          return <span style={{ color: '#a1a1aa' }}>不适用</span>;
        }
        const isUnset = record.isAvailable === true && record.modelRatio === 1 && ratio === 1;
        return (
          <span style={{ color: isUnset ? '#ef4444' : undefined }}>
            {ratio.toFixed(2)}
            {isUnset && ' ⚠️'}
          </span>
        );
      },
    },
    {
      title: '输入价格 (USD/M)',
      dataIndex: 'inputPrice',
      key: 'inputPrice',
      width: 150,
      sorter: (a, b) => a.inputPrice - b.inputPrice,
      render: (price: number, record: RatioRow) => {
        if (record.pricingType === 'per_request') {
          return <span style={{ color: '#a1a1aa' }}>不适用</span>;
        }
        return `${price.toFixed(4)}`;
      },
    },
    {
      title: '输出价格 (USD/M)',
      dataIndex: 'outputPrice',
      key: 'outputPrice',
      width: 150,
      sorter: (a, b) => a.outputPrice - b.outputPrice,
      render: (price: number, record: RatioRow) => {
        if (record.pricingType === 'per_request') {
          return <span style={{ color: '#a1a1aa' }}>不适用</span>;
        }
        return `${price.toFixed(4)}`;
      },
    },
    {
      title: '按次价格 (USD)',
      dataIndex: 'pricePerRequest',
      key: 'pricePerRequest',
      width: 150,
      sorter: (a, b) => (a.pricePerRequest || 0) - (b.pricePerRequest || 0),
      render: (price: number | undefined, record: RatioRow) => {
        if (record.pricingType !== 'per_request') {
          return <span style={{ color: '#a1a1aa' }}>不适用</span>;
        }
        const isUnset = record.isAvailable === true && price === undefined;
        if (price !== undefined) {
          return `${price.toFixed(6)}/次`;
        }
        return (
          <span style={{ color: isUnset ? '#ef4444' : undefined }}>
            未配置{isUnset && ' ⚠️'}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        实例模型倍率查看器
      </Title>

      <Alert
        type="info"
        showIcon
        message="功能说明"
        description="查看您在设置页面配置的 New API 实例中所有模型的倍率配置，包括模型倍率、补全倍率和对应的价格。"
        style={{ marginBottom: 16 }}
        closable
      />

      {!connection && (
        <Alert
          type="warning"
          showIcon
          message="未配置连接"
          description={
            <Space direction="vertical">
              <Text>请先在设置页面配置 New API 实例连接信息</Text>
              <Button type="primary" onClick={() => window.location.href = '/settings'}>
                前往设置
              </Button>
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {connection && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Space wrap>
              <Tag color="blue">当前实例</Tag>
              <Text strong>{connection.baseUrl}</Text>
              {lastFetchedAt && (
                <Text type="secondary">
                  最后更新: {new Date(lastFetchedAt).toLocaleString('zh-CN')}
                </Text>
              )}
              {availableModels.size > 0 && (
                <Text type="secondary">
                  (已加载 {availableModels.size} 个真实模型)
                </Text>
              )}
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchRatios}
                loading={loading}
              >
                刷新倍率
              </Button>
            </Space>

            {ratioConfig && (
              <>
                <Space wrap>
                  <Select
                    mode="multiple"
                    placeholder="筛选提供商"
                    style={{ minWidth: 250 }}
                    value={selectedProviders}
                    onChange={setSelectedProviders}
                    options={allProviders.map(p => ({ label: p, value: p }))}
                    allowClear
                    maxTagCount="responsive"
                  />
                  <Input
                    placeholder="搜索模型名称"
                    prefix={<SearchOutlined />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                    style={{ width: 250 }}
                  />
                  <Checkbox
                    checked={showUnsetOnly}
                    onChange={(e) => setShowUnsetOnly(e.target.checked)}
                  >
                    仅显示未配置倍率
                  </Checkbox>
                  <Checkbox
                    checked={showAvailableOnly}
                    onChange={(e) => setShowAvailableOnly(e.target.checked)}
                    disabled={availableModels.size === 0}
                  >
                    仅显示真实拥有的模型
                    {availableModels.size === 0 && ' (需先刷新倍率)'}
                  </Checkbox>
                </Space>
                <Space wrap>
                  <Text type="secondary">
                    共 {filteredRows.length} 个模型
                    {(search || selectedProviders.length > 0 || showUnsetOnly || showAvailableOnly) && ` (从 ${ratioRows.length} 个中筛选)`}
                  </Text>
                  {unsetCount > 0 && (
                    <Tag icon={<WarningOutlined />} color="warning">
                      {unsetCount} 个未配置倍率
                    </Tag>
                  )}
                  {availableModels.size > 0 && (
                    <>
                      <Tag color="success">
                        {availableCount} 个可用
                      </Tag>
                      {unavailableCount > 0 && (
                        <Tag color="default">
                          {unavailableCount} 个不可用
                        </Tag>
                      )}
                    </>
                  )}
                  {selectedModelIds.length > 0 && (
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleBatchDelete}
                      loading={deleting}
                    >
                      批量删除 ({selectedModelIds.length})
                    </Button>
                  )}
                </Space>
              </>
            )}
          </Space>
        </Card>
      )}

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

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="正在获取倍率数据..." />
        </div>
      )}

      {!loading && ratioConfig && (
        <Table<RatioRow>
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

      {!loading && !ratioConfig && !error && connection && (
        <Card style={{ textAlign: 'center', padding: '40px 0' }}>
          <Space direction="vertical" size="middle">
            <Text type="secondary">
              暂无缓存数据，点击"刷新倍率"按钮获取实例的模型倍率配置
            </Text>
          </Space>
        </Card>
      )}

      {/* Source Ratio Modal */}
      <Modal
        title={`${sourceModelId} 在「${sourceChannelName}」的倍率`}
        open={sourceModalVisible}
        onCancel={() => setSourceModalVisible(false)}
        width={900}
        footer={null}
        destroyOnClose
      >
        {sourceLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="正在获取渠道源倍率..." />
          </div>
        ) : sourceRatioConfig ? (
          <SourceRatioContent
            sourceRatioConfig={sourceRatioConfig}
            localRatioConfig={ratioConfig}
            focusModelId={sourceModelId}
            sourceSearch={sourceSearch}
            setSourceSearch={setSourceSearch}
            selectedSyncModels={selectedSyncModels}
            setSelectedSyncModels={setSelectedSyncModels}
            syncMarkupPercent={syncMarkupPercent}
            setSyncMarkupPercent={setSyncMarkupPercent}
            syncing={syncing}
            onSync={handleSyncSourceRatios}
          />
        ) : null}
      </Modal>
    </div>
  );
}
