import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Typography,
  Table,
  Button,
  Space,
  message,
  Tag,
  Alert,
  Spin,
  Select,
  Input,
  Modal,
  InputNumber,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Checkbox,
  Descriptions,
  Collapse,
  Tooltip,
  Tabs,
} from 'antd';
import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  FilterOutlined,
  MergeCellsOutlined,
  SortAscendingOutlined,
  DollarOutlined,
  TrophyOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../context/AppContext';
import {
  fetchChannels,
  getSplitHistory,
  batchDeleteChannels,
  batchUpdatePriority,
  getPriceRates,
  getCachedRatios,
  getChannelSourcePriceRates,
  getChannelSources,
  proxyForward,
} from '../api/client';
import type { Channel, SplitHistoryEntry, ChannelPriceRateConfig, RatioConfig, ChannelSourcePriceRateConfig, ChannelSource } from '@newapi-sync/shared';
import ModelSelectorModal from '../components/ModelSelectorModal';
import ModelNameMappingTab from './ModelNameMappingTab';
import { getChannelTypeLabel } from '../utils/channelTypes';

const { Title, Text } = Typography;
const { Search } = Input;

function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getFriendlyGroupName(name?: string, url?: string): string {
  const trimmed = (name || '').trim();
  const isUrlLike = /^https?:\/\//i.test(trimmed);
  if (trimmed && !isUrlLike) return trimmed;

  const source = (url || trimmed).trim();
  if (!source) return '未命名分组';

  try {
    return new URL(source).host;
  } catch {
    return source;
  }
}

interface ModelGroup {
  modelId: string;
  channels: ChannelWithMetadata[];
  totalChannels: number;
  splitChannelCount: number;
  averagePriority: number;
  lowestCostChannelId?: number;
}

interface ChannelWithMetadata extends Channel {
  isSplitChannel: boolean;
  parentChannelId?: number;
  parentChannelName?: string;
  parentChannelConfig?: Channel;
  priceRate?: number;
  effectiveUnitCost?: number;
  modelPrice?: number; // Price from ratio config (for per-request pricing)
  realCost?: number; // Actual cost in CNY (modelPrice * unitCost)
}

interface ChannelGroup {
  groupType: 'split' | 'normal';
  parentChannelId?: number;
  parentChannelName?: string;
  parentChannelUrl?: string;
  channels: ChannelWithMetadata[];
}

