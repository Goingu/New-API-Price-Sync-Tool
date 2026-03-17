import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Space, message, Tag, Select, Table, Spin, Empty, Alert, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../../context/AppContext';
import { fetchChannels, getChannelSources, getChannelSourcePriceRates, proxyForward } from '../../api/client';
import type { Channel, RatioConfig } from '@newapi-sync/shared';
import { buildChannelRateMap } from '../../utils/channelUrl';
import type { ComparisonRow } from './types';

const { Text } = Typography;

export default function ChannelComparisonTab() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelPriceRates, setChannelPriceRates] = useState<Map<number, number>>(new Map());
  const [ratioConfig, setRatioConfig] = useState<RatioConfig | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!connection) return;
    setLoading(true);
    try {
      const [channelResp, sourcesResp, sourceRatesResp, ratioResp] = await Promise.all([
        fetchChannels(connection),
        getChannelSources(),
        getChannelSourcePriceRates(),
        proxyForward<{ data: any }>(connection, 'GET', '/api/ratio_config'),
      ]);

      let fetchedChannels: Channel[] = [];
      if (channelResp.success && channelResp.data) {
        fetchedChannels = channelResp.data;
        setChannels(fetchedChannels);
      }

      if (sourcesResp.success && sourceRatesResp.success) {
        setChannelPriceRates(buildChannelRateMap(fetchedChannels, sourcesResp.sources, sourceRatesResp.data));
      } else {
        setChannelPriceRates(new Map());
      }

      if (ratioResp.success && ratioResp.data) {
        const apiData = ratioResp.data.data || ratioResp.data;
        setRatioConfig({
          modelRatio: apiData.model_ratio || apiData.modelRatio || {},
          completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`加载数据失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => { loadData(); }, [loadData]);

  const modelList = useMemo(() => {
    const modelSet = new Set<string>();
    for (const ch of channels) {
      if (!ch.models) continue;
      ch.models.split(',').map((m) => m.trim()).filter(Boolean).forEach((m) => modelSet.add(m));
    }
    return Array.from(modelSet).sort();
  }, [channels]);

  useEffect(() => {
    if (!selectedModel && modelList.length > 0) setSelectedModel(modelList[0]);
  }, [modelList, selectedModel]);

  const comparisonData = useMemo((): ComparisonRow[] => {
    if (!selectedModel || !ratioConfig) return [];
    const modelRatio = ratioConfig.modelRatio[selectedModel] ?? null;
    const rows: ComparisonRow[] = [];
    for (const ch of channels) {
      if (!ch.models) continue;
      const models = ch.models.split(',').map((m) => m.trim());
      if (!models.includes(selectedModel)) continue;
      const priceRate = channelPriceRates.get(ch.id) ?? null;
      let effectiveUnitCost: number | null = null;
      if (modelRatio != null && priceRate != null && priceRate > 0) {
        effectiveUnitCost = modelRatio * (1 / priceRate);
      }
      rows.push({ key: String(ch.id), channelId: ch.id, channelName: ch.name, modelRatio, priceRate, effectiveUnitCost });
    }
    rows.sort((a, b) => {
      if (a.effectiveUnitCost != null && b.effectiveUnitCost != null) return a.effectiveUnitCost - b.effectiveUnitCost;
      if (a.effectiveUnitCost != null) return -1;
      if (b.effectiveUnitCost != null) return 1;
      return 0;
    });
    return rows;
  }, [selectedModel, ratioConfig, channels, channelPriceRates]);

  const minCost = useMemo(() => {
    const costs = comparisonData.map((r) => r.effectiveUnitCost).filter((c): c is number => c != null);
    return costs.length > 0 ? Math.min(...costs) : null;
  }, [comparisonData]);

  if (!connection) {
    return <Alert type="warning" showIcon message="未配置连接" description="请先在连接设置中配置 New API 实例地址和 API Key" style={{ margin: 24 }} />;
  }

  const columns: ColumnsType<ComparisonRow> = [
    {
      title: '渠道名称', dataIndex: 'channelName', key: 'channelName',
      render: (name: string, record) => {
        const isCheapest = minCost != null && record.effectiveUnitCost === minCost;
        return <Space><span>{name}</span>{isCheapest && <Tag color="green">最优</Tag>}</Space>;
      },
    },
    {
      title: '模型倍率 (Model Ratio)', dataIndex: 'modelRatio', key: 'modelRatio', align: 'right',
      render: (v: number | null) => (v != null ? v.toFixed(4) : <Text type="secondary">—</Text>),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space>
          <Text strong>选择模型：</Text>
          <Select
            showSearch placeholder="请选择模型" value={selectedModel} onChange={setSelectedModel}
            style={{ minWidth: 320 }} options={modelList.map((m) => ({ label: m, value: m }))}
            filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
        {comparisonData.length > 0 ? (
          <Table<ComparisonRow>
            columns={columns} dataSource={comparisonData} pagination={false} size="middle"
            rowClassName={(record) => minCost != null && record.effectiveUnitCost === minCost ? 'ant-table-row-cheapest' : ''}
          />
        ) : (
          <Empty description={selectedModel ? '该模型没有可用渠道' : '请选择一个模型'} />
        )}
      </Space>
    </Spin>
  );
}
