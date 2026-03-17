import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
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
  SearchOutlined,
  SyncOutlined,
  InfoCircleOutlined,
  DatabaseOutlined,
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
import { extractProvider } from '../utils/helpers';
import { useOwnedModels } from '../hooks/useOwnedModels';
import type { SourceRatioData, ComparisonRow } from './channelSourceRatios/types';
import SourceGroupSelector from './channelSourceRatios/SourceGroupSelector';
import ApplyRatiosModal from './channelSourceRatios/ApplyRatiosModal';
import { buildSourceColumns } from './channelSourceRatios/RatioSourceColumns';

const { Title, Text } = Typography;

export default function ChannelSourceRatios() {
  const { state } = useAppContext();
  const { settings } = state.connection;

  const [sources, setSources] = useState<ChannelSource[]>([]);
  const [ratioData, setRatioData] = useState<SourceRatioData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState('');
  const [markupPercent, setMarkupPercent] = useState(20);
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [showUnsetOnly, setShowUnsetOnly] = useState(false);
  const [showRealCost, setShowRealCost] = useState(false);
  const [sourcePriceRates, setSourcePriceRates] = useState<Map<number, number>>(new Map());
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Map<string, Set<number>>>(new Map());
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [fetchedTimes, setFetchedTimes] = useState<Map<number, string>>(new Map());
  const [upstreamPrices, setUpstreamPrices] = useState<Map<string, { inputPrice: number; outputPrice: number }>>(new Map());

  const owned = useOwnedModels();

  // ── Data loading effects ──────────────────────────────────────────────

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const resp = await getChannelSources();
        if (resp.success) {
          setSources(resp.sources.filter((s) => s.enabled));
          setSelectedGroups(new Map());
        }
      } catch (err: unknown) {
        console.error('Failed to fetch channel sources:', err);
      }
    };
    fetchSources();
  }, []);

  useEffect(() => {
    if (state.upstreamPrices.results.length > 0) {
      const priceMap = new Map<string, { inputPrice: number; outputPrice: number }>();
      state.upstreamPrices.results.forEach((result) => {
        if (result.success) {
          result.models.forEach((model) => {
            if (model.pricingType === 'per_token') {
              const price = { inputPrice: model.inputPricePerMillion, outputPrice: model.outputPricePerMillion };
              priceMap.set(model.modelId, price);
              const normalized = model.modelId.includes('/') ? model.modelId.split('/').slice(1).join('/') : model.modelId;
              if (normalized !== model.modelId) priceMap.set(normalized, price);
              const lowerKey = model.modelId.toLowerCase();
              if (lowerKey !== model.modelId) priceMap.set(lowerKey, price);
            }
          });
        }
      });
      setUpstreamPrices(priceMap);
    }
  }, [state.upstreamPrices.results]);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const resp = await getChannelSourcePriceRates();
        if (resp.success) {
          const rateMap = new Map<number, number>();
          resp.data.forEach((rate) => rateMap.set(rate.sourceId, rate.priceRate));
          setSourcePriceRates(rateMap);
        }
      } catch (err: unknown) {
        console.error('Failed to load channel source price rates:', err);
      }
    };
    loadRates();
  }, []);

  useEffect(() => { loadCachedRatios(); }, []);

  // ── Derived state ─────────────────────────────────────────────────────

  const actualSelectedSourceIds = useMemo(() => {
    const ids: number[] = [];
    selectedGroups.forEach((sourceIds) => ids.push(...Array.from(sourceIds)));
    return ids;
  }, [selectedGroups]);

  // ── Cache helpers ──────────────────────────────────────────────────────

  const loadCachedRatios = useCallback(async () => {
    setCacheLoading(true);
    try {
      const resp = await getCachedRatios();
      if (resp.success && resp.cached.length > 0) {
        const cachedData: SourceRatioData[] = resp.cached.map((entry) => ({
          sourceId: entry.sourceId,
          sourceName: entry.sourceName,
          success: true,
          ratioConfig: entry.ratioConfig,
          fetchedAt: entry.fetchedAt,
          isFromCache: true,
        }));
        setRatioData(cachedData);
        const times = new Map<number, string>();
        resp.cached.forEach((entry) => times.set(entry.sourceId, entry.fetchedAt));
        setFetchedTimes(times);
        message.success(`已加载 ${resp.cached.length} 个渠道源的缓存数据`);
      }
      setCacheLoaded(true);
    } catch {
      setCacheLoaded(true);
    } finally {
      setCacheLoading(false);
    }
  }, []);

  const saveCachedRatios = useCallback(async (data: SourceRatioData[]) => {
    try {
      await Promise.all(
        data.filter((d) => d.success && d.ratioConfig).map((d) => saveCachedRatio(d.sourceId, d.sourceName, d.ratioConfig!)),
      );
    } catch (err: unknown) {
      console.error('Failed to save cached ratios:', err);
    }
  }, []);

  // ── Fetch ratios ──────────────────────────────────────────────────────

  const fetchRatios = useCallback(async () => {
    if (actualSelectedSourceIds.length === 0) { message.warning('请至少选择一个渠道源'); return; }
    setLoading(true);
    setError(undefined);
    try {
      const resp = await compareChannelSourceRatios(actualSelectedSourceIds);
      if (resp.success) {
        const now = new Date().toISOString();
        const liveData: SourceRatioData[] = resp.results.map((r) => ({ ...r, fetchedAt: now, isFromCache: false }));
        setRatioData(liveData);
        const times = new Map<number, string>();
        liveData.forEach((d) => { if (d.success) times.set(d.sourceId, now); });
        setFetchedTimes(times);
        const failedCount = resp.results.filter((r) => !r.success).length;
        const successCount = resp.results.filter((r) => r.success).length;
        if (failedCount > 0) message.warning(`${successCount} 个成功，${failedCount} 个失败`);
        else message.success('获取成功');
        saveCachedRatios(liveData);
        if (showUnsetOnly && owned.ownedModels.size === 0) owned.fetch();
      } else {
        setError('获取倍率失败');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [actualSelectedSourceIds, showUnsetOnly, owned, saveCachedRatios]);

  // ── Comparison rows ───────────────────────────────────────────────────

  const comparisonRows = useMemo(() => {
    const modelMap = new Map<string, ComparisonRow>();
    for (const data of ratioData) {
      if (!data.success || !data.ratioConfig) continue;
      const rc = data.ratioConfig;
      const allModelIds = new Set([...Object.keys(rc.modelRatio || {}), ...Object.keys(rc.modelPrice || {})]);
      for (const modelId of allModelIds) {
        if (!modelMap.has(modelId)) modelMap.set(modelId, { modelId, sources: {} });
        const row = modelMap.get(modelId)!;
        row.sources[data.sourceId] = {
          modelRatio: rc.modelRatio?.[modelId] ?? 0,
          completionRatio: rc.completionRatio?.[modelId] ?? 1,
          modelPrice: rc.modelPrice?.[modelId],
        };
      }
    }
    const rows = Array.from(modelMap.values());
    for (const row of rows) {
      let lowestCost = Infinity;
      let lowestSourceId: number | undefined;
      for (const [sourceId, ratios] of Object.entries(row.sources)) {
        const isPerRequest = ratios.modelPrice !== undefined && ratios.modelPrice > 0;
        if (!isPerRequest && ratios.modelRatio <= 0) continue;
        let cost: number;
        if (showRealCost) {
          const priceRate = sourcePriceRates.get(parseInt(sourceId, 10));
          if (!priceRate || priceRate <= 0) continue;
          const usdPrice = isPerRequest ? ratios.modelPrice! : ratios.modelRatio * 0.75;
          cost = usdPrice * (1 / priceRate);
        } else {
          cost = isPerRequest ? ratios.modelPrice! : ratios.modelRatio;
        }
        if (cost < lowestCost) { lowestCost = cost; lowestSourceId = parseInt(sourceId, 10); }
      }
      row.lowestSourceId = lowestSourceId;
      row.lowestRatio = lowestCost === Infinity ? undefined : lowestCost;
    }
    return rows;
  }, [ratioData, showRealCost, sourcePriceRates]);

  const allProviders = useMemo(() => {
    const providers = new Set<string>();
    comparisonRows.forEach((row) => providers.add(extractProvider(row.modelId)));
    return Array.from(providers).sort();
  }, [comparisonRows]);

  const filteredRows = useMemo(() => {
    let filtered = comparisonRows;
    if (search.trim()) { const q = search.toLowerCase(); filtered = filtered.filter((r) => r.modelId.toLowerCase().includes(q)); }
    if (selectedProviders.length > 0) filtered = filtered.filter((r) => selectedProviders.includes(extractProvider(r.modelId)));
    if (showUnsetOnly && owned.ownedModels.size > 0) {
      filtered = filtered.filter((r) => owned.ownedModels.has(r.modelId) && !owned.configuredModels.has(r.modelId));
    }
    return filtered;
  }, [comparisonRows, search, showUnsetOnly, owned.ownedModels, owned.configuredModels, selectedProviders]);

  // ── Apply ratios ──────────────────────────────────────────────────────

  const handleApplyRatios = useCallback(async () => {
    if (!settings) { message.error('请先配置 New API 连接'); return; }
    if (selectedModels.size === 0) { message.warning('请至少选择一个模型'); return; }
    setApplying(true);
    try {
      const currentResp = await proxyForward<{ data: any }>(settings, 'GET', '/api/ratio_config');
      if (!currentResp.success || !currentResp.data) throw new Error('获取当前倍率失败');
      const apiData = currentResp.data.data || currentResp.data;
      const currentConfig: RatioConfig = {
        modelRatio: apiData.model_ratio || apiData.modelRatio || {},
        completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
        modelPrice: apiData.model_price || apiData.modelPrice || {},
      };
      const markup = 1 + markupPercent / 100;
      let updateCount = 0;
      for (const modelId of selectedModels) {
        const row = comparisonRows.find((r) => r.modelId === modelId);
        if (!row || !row.lowestSourceId) continue;
        const lowestRatios = row.sources[row.lowestSourceId];
        if (lowestRatios.modelPrice !== undefined && lowestRatios.modelPrice > 0) {
          if (!currentConfig.modelPrice) currentConfig.modelPrice = {};
          currentConfig.modelPrice[modelId] = lowestRatios.modelPrice * markup;
          updateCount++;
          continue;
        }
        if (lowestRatios.modelRatio <= 0) continue;
        currentConfig.modelRatio[modelId] = lowestRatios.modelRatio * markup;
        currentConfig.completionRatio[modelId] = lowestRatios.completionRatio > 0 ? lowestRatios.completionRatio : 1;
        updateCount++;
      }
      if (updateCount === 0) { message.warning('没有可更新的模型'); return; }
      const payloads: Array<{ key: string; value: string }> = [
        { key: 'ModelRatio', value: JSON.stringify(currentConfig.modelRatio) },
        { key: 'CompletionRatio', value: JSON.stringify(currentConfig.completionRatio) },
      ];
      if (currentConfig.modelPrice && Object.keys(currentConfig.modelPrice).length > 0) {
        payloads.push({ key: 'ModelPrice', value: JSON.stringify(currentConfig.modelPrice) });
      }
      for (const payload of payloads) {
        const resp = await proxyForward(settings, 'PUT', '/api/option/', payload);
        if (!resp.success) throw new Error(`更新 ${payload.key} 失败: ${resp.error ?? '未知错误'}`);
      }
      message.success(`成功更新 ${updateCount} 个模型的倍率`);
      setApplyModalVisible(false);
      setSelectedModels(new Set());
    } catch (err: unknown) {
      message.error(`更新失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplying(false);
    }
  }, [settings, selectedModels, comparisonRows, markupPercent]);

  // ── Table columns ─────────────────────────────────────────────────────

  const columns: ColumnsType<ComparisonRow> = useMemo(() => [
    { title: '模型名称', dataIndex: 'modelId', fixed: 'left' as const, width: 250, sorter: (a: ComparisonRow, b: ComparisonRow) => a.modelId.localeCompare(b.modelId) },
    {
      title: '官方价格', key: 'officialPrice', width: 180,
      render: (_: unknown, row: ComparisonRow) => {
        let price = upstreamPrices.get(row.modelId) || upstreamPrices.get(row.modelId.toLowerCase());
        if (!price) {
          for (const [key, value] of upstreamPrices.entries()) {
            if (key.includes('/')) {
              const withoutPrefix = key.split('/').slice(1).join('/');
              if (withoutPrefix === row.modelId || withoutPrefix.toLowerCase() === row.modelId.toLowerCase()) { price = value; break; }
            }
          }
        }
        if (!price) return <Text type="secondary">未获取</Text>;
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12, color: '#3b82f6' }}>输入: ${price.inputPrice.toFixed(4)}/M</Text>
            <Text style={{ fontSize: 12, color: '#3b82f6' }}>输出: ${price.outputPrice.toFixed(4)}/M</Text>
          </Space>
        );
      },
    },
    ...buildSourceColumns(ratioData, fetchedTimes, sourcePriceRates, showRealCost),
  ], [ratioData, fetchedTimes, sourcePriceRates, showRealCost, upstreamPrices]);

  const rowSelection = {
    selectedRowKeys: Array.from(selectedModels),
    onChange: (keys: React.Key[]) => setSelectedModels(new Set(keys as string[])),
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (!settings) return <Alert type="warning" showIcon message="请先配置 New API 连接" />;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>实例站倍率同步</Title>
      <Alert type="info" showIcon message="功能说明" description="对比多个渠道源（中转商）的倍率配置，找出最便宜的渠道源，并可以一键应用到您的实例。数据会自动缓存 24 小时，下次访问时自动加载。" style={{ marginBottom: 16 }} closable />

      {cacheLoaded && ratioData.length > 0 && (
        <Alert type="success" showIcon icon={<DatabaseOutlined />} message={
          <Space>
            <span>缓存状态</span>
            {ratioData.some((d) => d.isFromCache) && <Tag color="blue">已加载 {ratioData.filter((d) => d.isFromCache).length} 个缓存</Tag>}
            {ratioData.some((d) => !d.isFromCache) && <Tag color="green">已获取 {ratioData.filter((d) => !d.isFromCache).length} 个实时数据</Tag>}
          </Space>
        } style={{ marginBottom: 16 }} closable />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <SourceGroupSelector sources={sources} selectedGroups={selectedGroups} onGroupsChange={setSelectedGroups} onFetch={fetchRatios} loading={loading} selectedCount={actualSelectedSourceIds.length} />
          {ratioData.length > 0 && (
            <Space wrap>
              <Input placeholder="搜索模型名称" prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} allowClear style={{ width: 250 }} />
              <Select mode="multiple" placeholder="筛选模型提供商" value={selectedProviders} onChange={setSelectedProviders} style={{ minWidth: 200 }} maxTagCount="responsive" allowClear>
                {allProviders.map((p) => <Select.Option key={p} value={p}>{p}</Select.Option>)}
              </Select>
              <Space direction="vertical" size="small">
                <Space>
                  <Switch checked={showRealCost} onChange={setShowRealCost} />
                  <span style={{ fontSize: 14 }}>显示实际成本（含汇率）</span>
                  <Tooltip title="开启后，价格会根据渠道源的充值汇率转换为人民币显示"><InfoCircleOutlined style={{ color: '#a1a1aa', cursor: 'help' }} /></Tooltip>
                </Space>
                <Space>
                  <Switch checked={showUnsetOnly} onChange={(checked) => { setShowUnsetOnly(checked); if (checked && owned.ownedModels.size === 0) owned.fetch(); }} loading={owned.loading} />
                  <span style={{ fontSize: 14 }}>只看未设置倍率的模型</span>
                  <Tooltip title="只显示在您的实例中已启用但还没有配置倍率的模型"><InfoCircleOutlined style={{ color: '#a1a1aa', cursor: 'help' }} /></Tooltip>
                </Space>
              </Space>
              <Tooltip title="将选中模型的最低成本倍率（加上加价比例）同步到您的 New API 实例">
                <Button type="default" icon={<SyncOutlined />} disabled={selectedModels.size === 0} onClick={() => setApplyModalVisible(true)}>应用选中的倍率 ({selectedModels.size})</Button>
              </Tooltip>
              <Text type="secondary">共 {filteredRows.length} 个模型{showUnsetOnly && owned.ownedModels.size > 0 && ` (实例中已启用 ${owned.ownedModels.size} 个)`}</Text>
            </Space>
          )}
        </Space>
      </Card>

      {error && <Alert type="error" showIcon message="获取失败" description={error} style={{ marginBottom: 16 }} closable onClose={() => setError(undefined)} />}
      {ratioData.length > 0 && ratioData.some((d) => !d.success) && (
        <Alert type="warning" showIcon message="部分渠道源获取失败" description={<div>{ratioData.filter((d) => !d.success).map((d) => <div key={d.sourceId} style={{ marginBottom: 4 }}><Text strong>{d.sourceName}</Text>: {d.error || '未知错误'}</div>)}</div>} style={{ marginBottom: 16 }} closable />
      )}
      {(loading || cacheLoading) && <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" tip={cacheLoading ? '正在加载缓存数据...' : '正在获取倍率数据...'} /></div>}
      {!loading && !cacheLoading && ratioData.length > 0 && (
        <Table<ComparisonRow> rowKey="modelId" columns={columns} dataSource={filteredRows} rowSelection={rowSelection} size="small" scroll={{ x: 800 }} pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 个模型` }} />
      )}

      <ApplyRatiosModal visible={applyModalVisible} onCancel={() => setApplyModalVisible(false)} onOk={handleApplyRatios} confirming={applying} selectedModels={selectedModels} comparisonRows={comparisonRows} ratioData={ratioData} markupPercent={markupPercent} onMarkupChange={setMarkupPercent} />
    </div>
  );
}