export default function ModelGroupManagement() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [splitHistory, setSplitHistory] = useState<SplitHistoryEntry[]>([]);
  const [priceRates, setPriceRates] = useState<Map<number, ChannelPriceRateConfig>>(new Map());
  const [cachedRatios, setCachedRatios] = useState<Map<number, RatioConfig>>(new Map()); // sourceId -> RatioConfig
  const [sourcePriceRates, setSourcePriceRates] = useState<Map<number, number>>(new Map()); // sourceId -> priceRate
  const [channelSources, setChannelSources] = useState<ChannelSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterProvider, setFilterProvider] = useState<string | null>(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const [batchPriorityModalVisible, setBatchPriorityModalVisible] = useState(false);
  const [batchPriority, setBatchPriority] = useState<number>(10);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [selectedChannelForModels, setSelectedChannelForModels] = useState<ChannelWithMetadata | null>(null);
  const [addChannelModalVisible, setAddChannelModalVisible] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);
  const [addChannelTargetGroup, setAddChannelTargetGroup] = useState<ChannelGroup | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelBaseUrl, setNewChannelBaseUrl] = useState('');
  const [newChannelKey, setNewChannelKey] = useState('');
  const [newChannelPriority, setNewChannelPriority] = useState<number>(10);
  const [newChannelType, setNewChannelType] = useState<number>(1);
  const [newChannelStatus, setNewChannelStatus] = useState<number>(1);
  const [inheritModelMapping, setInheritModelMapping] = useState(true);
  const [newlyAddedChannelName, setNewlyAddedChannelName] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'instance' | 'source'>('instance');
  const [selectedSourceId, setSelectedSourceId] = useState<number | undefined>(undefined);
  const [selectedInstanceChannelId, setSelectedInstanceChannelId] = useState<number | undefined>(undefined);

  if (!connection) {
    return (
      <Card>
        <Alert
          message="未配置连接"
          description="请先在设置页面配置 New API 连接信息"
          type="warning"
          showIcon
        />
      </Card>
    );
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [channelsResp, historyResp, ratesResp, cachedRatiosResp, sourcePriceRatesResp, sourcesResp] = await Promise.all([
        fetchChannels(connection),
        getSplitHistory(),
        getPriceRates(),
        getCachedRatios(),
        getChannelSourcePriceRates(),
        getChannelSources(),
      ]);

      if (channelsResp.success && channelsResp.data) {
        setChannels(channelsResp.data);
      }

      if (historyResp.success && historyResp.data) {
        setSplitHistory(historyResp.data);
      }

      if (ratesResp.success && ratesResp.data) {
        const map = new Map<number, ChannelPriceRateConfig>();
        for (const r of ratesResp.data) {
          map.set(r.channelId, r);
        }
        setPriceRates(map);
      }

      if (cachedRatiosResp.success && cachedRatiosResp.cached) {
        const map = new Map<number, RatioConfig>();
        for (const entry of cachedRatiosResp.cached) {
          map.set(entry.sourceId, entry.ratioConfig);
        }
        setCachedRatios(map);
      }

      if (sourcePriceRatesResp.success && sourcePriceRatesResp.data) {
        const map = new Map<number, number>();
        for (const entry of sourcePriceRatesResp.data) {
          map.set(entry.sourceId, entry.priceRate);
        }
        setSourcePriceRates(map);
      }

      if (sourcesResp.success) {
        setChannelSources(sourcesResp.sources);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`加载数据失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build split channel mapping from history with parent config
  const splitChannelMap = useMemo(() => {
    const map = new Map<number, {
      parentChannelId: number;
      parentChannelName: string;
      parentChannelConfig: Channel;
    }>();

    for (const entry of splitHistory) {
      if (entry.rollbackStatus) continue;

      for (const subChannelId of entry.subChannelIds) {
        map.set(subChannelId, {
          parentChannelId: entry.parentChannelId,
          parentChannelName: entry.parentChannelName,
          parentChannelConfig: entry.parentChannelConfig,
        });
      }
    }

    return map;
  }, [splitHistory]);

  // Enrich channels with metadata and cost information
  const enrichedChannels = useMemo<ChannelWithMetadata[]>(() => {
    return channels.map((ch) => {
      const splitInfo = splitChannelMap.get(ch.id);
      const priceRate = priceRates.get(ch.id);

      // Find matching channel source by base_url
      const matchingSource = channelSources.find(s => s.baseUrl === ch.base_url);

      let modelPrice: number | undefined;
      let realCost: number | undefined;

      if (matchingSource) {
        const sourceId = matchingSource.id!;
        const ratioConfig = cachedRatios.get(sourceId);
        const sourcePriceRate = sourcePriceRates.get(sourceId);

        // Get model price from ratio config (for per-request pricing)
        if (ratioConfig?.modelPrice && ch.models) {
          modelPrice = ratioConfig.modelPrice[ch.models];
        }

        // Calculate real cost in CNY if we have both price and rate
        if (modelPrice && sourcePriceRate && sourcePriceRate > 0) {
          const unitCost = 1 / sourcePriceRate; // Convert price rate to unit cost
          realCost = modelPrice * unitCost;
        }
      }

      return {
        ...ch,
        isSplitChannel: !!splitInfo,
        parentChannelId: splitInfo?.parentChannelId,
        parentChannelName: splitInfo?.parentChannelName,
        parentChannelConfig: splitInfo?.parentChannelConfig,
        priceRate: priceRate?.priceRate,
        modelPrice,
        realCost,
      };
    });
  }, [channels, splitChannelMap, priceRates, channelSources, cachedRatios, sourcePriceRates]);

  // Group channels by model (only split channels)
  const modelGroups = useMemo<ModelGroup[]>(() => {
    const groups = new Map<string, ChannelWithMetadata[]>();

    // Only process split channels
    const splitChannels = enrichedChannels.filter((ch) => ch.isSplitChannel);

    for (const ch of splitChannels) {
      const models = ch.models?.split(',').filter(Boolean) || [];
      for (const modelId of models) {
        const trimmedModelId = modelId.trim();
        if (!groups.has(trimmedModelId)) {
          groups.set(trimmedModelId, []);
        }
        groups.get(trimmedModelId)!.push(ch);
      }
    }

    const result: ModelGroup[] = [];
    for (const [modelId, channelList] of groups.entries()) {
      const splitChannelCount = channelList.filter((ch) => ch.isSplitChannel).length;
      const priorities = channelList.map((ch) => ch.priority || 0);
      const averagePriority =
        priorities.length > 0 ? priorities.reduce((a, b) => a + b, 0) / priorities.length : 0;

      // Find lowest cost channel (if price rates available)
      let lowestCostChannelId: number | undefined;
      let lowestCost = Infinity;
      for (const ch of channelList) {
        if (ch.priceRate && ch.priceRate > 0) {
          const cost = 1 / ch.priceRate; // Simple cost calculation
          if (cost < lowestCost) {
            lowestCost = cost;
            lowestCostChannelId = ch.id;
          }
        }
      }

      result.push({
        modelId,
        channels: channelList,
        totalChannels: channelList.length,
        splitChannelCount,
        averagePriority: Math.round(averagePriority),
        lowestCostChannelId,
      });
    }

    return result.sort((a, b) => b.totalChannels - a.totalChannels);
  }, [enrichedChannels]);

  // Filter model groups
  const filteredModelGroups = useMemo(() => {
    return modelGroups.filter((group) => {
      if (searchText && !group.modelId.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [modelGroups, searchText]);

  // Get selected model group
  const selectedGroup = useMemo(() => {
    if (!selectedModelId) return null;
    return modelGroups.find((g) => g.modelId === selectedModelId) || null;
  }, [modelGroups, selectedModelId]);

  // Filter channels in selected group (only split channels)
  const filteredChannels = useMemo(() => {
    if (!selectedGroup) return [];

    let filtered = selectedGroup.channels;

    if (filterProvider) {
      filtered = filtered.filter((ch) => getChannelTypeLabel(ch.type) === filterProvider);
    }

    return filtered;
  }, [selectedGroup, filterProvider]);

  // Group channels by parent channel (only split channels, no normal channels)
  const groupedChannels = useMemo<ChannelGroup[]>(() => {
    if (!selectedGroup) return [];

    const groups: ChannelGroup[] = [];
    const splitGroups = new Map<number, ChannelWithMetadata[]>();

    // Apply filters first - only process split channels
    const channelsToGroup = filteredChannels.filter((ch) => ch.isSplitChannel);

    // Group channels by parent channel ID
    for (const channel of channelsToGroup) {
      if (channel.parentChannelId) {
        if (!splitGroups.has(channel.parentChannelId)) {
          splitGroups.set(channel.parentChannelId, []);
        }
        splitGroups.get(channel.parentChannelId)!.push(channel);
      }
    }

    // Build split groups (sorted by parent channel ID)
    const sortedParentIds = Array.from(splitGroups.keys()).sort((a, b) => a - b);
    for (const parentId of sortedParentIds) {
      const channels = splitGroups.get(parentId)!;
      const firstChannel = channels[0];
      groups.push({
        groupType: 'split',
        parentChannelId: parentId,
        parentChannelName: firstChannel.parentChannelName,
        parentChannelUrl: firstChannel.parentChannelConfig?.base_url,
        channels,
      });
    }

    return groups;
  }, [selectedGroup, filteredChannels]);

  // Get unique providers in selected group
  const availableProviders = useMemo(() => {
    if (!selectedGroup) return [];
    const providers = new Set(selectedGroup.channels.map((ch) => getChannelTypeLabel(ch.type)));
    return Array.from(providers).sort();
  }, [selectedGroup]);

  const handleBatchDelete = async () => {
    if (selectedChannelIds.length === 0) {
      message.warning('请先选择要删除的渠道');
      return;
    }

    try {
      const resp = await batchDeleteChannels(connection, selectedChannelIds);
      if (resp.success && resp.data) {
        message.success(`成功删除 ${resp.data.totalSuccess} 个渠道`);
        if (resp.data.totalFailed > 0) {
          message.warning(`${resp.data.totalFailed} 个渠道删除失败`);
        }
        setSelectedChannelIds([]);
        loadData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`批量删除失败: ${msg}`);
    }
  };

  const handleBatchUpdatePriority = async () => {
    if (selectedChannelIds.length === 0) {
      message.warning('请先选择要更新的渠道');
      return;
    }

    try {
      const updates = selectedChannelIds.map((id) => ({ channelId: id, priority: batchPriority }));
      const resp = await batchUpdatePriority(connection, updates);
      if (resp.success && resp.data) {
        message.success(`成功更新 ${resp.data.totalSuccess} 个渠道的优先级`);
        if (resp.data.totalFailed > 0) {
          message.warning(`${resp.data.totalFailed} 个渠道更新失败`);
        }
        setSelectedChannelIds([]);
        setBatchPriorityModalVisible(false);
        loadData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`批量更新失败: ${msg}`);
    }
  };

  const handleOpenModelSelector = (channel: ChannelWithMetadata) => {
    setSelectedChannelForModels(channel);
    setModelSelectorVisible(true);
  };

  const handleOpenAddChannel = (group: ChannelGroup) => {
    setAddChannelTargetGroup(group);

    const parent = group.channels[0]?.parentChannelConfig;
    const defaultName = `${group.parentChannelName || '新渠道'} - ${selectedModelId}`;
    setAddMode('instance');
    setSelectedSourceId(undefined);
    setSelectedInstanceChannelId(undefined);
    setNewChannelName(defaultName);
    setNewChannelBaseUrl(parent?.base_url || '');
    setNewChannelKey(parent?.key || '');
    setNewChannelPriority(group.channels[0]?.priority ?? 10);
    setNewChannelType(parent?.type ?? group.channels[0]?.type ?? 1);
    setNewChannelStatus(parent?.status ?? 1);
    setInheritModelMapping(true);
    setAddChannelModalVisible(true);
  };

  const handleAddChannel = async () => {
    if (!selectedModelId) {
      message.warning('未选择模型');
      return;
    }

    if (!newChannelName.trim()) {
      message.warning('请填写渠道名称');
      return;
    }

    if (addMode === 'instance' && selectedInstanceChannelId) {
      const selectedChannel = channels.find((c) => c.id === selectedInstanceChannelId);
      if (!selectedChannel) {
        message.warning('实例渠道不存在');
        return;
      }

      setNewChannelBaseUrl(selectedChannel.base_url || '');
      setNewChannelKey(selectedChannel.key || '');
      setNewChannelType(selectedChannel.type || 1);
      setNewChannelStatus(selectedChannel.status || 1);
      setNewChannelPriority(selectedChannel.priority || 10);
    }

    if (addMode === 'source') {
      if (!selectedSourceId) {
        message.warning('请选择渠道商');
        return;
      }

      const selectedSource = channelSources.find((s) => s.id === selectedSourceId);
      if (!selectedSource) {
        message.warning('渠道商不存在');
        return;
      }

      setNewChannelBaseUrl(selectedSource.baseUrl);
      setNewChannelKey(selectedSource.channelKey || selectedSource.apiKey || '');
    }

    if (!newChannelBaseUrl.trim() || !newChannelKey.trim()) {
      message.warning('请填写 Base URL、Key');
      return;
    }

    if (!isValidHttpUrl(newChannelBaseUrl)) {
      message.warning('Base URL 格式无效，请输入 http(s):// 开头的完整地址');
      return;
    }

    const parent = addChannelTargetGroup?.channels[0]?.parentChannelConfig;

    setAddingChannel(true);
    try {
      const selectedSource = addMode === 'source'
        ? channelSources.find((s) => s.id === selectedSourceId)
        : undefined;
      const selectedChannel = addMode === 'instance' && selectedInstanceChannelId
        ? channels.find((c) => c.id === selectedInstanceChannelId)
        : undefined;

      const finalBaseUrl = addMode === 'source'
        ? (selectedSource?.baseUrl || newChannelBaseUrl.trim())
        : (selectedChannel?.base_url || newChannelBaseUrl.trim());
      const finalKey = addMode === 'source'
        ? (selectedSource?.channelKey || selectedSource?.apiKey || newChannelKey.trim())
        : (selectedChannel?.key || newChannelKey.trim());

      const payload = {
        mode: 'single',
        channel: {
          name: newChannelName.trim(),
          type: newChannelType,
          key: finalKey,
          base_url: finalBaseUrl,
          models: selectedModelId,
          model_mapping: inheritModelMapping ? (parent?.model_mapping || '') : '',
          status: newChannelStatus,
          priority: newChannelPriority,
        },
      };

      const resp = await proxyForward(connection, 'POST', '/api/channel/', payload);
      if (!resp.success) {
        throw new Error(resp.error || '创建渠道失败');
      }

      message.success('渠道已添加到当前模型分组');
      setNewlyAddedChannelName(newChannelName.trim());
      setTimeout(() => setNewlyAddedChannelName(null), 3000);
      setAddChannelModalVisible(false);
      setAddChannelTargetGroup(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`添加渠道失败: ${msg}`);
    } finally {
      setAddingChannel(false);
    }
  };

  const handleCloseModelSelector = () => {
    setModelSelectorVisible(false);
    setSelectedChannelForModels(null);
  };

  const handleModelAddSuccess = () => {
    loadData();
  };

  const handleDeleteGroup = async (group: ChannelGroup) => {
    const channelIds = group.channels.map((ch) => ch.id);

    try {
      const resp = await batchDeleteChannels(connection, channelIds);
      if (resp.success && resp.data) {
        message.success(
          `成功删除分组 "${group.parentChannelName}" 的 ${resp.data.totalSuccess} 个子渠道`
        );
        if (resp.data.totalFailed > 0) {
          message.warning(`${resp.data.totalFailed} 个渠道删除失败`);
        }
        loadData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`删除分组失败: ${msg}`);
    }
  };

  // Auto-sort channels by real cost (lowest cost = highest priority)
  const handleAutoSortByRealCost = async (group: ChannelGroup) => {
    // Filter channels that have real cost data
    const channelsWithCost = group.channels.filter(ch => ch.realCost !== undefined);

    if (channelsWithCost.length === 0) {
      message.warning('该分组没有可用的价格数据，无法自动排序。请先在"实例站倍率同步"页面获取价格数据。');
      return;
    }

    if (channelsWithCost.length < group.channels.length) {
      const missingCount = group.channels.length - channelsWithCost.length;
      message.warning(`有 ${missingCount} 个渠道缺少价格数据，将只对有价格数据的渠道进行排序`);
    }

    // Sort by real cost (ascending - lowest cost first)
    const sorted = [...channelsWithCost].sort((a, b) => a.realCost! - b.realCost!);

    // Assign priorities: start from 100, decrease by 10 for each channel
    const updates = sorted.map((ch, index) => ({
      channelId: ch.id,
      priority: 100 - (index * 10),
    }));

    try {
      const resp = await batchUpdatePriority(connection, updates);
      if (resp.success && resp.data) {
        message.success(
          `成功更新 ${resp.data.totalSuccess} 个渠道的优先级（按实际成本从低到高排序）`
        );
        if (resp.data.totalFailed > 0) {
          message.warning(`${resp.data.totalFailed} 个渠道更新失败`);
        }
        loadData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`自动排序失败: ${msg}`);
    }
  };

  const modelGroupColumns: ColumnsType<ModelGroup> = [
    {
      title: '模型 ID',
      dataIndex: 'modelId',
      key: 'modelId',
      render: (modelId: string) => (
        <Button type="link" onClick={() => setSelectedModelId(modelId)}>
          {modelId}
        </Button>
      ),
    },
    {
      title: '渠道总数',
      dataIndex: 'totalChannels',
      key: 'totalChannels',
      width: 120,
      sorter: (a, b) => a.totalChannels - b.totalChannels,
    },
    {
      title: '拆分渠道数',
      dataIndex: 'splitChannelCount',
      key: 'splitChannelCount',
      width: 120,
      render: (count: number) => (count > 0 ? <Tag color="blue">{count}</Tag> : <Text>0</Text>),
    },
    {
      title: '平均优先级',
      dataIndex: 'averagePriority',
      key: 'averagePriority',
      width: 120,
    },
    {
      title: '最低成本渠道',
      key: 'lowestCost',
      width: 150,
      render: (_, record) => {
        if (!record.lowestCostChannelId) return <Text type="secondary">-</Text>;
        const channel = record.channels.find((ch) => ch.id === record.lowestCostChannelId);
        return channel ? (
          <Space>
            <TrophyOutlined style={{ color: '#f59e0b' }} />
            <Text>{channel.name}</Text>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
  ];

  const channelColumns: ColumnsType<ChannelWithMetadata> = [
    {
      title: (
        <Checkbox
          checked={
            selectedChannelIds.length > 0 &&
            selectedChannelIds.length === filteredChannels.length
          }
          indeterminate={
            selectedChannelIds.length > 0 &&
            selectedChannelIds.length < filteredChannels.length
          }
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedChannelIds(filteredChannels.map((ch) => ch.id));
            } else {
              setSelectedChannelIds([]);
            }
          }}
        />
      ),
      key: 'select',
      width: 50,
      render: (_, record) => (
        <Checkbox
          checked={selectedChannelIds.includes(record.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedChannelIds([...selectedChannelIds, record.id]);
            } else {
              setSelectedChannelIds(selectedChannelIds.filter((id) => id !== record.id));
            }
          }}
        />
      ),
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '渠道名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size="small">
          <Space size={6}>
            <Text>{name}</Text>
            {newlyAddedChannelName === name && (
              <Tag color="green">新加</Tag>
            )}
          </Space>
          {record.isSplitChannel && (
            <Tag color="blue" icon={<MergeCellsOutlined />}>
              拆分自: {record.parentChannelName}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: number) => <Tag>{getChannelTypeLabel(type)}</Tag>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      sorter: (a, b) => (a.priority || 0) - (b.priority || 0),
    },
    {
      title: '价格费率',
      key: 'priceRate',
      width: 120,
      render: (_, record) =>
        record.priceRate ? (
          <Text>{record.priceRate.toFixed(6)}</Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: (
        <Tooltip title="实际成本（含汇率）= 模型价格 × 汇率，用于自动排序">
          实际成本 <DollarOutlined />
        </Tooltip>
      ),
      key: 'realCost',
      width: 150,
      render: (_, record) => {
        if (record.realCost !== undefined) {
          return (
            <Space direction="vertical" size={0}>
              <Text strong style={{ color: '#22c55e' }}>
                ¥{record.realCost.toFixed(4)}/次
              </Text>
              {record.modelPrice && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  (${record.modelPrice.toFixed(4)}/次)
                </Text>
              )}
            </Space>
          );
        }
        return <Text type="secondary">-</Text>;
      },
      sorter: (a, b) => {
        const aCost = a.realCost ?? Infinity;
        const bCost = b.realCost ?? Infinity;
        return aCost - bCost;
      },
    },
    {
      title: '模型数',
      key: 'modelCount',
      width: 100,
      render: (_, record) => {
        const modelCount = record.models ? record.models.split(',').filter(Boolean).length : 0;
        return <Text>{modelCount}</Text>;
      },
      sorter: (a, b) => {
        const aCount = a.models ? a.models.split(',').filter(Boolean).length : 0;
        const bCount = b.models ? b.models.split(',').filter(Boolean).length : 0;
        return aCount - bCount;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number) => (
        <Tag color={status === 1 ? 'success' : 'default'}>
          {status === 1 ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => handleOpenModelSelector(record)}
        >
          添加模型
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <Title level={2}>
        <AppstoreOutlined /> 模型分组管理
      </Title>
      <Text type="secondary">按模型自动分组管理渠道，支持批量操作和模型名称映射</Text>

      <Tabs
        defaultActiveKey="groups"
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'groups',
            label: <><AppstoreOutlined /> 模型分组管理</>,
            children: (
              <Spin spinning={loading}>
                {modelGroups.length === 0 ? (
          // Empty state when no split channels exist
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Alert
              message="暂无拆分渠道"
              description="请先在「渠道自动拆分」页面拆分渠道，拆分后的渠道将在此处按模型分组显示。"
              type="info"
              showIcon
              style={{ maxWidth: 600, margin: '0 auto' }}
            />
          </div>
        ) : !selectedModelId ? (
          // Model Group List View
          <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 24 }}>
            <Row gutter={16}>
              <Col span={6}>
                <Card>
                  <Statistic title="模型总数" value={modelGroups.length} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="拆分渠道总数"
                    value={enrichedChannels.filter((ch) => ch.isSplitChannel).length}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="拆分分组数"
                    value={splitHistory.filter((h) => !h.rollbackStatus).length}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="已回滚分组"
                    value={splitHistory.filter((h) => h.rollbackStatus).length}
                  />
                </Card>
              </Col>
            </Row>

            <Space>
              <Search
                placeholder="搜索模型 ID"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 300 }}
              />
              <Button icon={<ReloadOutlined />} onClick={loadData}>
                刷新
              </Button>
            </Space>

            <Table
              columns={modelGroupColumns}
              dataSource={filteredModelGroups}
              rowKey="modelId"
              pagination={{ pageSize: 20 }}
            />
          </Space>
        ) : (
          // Model Group Detail View
          <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 24 }}>
            <Space>
              <Button onClick={() => setSelectedModelId(null)}>返回列表</Button>
              <Button icon={<ReloadOutlined />} onClick={loadData}>
                刷新
              </Button>
            </Space>

            <Descriptions bordered column={2}>
              <Descriptions.Item label="模型 ID">{selectedModelId}</Descriptions.Item>
              <Descriptions.Item label="渠道总数">
                {selectedGroup?.totalChannels}
              </Descriptions.Item>
              <Descriptions.Item label="拆分渠道数">
                {selectedGroup?.splitChannelCount}
              </Descriptions.Item>
              <Descriptions.Item label="平均优先级">
                {selectedGroup?.averagePriority}
              </Descriptions.Item>
            </Descriptions>

            <Space wrap>
              <Select
                placeholder="筛选提供商"
                value={filterProvider}
                onChange={setFilterProvider}
                allowClear
                style={{ width: 150 }}
                options={availableProviders.map((p) => ({ label: p, value: p }))}
              />
              <Popconfirm
                title="确认删除"
                description={`确定要删除选中的 ${selectedChannelIds.length} 个渠道吗？`}
                onConfirm={handleBatchDelete}
                disabled={selectedChannelIds.length === 0}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={selectedChannelIds.length === 0}
                >
                  批量删除 ({selectedChannelIds.length})
                </Button>
              </Popconfirm>
              <Button
                icon={<EditOutlined />}
                disabled={selectedChannelIds.length === 0}
                onClick={() => setBatchPriorityModalVisible(true)}
              >
                批量调整优先级 ({selectedChannelIds.length})
              </Button>
            </Space>

            <Collapse defaultActiveKey={groupedChannels.map((g, i) => i.toString())}>
              {groupedChannels.map((group, index) => (
                <Collapse.Panel
                  key={index.toString()}
                  header={
                    <Space>
                      <Tag color="blue">拆分分组</Tag>
                      <Text strong>{getFriendlyGroupName(group.parentChannelName, group.parentChannelUrl)}</Text>
                      {group.parentChannelUrl && (
                        <Text type="secondary">({group.parentChannelUrl})</Text>
                      )}
                      <Text type="secondary">- {group.channels.length} 个子渠道</Text>
                    </Space>
                  }
                  extra={
                    <Space size="small">
                      <Tooltip title="根据实际成本（含汇率）自动排序优先级，成本越低优先级越高">
                        <Button
                          type="primary"
                          size="small"
                          icon={<SortAscendingOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAutoSortByRealCost(group);
                          }}
                        >
                          自动排序
                        </Button>
                      </Tooltip>
                      <Button
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddChannel(group);
                        }}
                      >
                        添加渠道
                      </Button>
                      <Popconfirm
                        title="确认删除分组"
                        description={`确定要删除此分组的 ${group.channels.length} 个子渠道吗？`}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDeleteGroup(group);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                      >
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        >
                          删除分组
                        </Button>
                      </Popconfirm>
                    </Space>
                  }
                >
                  <Table
                    columns={channelColumns}
                    dataSource={group.channels}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    expandable={{
                      expandedRowRender: (record) => {
                        const models = record.models
                          ? record.models.split(',').map((m) => m.trim()).filter(Boolean)
                          : [];
                        return (
                          <div style={{ padding: '8px 0' }}>
                            <Text strong>模型列表：</Text>
                            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {models.length > 0 ? (
                                models.map((model) => (
                                  <Tag key={model} color="blue">
                                    {model}
                                  </Tag>
                                ))
                              ) : (
                                <Text type="secondary">无模型</Text>
                              )}
                            </div>
                          </div>
                        );
                      },
                      rowExpandable: (record) => {
                        const modelCount = record.models
                          ? record.models.split(',').filter(Boolean).length
                          : 0;
                        return modelCount > 0;
                      },
                    }}
                  />
                </Collapse.Panel>
              ))}
            </Collapse>
          </Space>
        )}
      </Spin>
            ),
          },
          {
            key: 'mapping',
            label: <><SwapOutlined /> 模型名称映射</>,
            children: <ModelNameMappingTab />,
          },
        ]}
      />

      <Modal
        title="批量调整优先级"
        open={batchPriorityModalVisible}
        onOk={handleBatchUpdatePriority}
        onCancel={() => setBatchPriorityModalVisible(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>将为选中的 {selectedChannelIds.length} 个渠道设置统一的优先级值：</Text>
          <InputNumber
            value={batchPriority}
            onChange={(value) => setBatchPriority(value || 10)}
            min={0}
            style={{ width: '100%' }}
          />
        </Space>
      </Modal>

      <Modal
        title="添加渠道到当前模型分组"
        open={addChannelModalVisible}
        onOk={handleAddChannel}
        onCancel={() => setAddChannelModalVisible(false)}
        confirmLoading={addingChannel}
        okText="确认添加"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message="将创建一个新渠道"
            description={`模型: ${selectedModelId || '-'}；分组: ${getFriendlyGroupName(addChannelTargetGroup?.parentChannelName, addChannelTargetGroup?.parentChannelUrl)}`}
          />
          <Select
            value={addMode}
            onChange={(mode) => {
              setAddMode(mode);
              if (mode === 'source') {
                const firstSource = channelSources.find((s) => s.enabled && s.id !== undefined);
                if (firstSource?.id) {
                  setSelectedSourceId(firstSource.id);
                  setSelectedInstanceChannelId(undefined);
                  setNewChannelBaseUrl(firstSource.baseUrl);
                  setNewChannelKey(firstSource.channelKey || firstSource.apiKey || '');
                }
              } else {
                const parent = addChannelTargetGroup?.channels[0]?.parentChannelConfig;
                setNewChannelBaseUrl(parent?.base_url || '');
                setNewChannelKey(parent?.key || '');
                setSelectedSourceId(undefined);
                setSelectedInstanceChannelId(undefined);
              }
            }}
            options={[
              { label: '从实例渠道复制', value: 'instance' },
              { label: '从渠道商导入', value: 'source' },
            ]}
          />
          {addMode === 'instance' && (
            <Select
              placeholder="选择实例中的已有渠道（可选）"
              value={selectedInstanceChannelId}
              onChange={(id) => {
                setSelectedInstanceChannelId(id);

                if (id === undefined) {
                  const parent = addChannelTargetGroup?.channels[0]?.parentChannelConfig;
                  setNewChannelBaseUrl(parent?.base_url || '');
                  setNewChannelKey(parent?.key || '');
                  setNewChannelType(parent?.type ?? 1);
                  setNewChannelStatus(parent?.status ?? 1);
                  setNewChannelPriority(addChannelTargetGroup?.channels[0]?.priority ?? 10);
                  return;
                }

                const channel = channels.find((c) => c.id === id);
                if (channel) {
                  setNewChannelBaseUrl(channel.base_url || '');
                  setNewChannelKey(channel.key || '');
                  setNewChannelType(channel.type || 1);
                  setNewChannelStatus(channel.status || 1);
                  setNewChannelPriority(channel.priority || 10);
                }
              }}
              options={channels
                .filter((c) => (c.base_url || '').trim().length > 0)
                .map((c) => ({ label: `${c.name} (${c.base_url || '无 Base URL'})`, value: c.id }))}
              allowClear
            />
          )}
          {addMode === 'source' && (
            <Select
              placeholder="选择渠道商"
              value={selectedSourceId}
              onChange={(id) => {
                setSelectedSourceId(id);
                const source = channelSources.find((s) => s.id === id);
                if (source) {
                  setNewChannelBaseUrl(source.baseUrl);
                  setNewChannelKey(source.channelKey || source.apiKey || '');
                }
              }}
              options={channelSources
                .filter((s) => s.enabled && s.id !== undefined)
                .map((s) => ({ label: `${s.name} (${s.baseUrl})`, value: s.id as number }))}
            />
          )}
          <Input
            placeholder="渠道名称"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
          />
          <Input
            placeholder="Base URL (例如 https://example.com)"
            value={newChannelBaseUrl}
            status={newChannelBaseUrl && !isValidHttpUrl(newChannelBaseUrl) ? 'error' : ''}
            disabled={addMode === 'source'}
            onChange={(e) => setNewChannelBaseUrl(e.target.value)}
          />
          <Input
            placeholder="渠道 Key"
            value={newChannelKey}
            disabled={addMode === 'source'}
            onChange={(e) => setNewChannelKey(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <InputNumber
              placeholder="类型"
              value={newChannelType}
              onChange={(value) => setNewChannelType(value || 1)}
              min={1}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Select
              value={newChannelStatus}
              onChange={setNewChannelStatus}
              style={{ flex: 1, minWidth: 0 }}
              options={[
                { label: '启用', value: 1 },
                { label: '禁用', value: 2 },
              ]}
            />
            <InputNumber
              placeholder="优先级"
              value={newChannelPriority}
              onChange={(value) => setNewChannelPriority(value || 10)}
              min={0}
              style={{ flex: 1, minWidth: 0 }}
            />
          </div>
          <Checkbox
            checked={inheritModelMapping}
            onChange={(e) => setInheritModelMapping(e.target.checked)}
          >
            继承父渠道 model_mapping
          </Checkbox>
        </Space>
      </Modal>

      {selectedChannelForModels && (
        <ModelSelectorModal
          visible={modelSelectorVisible}
          channelId={selectedChannelForModels.id}
          channelName={selectedChannelForModels.name}
          currentModels={selectedChannelForModels.models ? selectedChannelForModels.models.split(',').map(m => m.trim()) : []}
          connection={connection}
          onClose={handleCloseModelSelector}
          onSuccess={handleModelAddSuccess}
        />
      )}
    </Card>
  );
}
