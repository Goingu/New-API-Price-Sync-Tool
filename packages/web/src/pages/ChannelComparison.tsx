import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  ReloadOutlined,
  ApiOutlined,
  SearchOutlined,
  ControlOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type {
  Channel,
  ChannelPriceComparison,
  ChannelModelPrice,
} from '@newapi-sync/shared';
import { useAppContext } from '../context/AppContext';
import { fetchChannels, compareChannels } from '../api/client';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Channel type label mapping (common New API channel types)
// ---------------------------------------------------------------------------

const CHANNEL_TYPE_LABELS: Record<number, string> = {
  1: 'OpenAI',
  2: 'API2D',
  3: 'Azure',
  4: 'CloseAI',
  5: 'OpenAI-SB',
  6: 'OpenAI Max',
  7: 'OhMyGPT',
  8: 'Custom',
  9: 'AI.LS',
  10: 'AI.LS',
  11: 'PaLM',
  12: 'API2GPT',
  13: 'AIGC2D',
  14: 'Anthropic',
  15: 'Baidu',
  16: 'Zhipu',
  17: 'Ali',
  18: 'Xunfei',
  19: '360',
  20: 'Tencent',
  21: 'Google Gemini',
  23: 'DeepSeek',
  24: 'Moonshot',
  25: 'Mistral',
  26: 'Groq',
  27: 'Ollama',
  28: 'LingYiWanWu',
  31: 'Silicon Flow',
  33: 'AWS Claude',
  34: 'Coze',
  35: 'Cohere',
  36: 'DeepL',
  37: 'Together AI',
  40: 'Doubao',
};

