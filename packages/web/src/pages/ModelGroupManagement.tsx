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
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../context/AppContext';
import {
  fetchChannels,
  getSplitHistory,
  batchDeleteChannels,
  batchUpdatePriority,
  getPriceRates,
} from '../api/client';
import type { Channel, SplitHistoryEntry, ChannelPriceRateConfig } from '@newapi-sync/shared';

const { Title, Text } = Typography;
const { Search } = Input;

// Channel type label mapping
const CHANNEL_TYPE_LABELS: Record<number, string> = {
  1: 'OpenAI', 2: 'API2D', 3: 'Azure', 4: 'CloseAI', 5: 'OpenAI-SB',
  6: 'OpenAI Max', 7: 'OhMyGPT', 8: 'Custom', 9: 'AI.LS', 10: 'AI.LS',
  11: 'PaLM', 12: 'API2GPT', 13: 'AIGC2D', 14: 'Anthropic', 15: 'Baidu',
  16: 'Zhipu', 17: 'Ali', 18: 'Xunfei', 19: '360', 20: 'Tencent',
  21: 'Google Gemini', 23: 'DeepSeek', 24: 'Moonshot', 25: 'Mistral',
  26: 'Groq', 27: 'Ollama', 28: 'LingYiWanWu', 31: 'Silicon Flow',
  33: 'AWS Claude', 34: 'Coze', 35: 'Cohere', 36: 'DeepL',
  37: 'Together AI', 40: 'Doubao',
};

function getChannelTypeLabel(type: number): string {
  return CHANNEL_TYPE_LABELS[type] ?? `类型 ${type}`;
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
  priceRate?: number;
  effectiveUnitCost?: number;
}

export default function ModelGroupManagement() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [splitHistory, setSplitHistory] = useState<SplitHistoryEntry[]>([]);
  const [priceRates, setPriceRates] = useState<Map<number, ChannelPriceRateConfig>>(new Map());
  const [loading, setLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'split' | 'normal'>('all');
  const [filterProvider, setFilterProvider] = useState<string | null>(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const [batchPriorityModalVisible, setBatchPriorityModalVisible] = useState(false);
  const [batchPriority, setBatchPriority] = useState<number>(10);

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
      const [channelsResp, historyResp, ratesResp] = await Promise.all([
        fetchChannels(connection),
        getSplitHistory(),
        getPriceRates(),
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

  // Build split channel mapping from history
  const splitChannelMap = useMemo(() => {
    const map = new Map<number, { parentChannelId: number; parentChannelName: string }>();
    for (const entry of splitHistory) {
      if (entry.rollbackStatus) continue; // Skip rolled back splits
      for (const subChannelId of entry.subChannelIds) {
        map.set(subChannelId, {
          parentChannelId: entry.parentChannelId,
          parentChannelName: entry.parentChannelName,
        });
      }
    }
    return map;
  }, [splitHistory]);

  // Enrich channels with metadata
  const enrichedChannels = useMemo<ChannelWithMetadata[]>(() => {
    return channels.map((ch) => {
      const splitInfo = splitChannelMap.get(ch.id);
      const priceRate = priceRates.get(ch.id);
      return {
        ...ch,
        isSplitChannel: !!splitInfo,
        parentChannelId: splitInfo?.parentChannelId,
        parentChannelName: splitInfo?.parentChannelName,
        priceRate: priceRate?.priceRate,
      };
    });
  }, [channels, splitChannelMap, priceRates]);

  // Group channels by model
  const modelGroups = useMemo<ModelGroup[]>(() => {
    const groups = new Map<string, ChannelWithMetadata[]>();

    for (const ch of enrichedChannels) {
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

  // Filter channels in selected group
  const filteredChannels = useMemo(() => {
    if (!selectedGroup) return [];

    let filtered = selectedGroup.channels;

    if (filterType === 'split') {
      filtered = filtered.filter((ch) => ch.isSplitChannel);
    } else if (filterType === 'normal') {
      filtered = filtered.filter((ch) => !ch.isSplitChannel);
    }

    if (filterProvider) {
      filtered = filtered.filter((ch) => getChannelTypeLabel(ch.type) === filterProvider);
    }

    return filtered;
  }, [selectedGroup, filterType, filterProvider]);

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
            <TrophyOutlined style={{ color: '#faad14' }} />
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
          <Text>{name}</Text>
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
  ];

  return (
    <Card>
      <Title level={2}>
        <AppstoreOutlined /> 模型分组管理
      </Title>
      <Text type="secondary">按模型自动分组管理渠道，支持批量操作</Text>

      <Spin spinning={loading}>
        {!selectedModelId ? (
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
                  <Statistic title="渠道总数" value={channels.length} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="拆分渠道数"
                    value={enrichedChannels.filter((ch) => ch.isSplitChannel).length}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="普通渠道数"
                    value={enrichedChannels.filter((ch) => !ch.isSplitChannel).length}
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
                placeholder="筛选类型"
                value={filterType}
                onChange={setFilterType}
                style={{ width: 150 }}
                options={[
                  { label: '全部渠道', value: 'all' },
                  { label: '仅拆分渠道', value: 'split' },
                  { label: '仅普通渠道', value: 'normal' },
                ]}
              />
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

            <Table
              columns={channelColumns}
              dataSource={filteredChannels}
              rowKey="id"
              pagination={{ pageSize: 20 }}
            />
          </Space>
        )}
      </Spin>

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
    </Card>
  );
}
