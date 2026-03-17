import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Select, Space, Spin, Switch, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import { CheckOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ComparisonRow, UpdateLogEntry, UpdateLogModelDetail, UpdateResult, RatioConfig } from '@newapi-sync/shared';
import { useAppContext } from '../context/AppContext';
import { proxyForward, saveUpdateLog, fetchPrices } from '../api/client';
import { compareRatios } from '../utils/comparison';
import { sortComparison, filterComparison } from '../utils/sorting';
import { selectByFilter, buildUpdatePayload } from '../utils/updatePayload';
import { STATUS_COLOR, STATUS_LABEL, STATUS_DESCRIPTION, rowClassName, ROW_HIGHLIGHT_CSS } from './comparisonUpdate/statusHelpers';
import { UpdatePreviewModal, UpdateResultModal } from './comparisonUpdate/UpdateModals';

const { Title, Text } = Typography;

export default function ComparisonUpdate() {
  const { state, dispatch } = useAppContext();
  const { settings } = state.connection;
  const { data: currentRatios, loading: ratiosLoading } = state.currentRatios;
  const { results: priceResults, loading: pricesLoading } = state.upstreamPrices;
  const { rows: comparisonRows, filters, sortBy, sortOrder } = state.comparison;
  const { selectedModelIds, results: updateResults } = state.update;

  const [previewVisible, setPreviewVisible] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [ownedModels, setOwnedModels] = useState<Set<string>>(new Set());

  // ── Auto-load missing data ────────────────────────────────────────────
  useEffect(() => {
    if (!settings) return;
    const loadMissingData = async () => {
      setAutoLoading(true);
      try {
        if (!currentRatios && !ratiosLoading) {
          const resp = await proxyForward<{ data: any }>(settings, 'GET', '/api/ratio_config');
          if (resp.success && resp.data) {
            const apiData = resp.data.data || resp.data;
            dispatch({ type: 'SET_RATIOS', payload: { data: { modelRatio: apiData.model_ratio || apiData.modelRatio || {}, completionRatio: apiData.completion_ratio || apiData.completionRatio || {}, modelPrice: apiData.model_price || apiData.modelPrice }, loading: false } });
          }
        }
        if (priceResults.length === 0 && !pricesLoading) {
          const resp = await fetchPrices(false);
          dispatch({ type: 'SET_PRICES', payload: { results: resp.results, loading: false, lastFetchedAt: new Date().toISOString(), fromCache: resp.fromCache } });
        }
      } catch (error: unknown) { console.error('Failed to auto-load data:', error); }
      finally { setAutoLoading(false); }
    };
    loadMissingData();
  }, []);

  // ── Fetch owned models ────────────────────────────────────────────────
  useEffect(() => {
    if (!settings || !showOwnedOnly || ownedModels.size > 0) return;
    const fetchOwned = async () => {
      try {
        const resp = await proxyForward<{ success: boolean; data: Array<{ model_name: string }> }>(settings, 'GET', '/api/pricing');
        if (resp.success && resp.data?.data) {
          const models = new Set<string>();
          resp.data.data.forEach((item) => { if (item.model_name) models.add(item.model_name); });
          setOwnedModels(models);
        }
      } catch (error: unknown) { console.error('Failed to fetch owned models:', error); }
    };
    fetchOwned();
  }, [settings, showOwnedOnly, ownedModels.size]);

  // ── Build comparison rows ─────────────────────────────────────────────
  useEffect(() => {
    if (!currentRatios || priceResults.length === 0) return;
    const allRatios = priceResults.filter((r) => r.success).flatMap((r) =>
      r.models.map((m) => ({
        modelId: m.modelId, provider: m.provider,
        modelRatio: m.pricingType === 'per_request' ? 0 : m.inputPricePerMillion / 0.75,
        completionRatio: m.pricingType === 'per_request' ? 0 : m.inputPricePerMillion > 0 ? m.outputPricePerMillion / m.inputPricePerMillion : 1,
        pricingType: m.pricingType, pricePerRequest: m.pricePerRequest,
      })),
    );
    dispatch({ type: 'SET_COMPARISON', payload: { rows: compareRatios(currentRatios, allRatios) } });
  }, [currentRatios, priceResults, dispatch]);

  // ── Derived data ───────────────────────────────────────────────────────
  const providers = useMemo(() => {
    const set = new Set(comparisonRows.map((r) => r.provider).filter(Boolean));
    return Array.from(set).sort();
  }, [comparisonRows]);

  const displayRows = useMemo(() => {
    let filtered = filterComparison(comparisonRows, filters);
    if (showOwnedOnly && ownedModels.size > 0) filtered = filtered.filter((r) => ownedModels.has(r.modelId));
    return sortComparison(filtered, sortBy, sortOrder);
  }, [comparisonRows, filters, sortBy, sortOrder, showOwnedOnly, ownedModels]);

  const handleQuickSelect = useCallback(
    (filter: 'all' | 'none' | 'decreased' | 'increased' | 'new') => {
      dispatch({ type: 'SET_SELECTED_MODELS', payload: selectByFilter(displayRows, filter) });
    }, [displayRows, dispatch],
  );

  const handleBatchApplySuggestions = useCallback(() => {
    if (selectedModelIds.size === 0) { message.warning('请先选择要应用建议的模型'); return; }
    const updatedRows = comparisonRows.map((row) =>
      selectedModelIds.has(row.modelId) && row.suggestedRatio !== undefined
        ? { ...row, newRatio: row.suggestedRatio, newCompletionRatio: row.suggestedCompletionRatio }
        : row,
    );
    dispatch({ type: 'SET_COMPARISON', payload: { rows: updatedRows } });
    message.success(`已为 ${selectedModelIds.size} 个模型应用建议倍率`);
  }, [selectedModelIds, comparisonRows, dispatch]);

  const selectedRows = useMemo(() => comparisonRows.filter((r) => selectedModelIds.has(r.modelId)), [comparisonRows, selectedModelIds]);
  const appliedCount = useMemo(() => selectedRows.filter((row) => row.suggestedRatio !== undefined && row.newRatio === row.suggestedRatio && row.newCompletionRatio === row.suggestedCompletionRatio).length, [selectedRows]);

  // ── Execute update ────────────────────────────────────────────────────
  const executeUpdate = useCallback(async () => {
    if (!settings || !currentRatios || selectedRows.length === 0) return;
    setUpdating(true); setPreviewVisible(false);
    dispatch({ type: 'SET_UPDATE_STATUS', payload: { status: 'updating' } });
    const payloads = buildUpdatePayload(currentRatios, selectedRows);
    const results: UpdateResult[] = [];
    try {
      for (const payload of payloads) {
        const resp = await proxyForward(settings, 'PUT', '/api/option/', payload);
        if (!resp.success) {
          for (const row of selectedRows) {
            if (!results.find((r) => r.modelId === row.modelId)) results.push({ modelId: row.modelId, success: false, error: resp.error });
          }
        }
      }
      if (results.length === 0) for (const row of selectedRows) results.push({ modelId: row.modelId, success: true });
      const logDetails: UpdateLogModelDetail[] = selectedRows.map((row) => ({
        modelId: row.modelId, pricingType: row.pricingType,
        oldModelRatio: row.currentRatio ?? 0, newModelRatio: row.newRatio ?? 0,
        oldCompletionRatio: row.currentCompletionRatio ?? 1, newCompletionRatio: row.newCompletionRatio ?? 1,
        oldPrice: row.pricingType === 'per_request' ? row.currentPrice : undefined,
        newPrice: row.pricingType === 'per_request' ? row.newPrice : undefined,
      }));
      try { await saveUpdateLog({ updatedAt: new Date().toISOString(), modelsUpdated: logDetails }); } catch { message.warning('更新日志保存失败，但倍率已更新'); }
      dispatch({ type: 'SET_UPDATE_STATUS', payload: { status: 'done', results } });
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;
      if (failCount === 0) message.success(`成功更新 ${successCount} 个模型的倍率`);
      else message.warning(`${successCount} 个成功，${failCount} 个失败`);
      setResultVisible(true);
      try {
        const refreshResp = await proxyForward<{ data: any }>(settings, 'GET', '/api/ratio_config');
        if (refreshResp.success && refreshResp.data) {
          const apiData = refreshResp.data.data || refreshResp.data;
          dispatch({ type: 'SET_RATIOS', payload: { data: { modelRatio: apiData.model_ratio || apiData.modelRatio || {}, completionRatio: apiData.completion_ratio || apiData.completionRatio || {}, modelPrice: apiData.model_price || apiData.modelPrice }, loading: false } });
        }
      } catch { /* non-critical */ }
    } catch (err: unknown) {
      message.error(`更新失败: ${err instanceof Error ? err.message : String(err)}`);
      dispatch({ type: 'SET_UPDATE_STATUS', payload: { status: 'error' } });
    } finally { setUpdating(false); }
  }, [settings, currentRatios, selectedRows, dispatch]);

  // ── Table columns ──────────────────────────────────────────────────────
  const columns: ColumnsType<ComparisonRow> = useMemo(() => [
    { title: '模型名称', dataIndex: 'modelId', sorter: true, ellipsis: true, width: 240 },
    { title: '厂商', dataIndex: 'provider', sorter: true, width: 120, render: (v: string) => v || '-' },
    { title: '计费类型', dataIndex: 'pricingType', width: 90, filters: [{ text: '按 Token', value: 'per_token' }, { text: '按次', value: 'per_request' }], onFilter: (value, record) => record.pricingType === value, render: (type?: string) => type === 'per_request' ? <Tag color="orange">按次</Tag> : <Tag color="blue">按 Token</Tag> },
    { title: '状态', dataIndex: 'status', width: 110, render: (status: ComparisonRow['status']) => <Tooltip title={STATUS_DESCRIPTION[status]}><Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag></Tooltip> },
    { title: '当前倍率', dataIndex: 'currentRatio', width: 110, render: (v: number | undefined, row: ComparisonRow) => row.pricingType === 'per_request' ? <span style={{ color: '#a1a1aa' }}>不适用</span> : v !== undefined ? v.toFixed(4) : '-' },
    { title: '新倍率', dataIndex: 'newRatio', width: 110, render: (v: number | undefined, row: ComparisonRow) => row.pricingType === 'per_request' ? <span style={{ color: '#a1a1aa' }}>不适用</span> : v !== undefined ? v.toFixed(4) : '-' },
    { title: '当前价格', dataIndex: 'currentPrice', width: 110, render: (v: number | undefined, row: ComparisonRow) => row.pricingType === 'per_request' && v !== undefined ? `$${v.toFixed(4)}/次` : <span style={{ color: '#a1a1aa' }}>—</span> },
    { title: '新价格', dataIndex: 'newPrice', width: 110, render: (v: number | undefined, row: ComparisonRow) => row.pricingType === 'per_request' && v !== undefined ? `$${v.toFixed(4)}/次` : <span style={{ color: '#a1a1aa' }}>—</span> },
    { title: '差异 %', dataIndex: 'ratioDiffPercent', sorter: true, width: 100, render: (v?: number) => { if (v === undefined || v === null) return '-'; const color = v > 0 ? '#ef4444' : v < 0 ? '#22c55e' : undefined; return <Text style={{ color }}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</Text>; } },
    { title: '当前补全倍率', dataIndex: 'currentCompletionRatio', width: 120, render: (v: number | undefined, row: ComparisonRow) => row.pricingType === 'per_request' ? <span style={{ color: '#a1a1aa' }}>不适用</span> : v !== undefined ? v.toFixed(4) : '-' },
    { title: '新补全倍率', dataIndex: 'newCompletionRatio', width: 120, render: (v: number | undefined, row: ComparisonRow) => row.pricingType === 'per_request' ? <span style={{ color: '#a1a1aa' }}>不适用</span> : v !== undefined ? v.toFixed(4) : '-' },
    {
      title: '操作', width: 100, fixed: 'right' as const,
      render: (_: unknown, row: ComparisonRow) => {
        const hasSuggestion = row.suggestedRatio !== undefined;
        const isApplied = row.newRatio === row.suggestedRatio && row.newCompletionRatio === row.suggestedCompletionRatio;
        if (!hasSuggestion) return null;
        return (
          <Button type="link" size="small" disabled={isApplied} onClick={() => {
            const updatedRows = comparisonRows.map((r) => r.modelId === row.modelId ? { ...r, newRatio: r.suggestedRatio, newCompletionRatio: r.suggestedCompletionRatio } : r);
            dispatch({ type: 'SET_COMPARISON', payload: { rows: updatedRows } });
          }}>{isApplied ? '已应用' : '应用建议'}</Button>
        );
      },
    },
  ], [comparisonRows, dispatch]);

  const rowSelection = { selectedRowKeys: Array.from(selectedModelIds), onChange: (keys: React.Key[]) => dispatch({ type: 'SET_SELECTED_MODELS', payload: new Set(keys as string[]) }) };

  // ── Guards ────────────────────────────────────────────────────────────
  if (!settings) return <Alert type="warning" showIcon message="请先配置 New API 连接" />;
  if (autoLoading || ratiosLoading || pricesLoading) return <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" tip="正在加载数据..." /></div>;
  if (!currentRatios || priceResults.length === 0) return <Alert type="info" showIcon message="数据不足" description="请先在「当前倍率」页面加载倍率数据，并在「抓取价格」页面获取上游价格后再进行对比。" />;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>对比与更新</Title>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="如何理解对比结果？" description={
        <div>
          <p style={{ marginBottom: 8 }}>系统会对比您当前的倍率配置和上游最新价格，给出调整建议：</p>
          <ul style={{ marginBottom: 8, paddingLeft: 20 }}>
            <li><Tag color="red">需要涨价</Tag> - 上游价格提高了，您需要提高倍率避免亏本</li>
            <li><Tag color="green">可以降价</Tag> - 上游价格降低了，您可以降低倍率以提高竞争力</li>
            <li><Tag color="blue">新模型</Tag> - 上游新增的模型，您还没有配置倍率</li>
            <li><Tag>无需调整</Tag> - 价格没有变化，无需调整</li>
          </ul>
          <p style={{ marginBottom: 0, color: '#3b82f6' }}>💡 <strong>批量操作提示：</strong>使用"仅选新模型"快速选择所有未配置的模型，然后点击"批量应用建议"一键设置倍率，最后点击"更新倍率"提交。</p>
        </div>
      } closable />

      <Space wrap style={{ marginBottom: 16 }}>
        <Select placeholder="按厂商筛选" allowClear style={{ width: 160 }} value={filters.provider} onChange={(v) => dispatch({ type: 'SET_FILTERS', payload: { ...filters, provider: v } })} options={providers.map((p) => ({ label: p, value: p }))} />
        <Select placeholder="按状态筛选" allowClear style={{ width: 140 }} value={filters.status} onChange={(v) => dispatch({ type: 'SET_FILTERS', payload: { ...filters, status: v } })} options={[{ label: '可以降价', value: 'decreased' }, { label: '需要涨价', value: 'increased' }, { label: '新模型', value: 'new' }, { label: '已下架', value: 'removed' }, { label: '无需调整', value: 'unchanged' }]} />
        <Space>
          <Switch checked={showOwnedOnly} onChange={setShowOwnedOnly} />
          <span style={{ fontSize: 14 }}>只看已拥有的模型</span>
          <Tooltip title="只显示在模型广场中启用的模型"><InfoCircleOutlined style={{ color: '#a1a1aa', cursor: 'help' }} /></Tooltip>
        </Space>
        <Text type="secondary">共 {displayRows.length} 条 / 已选 {selectedModelIds.size} 个{appliedCount > 0 && ` / 已应用建议 ${appliedCount} 个`}{showOwnedOnly && ownedModels.size > 0 && ` (已拥有 ${ownedModels.size} 个)`}</Text>
      </Space>

      <Space style={{ marginBottom: 16 }} wrap>
        <Space.Compact>
          <Button size="small" onClick={() => handleQuickSelect('all')}>全选</Button>
          <Button size="small" onClick={() => handleQuickSelect('none')}>全不选</Button>
        </Space.Compact>
        <Space.Compact>
          <Button size="small" type="dashed" onClick={() => handleQuickSelect('new')}>仅选新模型</Button>
          <Button size="small" type="dashed" onClick={() => handleQuickSelect('increased')}>仅选需涨价</Button>
          <Button size="small" type="dashed" onClick={() => handleQuickSelect('decreased')}>仅选可降价</Button>
        </Space.Compact>
        <Button type="default" size="small" disabled={selectedModelIds.size === 0} onClick={handleBatchApplySuggestions} icon={<CheckOutlined />}>批量应用建议</Button>
        <Button type="primary" disabled={selectedModelIds.size === 0 || updating} loading={updating} onClick={() => setPreviewVisible(true)}>更新选中 ({selectedModelIds.size})</Button>
      </Space>

      <Spin spinning={updating}>
        <Table<ComparisonRow> rowKey="modelId" columns={columns} dataSource={displayRows} rowSelection={rowSelection} rowClassName={rowClassName} pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }} size="middle" scroll={{ x: 1100 }}
          onChange={(_p, _f, sorter) => { if (!Array.isArray(sorter) && sorter.field) dispatch({ type: 'SET_SORT', payload: { sortBy: sorter.field as string, sortOrder: sorter.order === 'descend' ? 'desc' : 'asc' } }); }}
        />
      </Spin>

      <UpdatePreviewModal visible={previewVisible} onCancel={() => setPreviewVisible(false)} onOk={executeUpdate} updating={updating} selectedRows={selectedRows} />
      <UpdateResultModal visible={resultVisible} onClose={() => setResultVisible(false)} results={updateResults} />
      <style>{ROW_HIGHLIGHT_CSS}</style>
    </div>
  );
}