function getChannelTypeLabel(type: number): string {
  return CHANNEL_TYPE_LABELS[type] ?? `类型 ${type}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count models in a channel's comma-separated models string */
function countModels(models: string): number {
  if (!models || models.trim() === '') return 0;
  return models.split(',').filter((m) => m.trim().length > 0).length;
}

/** Collect all unique standard model IDs from comparisons */
function getAllModelIds(comparisons: ChannelPriceComparison[]): string[] {
  return comparisons.map((c) => c.modelId).sort();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChannelComparison() {
  const { state, dispatch } = useAppContext();
  const { settings } = state.connection;
  const upstreamPrices = state.upstreamPrices.results;
  const { list: channels, comparisons, loading, error, selectedChannelId, selectedModelId } = state.channels;

  const [localError, setLocalError] = useState<string>();
  const [modelSearch, setModelSearch] = useState('');
  const [mergeBySource, setMergeBySource] = useState(false);

  // ---------------------------------------------------------------------------
  // Load channels and compute comparisons
  // ---------------------------------------------------------------------------

  const loadChannels = useCallback(async () => {
    if (!settings) return;
    setLocalError(undefined);
    dispatch({
      type: 'SET_CHANNELS',
      payload: { list: [], comparisons: [], loading: true },
    });

    try {
      const resp = await fetchChannels(settings);
      if (!resp.success) {
        const errMsg = resp.error?.includes('401') || resp.error?.includes('403')
          ? '权限不足，请确认 API Key 为超级管理员权限'
          : resp.error ?? '获取渠道列表失败';
        dispatch({
          type: 'SET_CHANNELS',
          payload: { list: [], comparisons: [], loading: false, error: errMsg },
        });
        return;
      }

      const channelList = resp.data ?? [];

      // Flatten upstream prices for comparison
      const allPrices = upstreamPrices
        .filter((r) => r.success)
        .flatMap((r) => r.models);

      let comps: ChannelPriceComparison[] = [];
      if (allPrices.length > 0 && channelList.length > 0) {
        try {
          const compareResp = await compareChannels(channelList, allPrices);
          if (compareResp.success) {
            comps = compareResp.comparisons;
          }
        } catch {
          // Non-critical: channels loaded but comparison failed
        }
      }

      dispatch({
        type: 'SET_CHANNELS',
        payload: { list: channelList, comparisons: comps, loading: false },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errMsg = msg.includes('401') || msg.includes('403')
        ? '权限不足，请确认 API Key 为超级管理员权限'
        : msg;
      setLocalError(errMsg);
      dispatch({
        type: 'SET_CHANNELS',
        payload: { list: [], comparisons: [], loading: false, error: errMsg },
      });
    }
  }, [settings, upstreamPrices, dispatch]);

  // Auto-load on mount
  useEffect(() => {
    if (settings && channels.length === 0 && !loading) {
      loadChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  // Group channels by base_url (identify same source)
  const groupedChannels = useMemo(() => {
    if (!mergeBySource) return channels;

    const groups = new Map<string, Channel[]>();

    for (const ch of channels) {
      // Use base_url or key as identifier
      // If not available, use type as fallback (same type = same provider)
      // This groups channels from the same provider together
      const identifier = ch.base_url || ch.key || `type-${ch.type}`;
      const group = groups.get(identifier) || [];
      group.push(ch);
      groups.set(identifier, group);
    }

    // Return one representative channel per group
    const result: Channel[] = [];
    for (const group of groups.values()) {
      // Sort by priority (higher priority first) and use the first one
      const sorted = [...group].sort((a, b) => b.priority - a.priority);
      const representative = { ...sorted[0] };
      // If multiple channels in group, append count to name
      if (group.length > 1) {
        representative.name = `${representative.name} 等 ${group.length} 个分组`;
      }
      result.push(representative);
    }

    return result;
  }, [channels, mergeBySource]);

  // Merge comparison results by source
  const mergedComparisons = useMemo(() => {
    if (!mergeBySource) return comparisons;

    return comparisons.map((comp) => {
      const groups = new Map<string, ChannelModelPrice[]>();

      for (const ch of comp.channels) {
        // Find the original channel to get base_url/key
        const originalChannel = channels.find((c) => c.id === ch.channelId);
        const identifier = originalChannel?.base_url || originalChannel?.key || `type-${originalChannel?.type || 'unknown'}`;

        const group = groups.get(identifier) || [];
        group.push(ch);
        groups.set(identifier, group);
      }

      // Keep one channel per group (the one with highest priority or first one)
      const mergedChannels: ChannelModelPrice[] = [];
      for (const [identifier, group] of groups) {
        // Sort by upstream price (cheapest first) or use first one
        const sorted = [...group].sort((a, b) => {
          if (a.upstreamInputPrice !== undefined && b.upstreamInputPrice !== undefined) {
            return a.upstreamInputPrice - b.upstreamInputPrice;
          }
          return 0;
        });
        const representative = { ...sorted[0] };
        // If multiple channels in group, append count
        if (group.length > 1) {
          representative.channelName = `${representative.channelName} 等 ${group.length} 个分组`;
        }
        mergedChannels.push(representative);
      }

      return {
        ...comp,
        channels: mergedChannels,
      };
    });
  }, [comparisons, channels, mergeBySource]);

  const allModelIds = useMemo(() => getAllModelIds(mergedComparisons), [mergedComparisons]);

  // Filter models by selected channel
  const filteredModelIds = useMemo(() => {
    if (!selectedChannelId) return allModelIds;
    return mergedComparisons
      .filter((c) => c.channels.some((ch) => ch.channelId === selectedChannelId))
      .map((c) => c.modelId)
      .sort();
  }, [mergedComparisons, selectedChannelId, allModelIds]);

  // Apply model search filter
  const displayModelIds = useMemo(() => {
    if (!modelSearch.trim()) return filteredModelIds;
    const q = modelSearch.toLowerCase();
    return filteredModelIds.filter((id) => id.toLowerCase().includes(q));
  }, [filteredModelIds, modelSearch]);

  // Get comparison data for the selected model
  const selectedComparison = useMemo(() => {
    if (!selectedModelId) return null;
    return mergedComparisons.find((c) => c.modelId === selectedModelId) ?? null;
  }, [mergedComparisons, selectedModelId]);

  // Channel options for filter dropdown
  const channelOptions = useMemo(
    () =>
      (groupedChannels || []).map((ch) => ({
        label: `${ch.name} (${getChannelTypeLabel(ch.type)})`,
        value: ch.id,
      })),
    [groupedChannels],
  );

  // Model options for selection dropdown
  const modelOptions = useMemo(
    () => displayModelIds.map((id) => ({ label: id, value: id })),
    [displayModelIds],
  );

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  const handleChannelFilter = (channelId: number | undefined) => {
    dispatch({
      type: 'SET_CHANNELS',
      payload: {
        list: channels,
        comparisons,
        loading: false,
        error,
        selectedChannelId: channelId,
        selectedModelId: undefined, // reset model selection when channel changes
      },
    });
  };

  const handleModelSelect = (modelId: string | undefined) => {
    dispatch({
      type: 'SET_CHANNELS',
      payload: {
        list: channels,
        comparisons,
        loading: false,
        error,
        selectedChannelId,
        selectedModelId: modelId,
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Channel list table columns
  // ---------------------------------------------------------------------------

  const channelColumns: ColumnsType<Channel> = [
    {
      title: '渠道名称',
      dataIndex: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 140,
      render: (type: number) => <Tag>{getChannelTypeLabel(type)}</Tag>,
      sorter: (a, b) => a.type - b.type,
    },
    {
      title: '支持模型数',
      width: 120,
      render: (_: unknown, record: Channel) => countModels(record.models),
      sorter: (a, b) => countModels(a.models) - countModels(b.models),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status: number) =>
        status === 1 ? (
          <Tag color="success">启用</Tag>
        ) : (
          <Tag color="default">禁用</Tag>
        ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      sorter: (a, b) => a.priority - b.priority,
    },
  ];

  // ---------------------------------------------------------------------------
  // Price comparison table columns
  // ---------------------------------------------------------------------------

  const priceColumns: ColumnsType<ChannelModelPrice> = [
    {
      title: '渠道名称',
      dataIndex: 'channelName',
      ellipsis: true,
    },
    {
      title: '渠道内模型名',
      dataIndex: 'originalModelId',
      ellipsis: true,
      render: (val: string, record: ChannelModelPrice) =>
        val !== record.modelId ? (
          <span>
            {val} <Text type="secondary">→ {record.modelId}</Text>
          </span>
        ) : (
          val
        ),
    },
    {
      title: '输入价格 ($/1M)',
      dataIndex: 'upstreamInputPrice',
      width: 150,
      render: (v?: number) => (v !== undefined ? `$${v.toFixed(4)}` : '-'),
      sorter: (a, b) => (a.upstreamInputPrice ?? Infinity) - (b.upstreamInputPrice ?? Infinity),
    },
    {
      title: '输出价格 ($/1M)',
      dataIndex: 'upstreamOutputPrice',
      width: 150,
      render: (v?: number) => (v !== undefined ? `$${v.toFixed(4)}` : '-'),
      sorter: (a, b) => (a.upstreamOutputPrice ?? Infinity) - (b.upstreamOutputPrice ?? Infinity),
    },
    {
      title: '最低价',
      dataIndex: 'isCheapest',
      width: 80,
      render: (v: boolean) =>
        v ? <Tag color="success">最低</Tag> : null,
    },
  ];

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  if (!settings) {
    return <Alert type="warning" showIcon message="请先配置 New API 连接" />;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const displayError = localError || error;

  return (
    <div>
      <Space align="baseline" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          渠道对比
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          (测试功能,待定)
        </Text>
      </Space>

      {/* Action bar */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Button
          type="primary"
          icon={<ApiOutlined />}
          loading={loading}
          onClick={loadChannels}
        >
          加载渠道
        </Button>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={loadChannels}
        >
          刷新
        </Button>
        <Space>
          <Switch
            checked={mergeBySource}
            onChange={setMergeBySource}
          />
          <span style={{ fontSize: 14 }}>合并同一中转站</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            (按 base_url 分组显示)
          </Text>
        </Space>
        <Link to="/channel-priority">
          <Button icon={<ControlOutlined />}>调配优先级</Button>
        </Link>
      </Space>

      {/* Error display */}
      {displayError && (
        <Alert
          type="error"
          showIcon
          message="获取渠道失败"
          description={displayError}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setLocalError(undefined)}
          action={
            <Button size="small" onClick={loadChannels}>
              重试
            </Button>
          }
        />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="正在获取渠道数据..." />
        </div>
      )}

      {/* No upstream prices warning */}
      {!loading && channels.length > 0 && upstreamPrices.length === 0 && (
        <Alert
          type="info"
          showIcon
          message="提示"
          description="尚未获取上游价格数据，价格对比功能不可用。请先在「抓取价格」页面获取上游价格。"
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Main content */}
      {!loading && channels.length > 0 && (
        <Row gutter={[16, 16]}>
          {/* Channel list */}
          <Col span={24}>
            <Card
              title={
                mergeBySource
                  ? `渠道列表 (${groupedChannels.length} 个中转站，原始 ${channels.length} 个渠道)`
                  : `渠道列表 (${channels.length})`
              }
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Table<Channel>
                rowKey="id"
                columns={channelColumns}
                dataSource={groupedChannels}
                size="small"
                pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 个渠道` }}
              />
            </Card>
          </Col>

          {/* Model price comparison */}
          {mergedComparisons.length > 0 && (
            <Col span={24}>
              <Card title="模型价格对比" size="small">
                {/* Filters */}
                <Space wrap style={{ marginBottom: 16 }}>
                  <Select
                    placeholder="按渠道筛选"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    style={{ width: 240 }}
                    value={selectedChannelId}
                    onChange={handleChannelFilter}
                    options={channelOptions}
                  />
                  <Select
                    placeholder="选择模型查看对比"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    style={{ width: 320 }}
                    value={selectedModelId}
                    onChange={handleModelSelect}
                    options={modelOptions}
                  />
                  <Input
                    placeholder="搜索模型名..."
                    prefix={<SearchOutlined />}
                    style={{ width: 200 }}
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    allowClear
                  />
                  <Text type="secondary">
                    共 {displayModelIds.length} 个模型
                  </Text>
                </Space>

                {/* Selected model comparison table */}
                {selectedComparison ? (
                  <>
                    <Title level={5} style={{ marginBottom: 12 }}>
                      {selectedComparison.modelId} — {selectedComparison.channels.length} 个渠道
                    </Title>

                    {/* Price not found warning */}
                    {selectedComparison.channels.every((ch) => ch.upstreamInputPrice === undefined) && (
                      <Alert
                        type="warning"
                        showIcon
                        message="未找到上游价格"
                        description={
                          <div>
                            <div>模型 "{selectedComparison.modelId}" 在上游价格数据中未找到。可能原因：</div>
                            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                              <li>该模型不在上游价格数据库中</li>
                              <li>模型名称不匹配（上游使用不同的命名）</li>
                              <li>需要在「抓取价格」页面重新抓取最新数据</li>
                            </ul>
                          </div>
                        }
                        style={{ marginBottom: 16 }}
                      />
                    )}

                    <Table<ChannelModelPrice>
                      rowKey={(record) => `${record.channelId}-${record.originalModelId}`}
                      columns={priceColumns}
                      dataSource={selectedComparison.channels}
                      size="small"
                      pagination={false}
                      rowClassName={(record) =>
                        record.isCheapest ? 'row-cheapest' : ''
                      }
                    />
                    {selectedComparison.channels.some((ch) => ch.isCheapest) && (
                      <div style={{ marginTop: 12, textAlign: 'right' }}>
                        <Link to="/channel-priority">
                          <Button type="link" icon={<ControlOutlined />}>
                            前往调配优先级
                          </Button>
                        </Link>
                      </div>
                    )}
                  </>
                ) : (
                  <Alert
                    type="info"
                    showIcon
                    message="请选择一个模型查看各渠道的价格对比"
                    style={{ marginTop: 8 }}
                  />
                )}
              </Card>
            </Col>
          )}
        </Row>
      )}

      {/* Cheapest row highlight style */}
      <style>{`
        .row-cheapest {
          background-color: #f6ffed !important;
        }
        .row-cheapest:hover td {
          background-color: #f6ffed !important;
        }
      `}</style>
    </div>
  );
}
