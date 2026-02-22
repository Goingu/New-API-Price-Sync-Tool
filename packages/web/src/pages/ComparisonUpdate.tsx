import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  Switch,
  Tooltip,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ComparisonRow, UpdateLogEntry, UpdateLogModelDetail, UpdateResult, RatioConfig } from '@newapi-sync/shared';
import { useAppContext } from '../context/AppContext';
import { proxyForward, saveUpdateLog, fetchPrices } from '../api/client';
import { compareRatios } from '../utils/comparison';
import { sortComparison, filterComparison } from '../utils/sorting';
import { selectByFilter, buildUpdatePayload } from '../utils/updatePayload';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<ComparisonRow['status'], string> = {
  decreased: 'green',
  increased: 'red',
  new: 'blue',
  removed: 'default',
  unchanged: '',
};

const STATUS_LABEL: Record<ComparisonRow['status'], string> = {
  decreased: '可以降价',
  increased: '需要涨价',
  new: '新模型',
  removed: '已下架',
  unchanged: '无需调整',
};

const STATUS_DESCRIPTION: Record<ComparisonRow['status'], string> = {
  decreased: '上游价格降低了，您可以降低倍率以提高竞争力',
  increased: '上游价格提高了，您需要提高倍率避免亏本',
  new: '上游新增的模型，您还没有配置倍率',
  removed: '您配置了倍率，但上游已经下架',
  unchanged: '价格没有变化，无需调整',
};

