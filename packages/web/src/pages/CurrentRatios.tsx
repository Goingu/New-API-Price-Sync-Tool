import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Spin, Table, Switch, Space, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../context/AppContext';
import { proxyForward } from '../api/client';
import type { RatioConfig, Channel } from '@newapi-sync/shared';

const BASE_INPUT_PRICE = 0.75;

interface RatioRow {
  key: string;
  modelName: string;
  modelRatio: number;
  completionRatio: number;
  inputPrice: number;
  outputPrice: number;
}

function buildRows(config: RatioConfig): RatioRow[] {
  if (!config || !config.modelRatio || !config.completionRatio) {
    return [];
  }

  const allModels = new Set([
    ...Object.keys(config.modelRatio),
    ...Object.keys(config.completionRatio),
  ]);

  return Array.from(allModels).map((model) => {
    const mr = config.modelRatio[model] ?? 1;
    const cr = config.completionRatio[model] ?? 1;
    const inputPrice = mr * BASE_INPUT_PRICE;
    const outputPrice = inputPrice * cr;
    return {
      key: model,
      modelName: model,
      modelRatio: mr,
      completionRatio: cr,
      inputPrice,
      outputPrice,
    };
  });
}

export default function CurrentRatios() {
  const { state, dispatch } = useAppContext();
  const { settings } = state.connection;
  const { data, loading, error } = state.currentRatios;

  const [search, setSearch] = useState('');
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [showUnsetRatioOnly, setShowUnsetRatioOnly] = useState(false);
  const [ownedModels, setOwnedModels] = useState<Set<string>>(new Set());
  const [loadingChannels, setLoadingChannels] = useState(false);

  const fetchRatios = useCallback(async () => {
    if (!settings) return;
    dispatch({ type: 'SET_RATIOS', payload: { data: null, loading: true } });
    try {
      const resp = await proxyForward<{ data: any }>(settings, 'GET', '/api/ratio_config');
      if (resp.success && resp.data) {
        // New API returns { data: { model_ratio: {...}, completion_ratio: {...} } }
        const apiData = resp.data.data || resp.data;

        // Convert snake_case to camelCase
        const ratioConfig: RatioConfig = {
          modelRatio: apiData.model_ratio || apiData.modelRatio || {},
          completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
        };

        dispatch({ type: 'SET_RATIOS', payload: { data: ratioConfig, loading: false } });
      } else {
        dispatch({
          type: 'SET_RATIOS',
          payload: { data: null, loading: false, error: resp.error ?? '获取倍率数据失败' },
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'SET_RATIOS', payload: { data: null, loading: false, error: msg } });
    }
  }, [settings, dispatch]);

  const fetchOwnedModels = useCallback(async () => {
    if (!settings) return;
    setLoadingChannels(true);
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
    } catch (err: unknown) {
      console.error('Failed to fetch owned models:', err);
    } finally {
      setLoadingChannels(false);
    }
  }, [settings]);

  useEffect(() => {
    if (settings && !data && !loading && !error) {
      fetchRatios();
    }
  }, [settings]); // Only depend on settings, not fetchRatios

  useEffect(() => {
    if (settings && (showOwnedOnly || showUnsetRatioOnly) && ownedModels.size === 0) {
      fetchOwnedModels();
    }
  }, [settings, showOwnedOnly, showUnsetRatioOnly, ownedModels.size, fetchOwnedModels]);

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  const filtered = useMemo(() => {
    let result = rows;

    // Filter by owned models
    if (showOwnedOnly && ownedModels.size > 0) {
      result = result.filter((r) => ownedModels.has(r.modelName));
    }

    // Filter by unset ratio (owned but not in ratio config, or using default ratio 1.0)
    if (showUnsetRatioOnly && ownedModels.size > 0) {
      // Get models that are owned but not in the current rows (not configured)
      const configuredModels = new Set(rows.map((r) => r.modelName));
      const unsetModels = Array.from(ownedModels).filter((m) => !configuredModels.has(m));

      // Create rows for unset models with default ratios
      const unsetRows: RatioRow[] = unsetModels.map((modelName) => ({
        key: modelName,
        modelName,
        modelRatio: 1,
        completionRatio: 1,
        inputPrice: BASE_INPUT_PRICE,
        outputPrice: BASE_INPUT_PRICE,
      }));

      result = unsetRows;
    }

    // Filter by search text
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.modelName.toLowerCase().includes(q));
    }

    return result;
  }, [rows, search, showOwnedOnly, showUnsetRatioOnly, ownedModels]);

  const columns: ColumnsType<RatioRow> = [
    {
      title: '模型名称',
      dataIndex: 'modelName',
      sorter: (a, b) => a.modelName.localeCompare(b.modelName),
      defaultSortOrder: 'ascend',
    },
    {
      title: '模型倍率',
      dataIndex: 'modelRatio',
      sorter: (a, b) => a.modelRatio - b.modelRatio,
      render: (v: number) => v.toFixed(4),
    },
    {
      title: '补全倍率',
      dataIndex: 'completionRatio',
      sorter: (a, b) => a.completionRatio - b.completionRatio,
      render: (v: number) => v.toFixed(4),
    },
    {
      title: '输入价格 (USD/1M)',
      dataIndex: 'inputPrice',
      sorter: (a, b) => a.inputPrice - b.inputPrice,
      render: (v: number) => `$${v.toFixed(4)}`,
    },
    {
      title: '输出价格 (USD/1M)',
      dataIndex: 'outputPrice',
      sorter: (a, b) => a.outputPrice - b.outputPrice,
      render: (v: number) => `$${v.toFixed(4)}`,
    },
  ];

  if (!settings) {
    return <Alert type="warning" showIcon message="请先配置 New API 连接" />;
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          placeholder="搜索模型名称"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 320 }}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchRatios} loading={loading}>
          刷新
        </Button>
        <Space>
          <Switch
            checked={showOwnedOnly}
            onChange={(checked) => {
              setShowOwnedOnly(checked);
              if (checked) setShowUnsetRatioOnly(false);
            }}
            loading={loadingChannels}
          />
          <span style={{ fontSize: 14 }}>只看已拥有的模型</span>
          <Tooltip title="显示在模型广场中启用的模型，并且在倍率配置中有设置的模型">
            <InfoCircleOutlined style={{ color: '#999', cursor: 'help' }} />
          </Tooltip>
        </Space>
        <Space>
          <Switch
            checked={showUnsetRatioOnly}
            onChange={(checked) => {
              setShowUnsetRatioOnly(checked);
              if (checked) setShowOwnedOnly(false);
            }}
            loading={loadingChannels}
          />
          <span style={{ fontSize: 14 }}>只看未设置倍率的模型</span>
          <Tooltip title="显示在模型广场中启用，但还没有配置倍率的模型（使用默认倍率 1.0）">
            <InfoCircleOutlined style={{ color: '#999', cursor: 'help' }} />
          </Tooltip>
        </Space>
        {data && (
          <span style={{ color: '#888', fontSize: 13 }}>
            共 {filtered.length} 个模型
            {showOwnedOnly && ownedModels.size > 0 && ` (已拥有 ${ownedModels.size} 个)`}
            {showUnsetRatioOnly && ownedModels.size > 0 && ` (已拥有 ${ownedModels.size} 个)`}
          </span>
        )}
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="获取倍率数据失败"
          description={error}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={fetchRatios}>
              重试
            </Button>
          }
        />
      )}

      <Spin spinning={loading}>
        <Table<RatioRow>
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          size="middle"
          scroll={{ x: 800 }}
        />
      </Spin>
    </div>
  );
}
