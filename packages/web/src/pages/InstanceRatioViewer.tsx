import { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
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
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { RatioConfig, Channel } from '@newapi-sync/shared';
import { useAppContext } from '../context/AppContext';
import { proxyForward, fetchChannels } from '../api/client';

const { Title, Text } = Typography;

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
        console.log('Loaded cached ratio config from:', fetchedAt);
      }
    } catch (err) {
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
      console.log('Fetch pricing response:', resp);
      console.log('Response data type:', typeof resp.data);
      console.log('Response data keys:', resp.data ? Object.keys(resp.data) : 'null');

      if (resp.success && resp.data) {
        // Handle both direct array and nested data structure
        let dataArray: Array<{ model_name: string }> = [];
        
        if (Array.isArray(resp.data)) {
          // Direct array response
          dataArray = resp.data;
          console.log('Direct array response, length:', dataArray.length);
        } else if (resp.data.data && Array.isArray(resp.data.data)) {
          // Nested data.data response
          dataArray = resp.data.data;
          console.log('Nested data.data response, length:', dataArray.length);
        } else {
          // Try to extract from object with numeric keys
          const dataObj = resp.data as any;
          console.log('Object response, keys:', Object.keys(dataObj));
          
          // Flatten all arrays from numeric keys
          Object.keys(dataObj).forEach(key => {
            if (Array.isArray(dataObj[key])) {
              console.log(`Key ${key} has ${dataObj[key].length} items`);
              dataArray = dataArray.concat(dataObj[key]);
            }
          });
          console.log('Flattened array length:', dataArray.length);
        }
        
        const modelList: string[] = [];
        dataArray.forEach((item) => {
          if (item && item.model_name) {
            modelList.push(item.model_name);
          }
        });
        
        console.log('Total models extracted:', modelList.length);
        console.log('Sample models:', modelList.slice(0, 10));
        
        const models = new Set(modelList);
        setAvailableModels(models);
        console.log('Unique models count:', models.size);
        return models;
      } else {
        console.warn('Failed to fetch models:', resp.error);
      }
    } catch (err) {
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
      // Fetch ratio config, available models, and channels
      const [ratioResp, models, channelResp] = await Promise.all([
        proxyForward<{
          data: {
            model_ratio: Record<string, number>;
            completion_ratio: Record<string, number>;
            model_price?: Record<string, number>;
          };
        }>(connection, 'GET', '/api/ratio_config'),
        fetchAvailableModels(),
        fetchChannels(connection),
      ]);

      console.log('Fetch ratios response:', ratioResp);
      console.log('Fetch channels response:', channelResp);

      // Store channels data
      if (channelResp.success && channelResp.data) {
        const channelList: Channel[] = Array.isArray(channelResp.data)
          ? channelResp.data
          : (channelResp.data as any)?.data || [];
        setChannels(channelList);
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
            console.log('Saved ratio config to cache');
          } catch (err) {
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
    } catch (err) {
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

    // Build model to channels mapping
    const modelToChannels = new Map<string, string[]>();
    channels.forEach(channel => {
      if (!channel.models) return;
      const modelList = channel.models.split(',').map(m => m.trim()).filter(Boolean);
      modelList.forEach(modelId => {
        if (!modelToChannels.has(modelId)) {
          modelToChannels.set(modelId, []);
        }
        modelToChannels.get(modelId)!.push(channel.name);
      });
    });

    // Combine all unique model IDs from modelRatio, modelPrice, and availableModels
    const allModelIds = new Set([
      ...(ratioConfig.modelRatio ? Object.keys(ratioConfig.modelRatio) : []),
      ...(ratioConfig.modelPrice ? Object.keys(ratioConfig.modelPrice) : []),
      ...(availableModels.size > 0 ? Array.from(availableModels) : []),
    ]);

    console.log('Building rows for', allModelIds.size, 'unique models');
    console.log('Available models:', availableModels.size);
    console.log('Model ratio keys:', ratioConfig.modelRatio ? Object.keys(ratioConfig.modelRatio).length : 0);
    console.log('Model price keys:', ratioConfig.modelPrice ? Object.keys(ratioConfig.modelPrice).length : 0);

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

      // Get channel names for this model
      const channelNames = modelToChannels.get(modelId)?.join(', ') || '';

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
      });
      processedModels.add(modelId);
    });

    console.log('Built', rows.length, 'rows');
    console.log('Available count:', rows.filter(r => r.isAvailable === true).length);
    console.log('Per-request count:', rows.filter(r => r.pricingType === 'per_request').length);

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
    // "仅显示未配置倍率" = 真实拥有 + (按Token且倍率为默认值 或 按次但没有价格)
    const matchesUnset = showUnsetOnly
      ? r.isAvailable === true && (
          (r.pricingType === 'per_token' && r.modelRatio === 1 && r.completionRatio === 1) ||
          (r.pricingType === 'per_request' && r.pricePerRequest === undefined)
        )
      : true;
    const matchesAvailable = showAvailableOnly
      ? r.isAvailable === true
      : true;
    return matchesSearch && matchesProvider && matchesUnset && matchesAvailable;
  });

  // Count unset models (available + not configured)
  const unsetCount = ratioRows.filter(r => 
    r.isAvailable === true && (
      (r.pricingType === 'per_token' && r.modelRatio === 1 && r.completionRatio === 1) ||
      (r.pricingType === 'per_request' && r.pricePerRequest === undefined)
    )
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
          <p style={{ color: '#ff4d4f' }}>此操作不可撤销，请谨慎操作。</p>
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
              } catch (err) {
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
              } catch (err) {
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
              } catch (err) {
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
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          message.error(`删除失败: ${msg}`);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

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
                <CopyOutlined style={{ marginLeft: 8, color: '#1890ff', fontSize: 12 }} />
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
      render: (channelNames: string) => {
        if (!channelNames) {
          return <Text type="secondary">-</Text>;
        }
        return (
          <Tooltip title={channelNames}>
            <Text style={{ fontSize: 12 }}>{channelNames}</Text>
          </Tooltip>
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
          return <span style={{ color: '#999' }}>不适用</span>;
        }
        const isUnset = record.isAvailable === true && ratio === 1 && record.completionRatio === 1;
        return (
          <span style={{ color: isUnset ? '#ff4d4f' : undefined }}>
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
          return <span style={{ color: '#999' }}>不适用</span>;
        }
        const isUnset = record.isAvailable === true && record.modelRatio === 1 && ratio === 1;
        return (
          <span style={{ color: isUnset ? '#ff4d4f' : undefined }}>
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
          return <span style={{ color: '#999' }}>不适用</span>;
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
          return <span style={{ color: '#999' }}>不适用</span>;
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
          return <span style={{ color: '#999' }}>不适用</span>;
        }
        const isUnset = record.isAvailable === true && price === undefined;
        if (price !== undefined) {
          return `${price.toFixed(6)}/次`;
        }
        return (
          <span style={{ color: isUnset ? '#ff4d4f' : undefined }}>
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
    </div>
  );
}