function rowClassName(row: ComparisonRow): string {
  switch (row.status) {
    case 'decreased':
      return 'row-decreased';
    case 'increased':
      return 'row-increased';
    case 'new':
      return 'row-new';
    case 'removed':
      return 'row-removed';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ComparisonUpdate() {
  const { state, dispatch } = useAppContext();
  const { settings } = state.connection;
  const { data: currentRatios, loading: ratiosLoading } = state.currentRatios;
  const { results: priceResults, loading: pricesLoading } = state.upstreamPrices;
  const { rows: comparisonRows, filters, sortBy, sortOrder } = state.comparison;
  const { selectedModelIds, status: updateStatus, results: updateResults } = state.update;

  const [previewVisible, setPreviewVisible] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [ownedModels, setOwnedModels] = useState<Set<string>>(new Set());

  // Auto-load missing data on mount
  useEffect(() => {
    if (!settings) return;

    const loadMissingData = async () => {
      setAutoLoading(true);
      try {
        // Load ratios if missing
        if (!currentRatios && !ratiosLoading) {
          const resp = await proxyForward<{ data: any }>(settings, 'GET', '/api/ratio_config');
          if (resp.success && resp.data) {
            const apiData = resp.data.data || resp.data;
            const ratioConfig: RatioConfig = {
              modelRatio: apiData.model_ratio || apiData.modelRatio || {},
              completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
            };
            dispatch({ type: 'SET_RATIOS', payload: { data: ratioConfig, loading: false } });
          }
        }

        // Load prices if missing
        if (priceResults.length === 0 && !pricesLoading) {
          const resp = await fetchPrices(false);
          dispatch({
            type: 'SET_PRICES',
            payload: {
              results: resp.results,
              loading: false,
              lastFetchedAt: new Date().toISOString(),
              fromCache: resp.fromCache,
            },
          });
        }
      } catch (error) {
        console.error('Failed to auto-load data:', error);
      } finally {
        setAutoLoading(false);
      }
    };

    loadMissingData();
  }, []); // Only run once on mount

  // Fetch owned models when showOwnedOnly is enabled
  useEffect(() => {
    if (!settings || !showOwnedOnly || ownedModels.size > 0) return;

    const fetchOwnedModels = async () => {
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
      } catch (error) {
        console.error('Failed to fetch owned models:', error);
      }
    };

    fetchOwnedModels();
  }, [settings, showOwnedOnly, ownedModels.size]);

  // Build comparison rows when both data sources are available
  useEffect(() => {
    if (!currentRatios || priceResults.length === 0) return;
    // Flatten all upstream ratio results from provider price results
    const allRatios = priceResults
      .filter((r) => r.success)
      .flatMap((r) =>
        r.models.map((m) => ({
          modelId: m.modelId,
          provider: m.provider, // Preserve provider info
          modelRatio: m.inputPricePerMillion / 0.75,
          completionRatio:
            m.inputPricePerMillion > 0
              ? m.outputPricePerMillion / m.inputPricePerMillion
              : 1,
        })),
      );

    const rows = compareRatios(currentRatios, allRatios);
    dispatch({ type: 'SET_COMPARISON', payload: { rows } });
  }, [currentRatios, priceResults, dispatch]);

  // Derive unique providers for filter dropdown
  const providers = useMemo(() => {
    const set = new Set(comparisonRows.map((r) => r.provider).filter(Boolean));
    return Array.from(set).sort();
  }, [comparisonRows]);

  // Apply filters and sorting
  const displayRows = useMemo(() => {
    let filtered = filterComparison(comparisonRows, filters);

    // Filter by owned models if enabled
    if (showOwnedOnly && ownedModels.size > 0) {
      filtered = filtered.filter((r) => ownedModels.has(r.modelId));
    }

    return sortComparison(filtered, sortBy, sortOrder);
  }, [comparisonRows, filters, sortBy, sortOrder, showOwnedOnly, ownedModels]);

  // Selection helpers
  const handleQuickSelect = useCallback(
    (filter: 'all' | 'none' | 'decreased' | 'increased' | 'new') => {
      const ids = selectByFilter(displayRows, filter);
      dispatch({ type: 'SET_SELECTED_MODELS', payload: ids });
    },
    [displayRows, dispatch],
  );

  // Batch apply suggestions
  const handleBatchApplySuggestions = useCallback(() => {
    if (selectedModelIds.size === 0) {
      message.warning('请先选择要应用建议的模型');
      return;
    }

    // Apply suggested ratios to selected rows
    const updatedRows = comparisonRows.map((row) => {
      if (selectedModelIds.has(row.modelId) && row.suggestedRatio !== undefined) {
        return {
          ...row,
          newRatio: row.suggestedRatio,
          newCompletionRatio: row.suggestedCompletionRatio,
        };
      }
      return row;
    });

    dispatch({ type: 'SET_COMPARISON', payload: { rows: updatedRows } });
    message.success(`已为 ${selectedModelIds.size} 个模型应用建议倍率`);
  }, [selectedModelIds, comparisonRows, dispatch]);

  const selectedRows = useMemo(
    () => comparisonRows.filter((r) => selectedModelIds.has(r.modelId)),
    [comparisonRows, selectedModelIds],
  );

  // Count how many selected models have suggestions applied
  const appliedCount = useMemo(() => {
    return selectedRows.filter(
      (row) =>
        row.suggestedRatio !== undefined &&
        row.newRatio === row.suggestedRatio &&
        row.newCompletionRatio === row.suggestedCompletionRatio
    ).length;
  }, [selectedRows]);

  // ---------------------------------------------------------------------------
  // Execute update
  // ---------------------------------------------------------------------------

  const executeUpdate = useCallback(async () => {
    if (!settings || !currentRatios || selectedRows.length === 0) return;

    setUpdating(true);
    setPreviewVisible(false);
    dispatch({ type: 'SET_UPDATE_STATUS', payload: { status: 'updating' } });

    const payloads = buildUpdatePayload(currentRatios, selectedRows);
    const results: UpdateResult[] = [];

    try {
      for (const payload of payloads) {
        const resp = await proxyForward(settings, 'PUT', '/api/option/', payload);
        if (!resp.success) {
          // Mark all selected models as failed for this key
          for (const row of selectedRows) {
            if (!results.find((r) => r.modelId === row.modelId)) {
              results.push({ modelId: row.modelId, success: false, error: resp.error });
            }
          }
        }
      }

      // If no failures recorded, mark all as success
      if (results.length === 0) {
        for (const row of selectedRows) {
          results.push({ modelId: row.modelId, success: true });
        }
      }

      // Save update log
      const logDetails: UpdateLogModelDetail[] = selectedRows.map((row) => ({
        modelId: row.modelId,
        oldModelRatio: row.currentRatio ?? 0,
        newModelRatio: row.newRatio ?? 0,
        oldCompletionRatio: row.currentCompletionRatio ?? 1,
        newCompletionRatio: row.newCompletionRatio ?? 1,
      }));

      const logEntry: UpdateLogEntry = {
        updatedAt: new Date().toISOString(),
        modelsUpdated: logDetails,
      };

      try {
        await saveUpdateLog(logEntry);
      } catch {
        message.warning('更新日志保存失败，但倍率已更新');
      }

      dispatch({
        type: 'SET_UPDATE_STATUS',
        payload: { status: 'done', results },
      });

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;
      if (failCount === 0) {
        message.success(`成功更新 ${successCount} 个模型的倍率`);
      } else {
        message.warning(`${successCount} 个成功，${failCount} 个失败`);
      }

      setResultVisible(true);

      // Refresh current ratios after update (Req 6.6)
      try {
        const refreshResp = await proxyForward<{ data: any }>(
          settings, 'GET', '/api/ratio_config',
        );
        if (refreshResp.success && refreshResp.data) {
          const apiData = refreshResp.data.data || refreshResp.data;
          const ratioConfig: RatioConfig = {
            modelRatio: apiData.model_ratio || apiData.modelRatio || {},
            completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
          };
          dispatch({ type: 'SET_RATIOS', payload: { data: ratioConfig, loading: false } });
        }
      } catch {
        // non-critical
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`更新失败: ${msg}`);
      dispatch({ type: 'SET_UPDATE_STATUS', payload: { status: 'error' } });
    } finally {
      setUpdating(false);
    }
  }, [settings, currentRatios, selectedRows, dispatch]);

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const columns: ColumnsType<ComparisonRow> = [
    {
      title: '模型名称',
      dataIndex: 'modelId',
      sorter: true,
      ellipsis: true,
      width: 240,
    },
    {
      title: '厂商',
      dataIndex: 'provider',
      sorter: true,
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: ComparisonRow['status']) => (
        <Tooltip title={STATUS_DESCRIPTION[status]}>
          <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '当前倍率',
      dataIndex: 'currentRatio',
      width: 110,
      render: (v?: number) => (v !== undefined ? v.toFixed(4) : '-'),
    },
    {
      title: '新倍率',
      dataIndex: 'newRatio',
      width: 110,
      render: (v?: number) => (v !== undefined ? v.toFixed(4) : '-'),
    },
    {
      title: '差异 %',
      dataIndex: 'ratioDiffPercent',
      sorter: true,
      width: 100,
      render: (v?: number) => {
        if (v === undefined || v === null) return '-';
        const color = v > 0 ? '#f5222d' : v < 0 ? '#52c41a' : undefined;
        return <Text style={{ color }}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</Text>;
      },
    },
    {
      title: '绝对差值',
      width: 100,
      render: (_: unknown, row: ComparisonRow) => {
        if (row.currentRatio === undefined || row.newRatio === undefined) return '-';
        return Math.abs(row.newRatio - row.currentRatio).toFixed(4);
      },
    },
    {
      title: '当前补全倍率',
      dataIndex: 'currentCompletionRatio',
      width: 120,
      render: (v?: number) => (v !== undefined ? v.toFixed(4) : '-'),
    },
    {
      title: '新补全倍率',
      dataIndex: 'newCompletionRatio',
      width: 120,
      render: (v?: number) => (v !== undefined ? v.toFixed(4) : '-'),
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right',
      render: (_: unknown, row: ComparisonRow) => {
        const hasSuggestion = row.suggestedRatio !== undefined;
        const isApplied = row.newRatio === row.suggestedRatio &&
                          row.newCompletionRatio === row.suggestedCompletionRatio;

        if (!hasSuggestion) return null;

        return (
          <Button
            type="link"
            size="small"
            disabled={isApplied}
            onClick={() => {
              const updatedRows = comparisonRows.map((r) =>
                r.modelId === row.modelId
                  ? {
                      ...r,
                      newRatio: r.suggestedRatio,
                      newCompletionRatio: r.suggestedCompletionRatio,
                    }
                  : r
              );
              dispatch({ type: 'SET_COMPARISON', payload: { rows: updatedRows } });
            }}
          >
            {isApplied ? '已应用' : '应用建议'}
          </Button>
        );
      },
    },
  ];

  // ---------------------------------------------------------------------------
  // Row selection config
  // ---------------------------------------------------------------------------

  const rowSelection = {
    selectedRowKeys: Array.from(selectedModelIds),
    onChange: (keys: React.Key[]) => {
      dispatch({ type: 'SET_SELECTED_MODELS', payload: new Set(keys as string[]) });
    },
  };

  // ---------------------------------------------------------------------------
  // Guard: need both data sources
  // ---------------------------------------------------------------------------

  if (!settings) {
    return <Alert type="warning" showIcon message="请先配置 New API 连接" />;
  }

  if (autoLoading || ratiosLoading || pricesLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size="large" tip="正在加载数据..." />
      </div>
    );
  }

  if (!currentRatios || priceResults.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="数据不足"
        description="请先在「当前倍率」页面加载倍率数据，并在「抓取价格」页面获取上游价格后再进行对比。"
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>对比与更新</Title>

      {/* Help card */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="如何理解对比结果？"
        description={
          <div>
            <p style={{ marginBottom: 8 }}>系统会对比您当前的倍率配置和上游最新价格，给出调整建议：</p>
            <ul style={{ marginBottom: 8, paddingLeft: 20 }}>
              <li><Tag color="red">需要涨价</Tag> - 上游价格提高了，您需要提高倍率避免亏本</li>
              <li><Tag color="green">可以降价</Tag> - 上游价格降低了，您可以降低倍率以提高竞争力</li>
              <li><Tag color="blue">新模型</Tag> - 上游新增的模型，您还没有配置倍率</li>
              <li><Tag>无需调整</Tag> - 价格没有变化，无需调整</li>
            </ul>
            <p style={{ marginBottom: 0, color: '#1890ff' }}>
              💡 <strong>批量操作提示：</strong>
              使用"仅选新模型"快速选择所有未配置的模型，然后点击"批量应用建议"一键设置倍率，最后点击"更新倍率"提交。
            </p>
          </div>
        }
        closable
      />

      {/* Filters */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="按厂商筛选"
          allowClear
          style={{ width: 160 }}
          value={filters.provider}
          onChange={(v) =>
            dispatch({ type: 'SET_FILTERS', payload: { ...filters, provider: v } })
          }
          options={providers.map((p) => ({ label: p, value: p }))}
        />
        <Select
          placeholder="按状态筛选"
          allowClear
          style={{ width: 140 }}
          value={filters.status}
          onChange={(v) =>
            dispatch({ type: 'SET_FILTERS', payload: { ...filters, status: v } })
          }
          options={[
            { label: '可以降价', value: 'decreased' },
            { label: '需要涨价', value: 'increased' },
            { label: '新模型', value: 'new' },
            { label: '已下架', value: 'removed' },
            { label: '无需调整', value: 'unchanged' },
          ]}
        />
        <Space>
          <Switch
            checked={showOwnedOnly}
            onChange={setShowOwnedOnly}
          />
          <span style={{ fontSize: 14 }}>只看已拥有的模型</span>
          <Tooltip title="只显示在模型广场中启用的模型">
            <InfoCircleOutlined style={{ color: '#999', cursor: 'help' }} />
          </Tooltip>
        </Space>
        <Text type="secondary">
          共 {displayRows.length} 条 / 已选 {selectedModelIds.size} 个
          {appliedCount > 0 && ` / 已应用建议 ${appliedCount} 个`}
          {showOwnedOnly && ownedModels.size > 0 && ` (已拥有 ${ownedModels.size} 个)`}
        </Text>
      </Space>

      {/* Quick selection actions */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Space.Compact>
          <Button size="small" onClick={() => handleQuickSelect('all')}>全选</Button>
          <Button size="small" onClick={() => handleQuickSelect('none')}>全不选</Button>
        </Space.Compact>
        <Space.Compact>
          <Button size="small" type="dashed" onClick={() => handleQuickSelect('new')}>
            仅选新模型
          </Button>
          <Button size="small" type="dashed" onClick={() => handleQuickSelect('increased')}>
            仅选需涨价
          </Button>
          <Button size="small" type="dashed" onClick={() => handleQuickSelect('decreased')}>
            仅选可降价
          </Button>
        </Space.Compact>
        <Button
          type="default"
          size="small"
          disabled={selectedModelIds.size === 0}
          onClick={handleBatchApplySuggestions}
          icon={<CheckOutlined />}
        >
          批量应用建议
        </Button>
        <Button
          type="primary"
          disabled={selectedModelIds.size === 0 || updating}
          loading={updating}
          onClick={() => setPreviewVisible(true)}
        >
          更新选中 ({selectedModelIds.size})
        </Button>
      </Space>

      {/* Comparison table */}
      <Spin spinning={updating}>
        <Table<ComparisonRow>
          rowKey="modelId"
          columns={columns}
          dataSource={displayRows}
          rowSelection={rowSelection}
          rowClassName={rowClassName}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          size="middle"
          scroll={{ x: 1100 }}
          onChange={(_pagination, _filters, sorter) => {
            if (!Array.isArray(sorter) && sorter.field) {
              dispatch({
                type: 'SET_SORT',
                payload: {
                  sortBy: sorter.field as string,
                  sortOrder: sorter.order === 'descend' ? 'desc' : 'asc',
                },
              });
            }
          }}
        />
      </Spin>

      {/* Update preview modal */}
      <Modal
        title="更新预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        onOk={executeUpdate}
        okText="确认执行"
        cancelText="取消"
        confirmLoading={updating}
        width={700}
      >
        <p>
          即将更新 <Text strong>{selectedRows.length}</Text> 个模型的倍率：
        </p>
        <Table<ComparisonRow>
          rowKey="modelId"
          dataSource={selectedRows}
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
          columns={[
            { title: '模型', dataIndex: 'modelId', ellipsis: true },
            {
              title: '当前倍率 → 新倍率',
              render: (_: unknown, r: ComparisonRow) =>
                `${r.currentRatio?.toFixed(4) ?? 'N/A'} → ${r.newRatio?.toFixed(4) ?? 'N/A'}`,
            },
            {
              title: '补全倍率',
              render: (_: unknown, r: ComparisonRow) =>
                `${r.currentCompletionRatio?.toFixed(4) ?? 'N/A'} → ${r.newCompletionRatio?.toFixed(4) ?? 'N/A'}`,
            },
          ]}
        />
      </Modal>

      {/* Update results modal */}
      <Modal
        title="更新结果"
        open={resultVisible}
        onCancel={() => setResultVisible(false)}
        footer={[
          <Button key="close" onClick={() => setResultVisible(false)}>关闭</Button>,
        ]}
        width={600}
      >
        {updateResults && (
          <>
            <Space style={{ marginBottom: 12 }}>
              <Tag icon={<CheckOutlined />} color="success">
                成功: {updateResults.filter((r) => r.success).length}
              </Tag>
              <Tag icon={<CloseOutlined />} color="error">
                失败: {updateResults.filter((r) => !r.success).length}
              </Tag>
            </Space>
            <Table<UpdateResult>
              rowKey="modelId"
              dataSource={updateResults}
              size="small"
              pagination={false}
              scroll={{ y: 400 }}
              columns={[
                { title: '模型', dataIndex: 'modelId', ellipsis: true },
                {
                  title: '状态',
                  dataIndex: 'success',
                  width: 80,
                  render: (ok: boolean) =>
                    ok ? (
                      <Tag color="success">成功</Tag>
                    ) : (
                      <Tag color="error">失败</Tag>
                    ),
                },
                {
                  title: '错误信息',
                  dataIndex: 'error',
                  ellipsis: true,
                  render: (v?: string) => v ?? '-',
                },
              ]}
            />
          </>
        )}
      </Modal>

      {/* Inline CSS for row highlighting */}
      <style>{`
        .row-decreased { background-color: #f6ffed !important; }
        .row-increased { background-color: #fff2f0 !important; }
        .row-new { background-color: #e6f4ff !important; }
        .row-removed { background-color: #fafafa !important; color: #999; }
        .row-decreased:hover td, .row-increased:hover td,
        .row-new:hover td, .row-removed:hover td {
          background: inherit !important;
        }
      `}</style>
    </div>
  );
}
