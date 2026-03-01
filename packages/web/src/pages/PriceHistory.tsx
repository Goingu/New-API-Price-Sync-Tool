import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useAppContext } from '../context/AppContext';
import { fetchPriceHistory } from '../api/client';
import type { PriceHistoryEntry, ModelPrice } from '@newapi-sync/shared';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect unique provider names from entries. */
function uniqueProviders(entries: PriceHistoryEntry[]): string[] {
  return [...new Set(entries.map((e) => e.provider))].sort();
}

/** Collect unique model ids across all entries. */
function uniqueModels(entries: PriceHistoryEntry[]): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const entry of entries) {
    for (const m of entry.models) {
      if (!map.has(m.modelId)) {
        map.set(m.modelId, m.modelName || m.modelId);
      }
    }
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PriceHistory() {
  const { state, dispatch } = useAppContext();
  const { entries, loading, error } = state.priceHistory;

  const [providerFilter, setProviderFilter] = useState<string>();
  const [timeRange, setTimeRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [modelEntries, setModelEntries] = useState<PriceHistoryEntry[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string>();

  // --- Load all history on mount ---
  const loadHistory = useCallback(async () => {
    dispatch({ type: 'SET_PRICE_HISTORY', payload: { entries: [], loading: true } });
    try {
      const resp = await fetchPriceHistory();
      dispatch({
        type: 'SET_PRICE_HISTORY',
        payload: { entries: resp.entries, loading: false },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({
        type: 'SET_PRICE_HISTORY',
        payload: { entries: [], loading: false, error: msg },
      });
    }
  }, [dispatch]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // --- Load model-specific history ---
  const loadModelHistory = useCallback(async (modelId: string) => {
    setModelLoading(true);
    setModelError(undefined);
    try {
      const resp = await fetchPriceHistory(modelId);
      setModelEntries(resp.entries);
    } catch (err: unknown) {
      setModelError(err instanceof Error ? err.message : String(err));
      setModelEntries([]);
    } finally {
      setModelLoading(false);
    }
  }, []);

  const handleModelSelect = useCallback(
    (modelId: string | undefined) => {
      setSelectedModelId(modelId);
      setModelEntries([]);
      setModelError(undefined);
      if (modelId) {
        loadModelHistory(modelId);
      }
    },
    [loadModelHistory],
  );

  // --- Derived data ---
  const providers = useMemo(() => uniqueProviders(entries), [entries]);
  const models = useMemo(() => uniqueModels(entries), [entries]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (providerFilter) {
      result = result.filter((e) => e.provider === providerFilter);
    }
    if (timeRange) {
      const [start, end] = timeRange;
      result = result.filter((e) => {
        const t = dayjs(e.fetchedAt);
        return t.isAfter(start.startOf('day')) && t.isBefore(end.endOf('day'));
      });
    }
    return result;
  }, [entries, providerFilter, timeRange]);

  // --- Table columns: history timeline ---
  const historyColumns: ColumnsType<PriceHistoryEntry> = [
    {
      title: '时间',
      dataIndex: 'fetchedAt',
      key: 'fetchedAt',
      sorter: (a, b) => dayjs(a.fetchedAt).unix() - dayjs(b.fetchedAt).unix(),
      defaultSortOrder: 'descend',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
      width: 200,
    },
    {
      title: '厂商',
      dataIndex: 'provider',
      key: 'provider',
      width: 150,
    },
    {
      title: '模型数量',
      key: 'modelCount',
      width: 120,
      render: (_: unknown, record: PriceHistoryEntry) => record.models.length,
      sorter: (a, b) => a.models.length - b.models.length,
    },
  ];

  // --- Table columns: model price trend ---
  const modelTrendColumns: ColumnsType<ModelPrice & { fetchedAt: string; provider: string }> = [
    {
      title: '时间',
      dataIndex: 'fetchedAt',
      key: 'fetchedAt',
      sorter: (a, b) => dayjs(a.fetchedAt).unix() - dayjs(b.fetchedAt).unix(),
      defaultSortOrder: 'descend',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
      width: 200,
    },
    {
      title: '厂商',
      dataIndex: 'provider',
      key: 'provider',
      width: 150,
    },
    {
      title: '计费类型',
      dataIndex: 'pricingType',
      key: 'pricingType',
      width: 90,
      render: (type?: string) =>
        type === 'per_request'
          ? <Tag color="orange">按次</Tag>
          : <Tag color="blue">按 Token</Tag>,
    },
    {
      title: '输入价格 ($/1M tokens)',
      dataIndex: 'inputPricePerMillion',
      key: 'inputPrice',
      render: (val: number, record) =>
        record.pricingType === 'per_request'
          ? <span style={{ color: '#999' }}>不适用</span>
          : `$${val.toFixed(4)}`,
      sorter: (a, b) => a.inputPricePerMillion - b.inputPricePerMillion,
      width: 200,
    },
    {
      title: '输出价格 ($/1M tokens)',
      dataIndex: 'outputPricePerMillion',
      key: 'outputPrice',
      render: (val: number, record) =>
        record.pricingType === 'per_request'
          ? <span style={{ color: '#999' }}>不适用</span>
          : `$${val.toFixed(4)}`,
      sorter: (a, b) => a.outputPricePerMillion - b.outputPricePerMillion,
      width: 200,
    },
    {
      title: '模型价格 (USD/次)',
      dataIndex: 'pricePerRequest',
      key: 'pricePerRequest',
      render: (val: number | undefined, record) =>
        record.pricingType === 'per_request' && val !== undefined
          ? `$${val.toFixed(4)}`
          : <span style={{ color: '#999' }}>—</span>,
      width: 160,
    },
  ];

  // Flatten model entries into rows with fetchedAt and provider
  const modelTrendData = useMemo(() => {
    return modelEntries.flatMap((entry) =>
      entry.models.map((m, idx) => ({
        ...m,
        fetchedAt: entry.fetchedAt,
        provider: entry.provider,
        _key: `${entry.id ?? entry.fetchedAt}-${idx}`,
      })),
    );
  }, [modelEntries]);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        <HistoryOutlined style={{ marginRight: 8 }} />
        价格历史
      </Title>

      {/* Filters */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="按厂商筛选"
          allowClear
          style={{ width: 180 }}
          value={providerFilter}
          onChange={setProviderFilter}
          options={providers.map((p) => ({ value: p, label: p }))}
        />
        <RangePicker
          placeholder={['开始日期', '结束日期']}
          value={timeRange}
          onChange={(val) => setTimeRange(val as [Dayjs, Dayjs] | null)}
        />
        <Button icon={<ReloadOutlined />} onClick={loadHistory} loading={loading}>
          刷新
        </Button>
      </Space>

      {/* Error */}
      {error && (
        <Alert
          type="error"
          showIcon
          message="加载价格历史失败"
          description={error}
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      {/* History timeline table */}
      <Table<PriceHistoryEntry>
        columns={historyColumns}
        dataSource={filteredEntries}
        rowKey={(r) => `${r.id ?? r.fetchedAt}-${r.provider}`}
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条记录` }}
        size="middle"
        style={{ marginBottom: 32 }}
      />

      {/* Model price trend section */}
      <Title level={5} style={{ marginBottom: 16 }}>
        模型价格变化趋势
      </Title>

      <Space style={{ marginBottom: 16 }}>
        <Select
          showSearch
          placeholder="选择模型查看价格趋势"
          allowClear
          style={{ width: 320 }}
          value={selectedModelId}
          onChange={handleModelSelect}
          options={models}
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
      </Space>

      {selectedModelId && (
        <>
          {modelLoading && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Spin tip="加载模型价格历史..." />
            </div>
          )}

          {modelError && (
            <Alert
              type="error"
              showIcon
              message="加载模型价格历史失败"
              description={modelError}
              style={{ marginBottom: 16 }}
              closable
            />
          )}

          {!modelLoading && !modelError && modelTrendData.length === 0 && (
            <Text type="secondary">暂无该模型的价格历史数据</Text>
          )}

          {!modelLoading && modelTrendData.length > 0 && (
            <Table
              columns={modelTrendColumns}
              dataSource={modelTrendData}
              rowKey="_key"
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条记录` }}
              size="middle"
            />
          )}
        </>
      )}
    </div>
  );
}
