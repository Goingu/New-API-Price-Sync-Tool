import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Tabs, Typography, Table, InputNumber, Button, Space, message, Tag, Switch, Alert, Spin, Select, Empty, Descriptions, Input, Statistic, Row, Col } from 'antd';
import {
  CalculatorOutlined,
  BarChartOutlined,
  SettingOutlined,
  FileTextOutlined,
  ReloadOutlined,
  ShopOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../context/AppContext';
import { getChannelSources, getChannelSourcePriceRates, fetchChannels, calculatePriority, applyPriority, getAutoMode, setAutoMode, proxyForward, getRule, setRule, getScheduleConfig, setScheduleConfig, getScheduleStatus, getAdjustmentLogs, getAdjustmentLogById } from '../api/client';
import type { Channel, ChannelSource, ChannelSourcePriceRateConfig, ChannelPriorityResult, PriorityCalculationResult, ApplyResult, RatioConfig, PriorityRule, PriorityScheduleConfig, SchedulerStatus, PriorityAdjustmentLog } from '@newapi-sync/shared';

const { Title, Text } = Typography;

// Channel type label mapping (common New API channel types)
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

function normalizeBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalizePath = (path: string): string => {
    let normalized = path.replace(/\/+$/, '');
    normalized = normalized.replace(/\/v1$/i, '');
    normalized = normalized.replace(/\/api$/i, '');
    return normalized;
  };

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.host.toLowerCase();
    const pathname = normalizePath(parsed.pathname);
    return `${protocol}//${host}${pathname}`;
  } catch {
    return normalizePath(trimmed.toLowerCase());
  }
}

function getChannelBaseUrl(channel: Channel): string | null {
  if (channel.base_url?.trim()) return channel.base_url.trim();
  if (channel.key?.trim() && /^https?:\/\//i.test(channel.key)) return channel.key.trim();
  return null;
}

function buildChannelRateMap(
  channels: Channel[],
  sources: ChannelSource[],
  sourceRates: ChannelSourcePriceRateConfig[],
): Map<number, number> {
  const sourceById = new Map<number, ChannelSource>();
  for (const source of sources) {
    if (source.id != null) {
      sourceById.set(source.id, source);
    }
  }

  const rateByBaseUrl = new Map<string, number>();
  for (const rate of sourceRates) {
    const source = sourceById.get(rate.sourceId);
    if (!source) continue;
    const normalized = normalizeBaseUrl(source.baseUrl);
    if (!normalized) continue;
    rateByBaseUrl.set(normalized, rate.priceRate);
  }

  const channelRateMap = new Map<number, number>();
  for (const channel of channels) {
    const channelBaseUrl = normalizeBaseUrl(getChannelBaseUrl(channel) ?? undefined);
    if (!channelBaseUrl) continue;
    const priceRate = rateByBaseUrl.get(channelBaseUrl);
    if (priceRate != null) {
      channelRateMap.set(channel.id, priceRate);
    }
  }

  return channelRateMap;
}

function PriorityCalculationTab() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [autoMode, setAutoModeState] = useState(false);
  const [autoModeLoading, setAutoModeLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PriorityCalculationResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [failedChanges, setFailedChanges] = useState<ChannelPriorityResult[]>([]);

  // Load Auto_Mode state on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await getAutoMode();
        if (!cancelled && resp.success) {
          setAutoModeState(resp.data.enabled);
        }
      } catch {
        // silently ignore — switch defaults to off
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAutoModeChange = useCallback(async (checked: boolean) => {
    setAutoModeLoading(true);
    try {
      await setAutoMode(checked);
      setAutoModeState(checked);
      message.success(`自动模式已${checked ? '开启' : '关闭'}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`切换自动模式失败: ${msg}`);
    } finally {
      setAutoModeLoading(false);
    }
  }, []);

  const handleCalculate = useCallback(async () => {
    if (!connection) return;
    setCalculating(true);
    setPreview(null);
    setApplyResult(null);
    setFailedChanges([]);
    try {
      const resp = await calculatePriority(connection);
      if (!resp.success) {
        message.error('计算失败');
        return;
      }
      const result = resp.data;

      if (autoMode) {
        // Auto_Mode ON: skip preview, apply directly
        const changedChannels = result.channels.filter((c) => c.changed);
        if (changedChannels.length === 0) {
          message.info('所有渠道优先级无变化，无需更新');
          return;
        }
        setApplying(true);
        try {
          const applyResp = await applyPriority(connection, changedChannels);
          if (applyResp.success) {
            const r = applyResp.data;
            setApplyResult(r);
            if (r.totalFailed === 0) {
              message.success(`自动应用完成：${r.totalSuccess} 个渠道优先级已更新`);
            } else {
              message.warning(`部分应用完成：${r.totalSuccess} 成功，${r.totalFailed} 失败`);
              const failedIds = new Set(r.results.filter((x) => !x.success).map((x) => x.channelId));
              setFailedChanges(changedChannels.filter((c) => failedIds.has(c.channelId)));
            }
          }
        } finally {
          setApplying(false);
        }
      } else {
        // Auto_Mode OFF: show preview
        setPreview(result);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`计算失败: ${msg}`);
    } finally {
      setCalculating(false);
    }
  }, [connection, autoMode]);

  const handleConfirm = useCallback(async () => {
    if (!connection || !preview) return;
    const changedChannels = preview.channels.filter((c) => c.changed);
    if (changedChannels.length === 0) {
      message.info('无需更新');
      setPreview(null);
      return;
    }
    setApplying(true);
    try {
      const resp = await applyPriority(connection, changedChannels);
      if (resp.success) {
        const r = resp.data;
        setApplyResult(r);
        setPreview(null);
        if (r.totalFailed === 0) {
          message.success(`应用完成：${r.totalSuccess} 个渠道优先级已更新`);
        } else {
          message.warning(`部分应用完成：${r.totalSuccess} 成功，${r.totalFailed} 失败`);
          const failedIds = new Set(r.results.filter((x) => !x.success).map((x) => x.channelId));
          setFailedChanges(changedChannels.filter((c) => failedIds.has(c.channelId)));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`应用失败: ${msg}`);
    } finally {
      setApplying(false);
    }
  }, [connection, preview]);

  const handleCancel = useCallback(() => {
    setPreview(null);
  }, []);

  const handleRetryFailed = useCallback(async () => {
    if (!connection || failedChanges.length === 0) return;
    setApplying(true);
    try {
      const resp = await applyPriority(connection, failedChanges);
      if (resp.success) {
        const r = resp.data;
        setApplyResult(r);
        if (r.totalFailed === 0) {
          message.success(`重试成功，${r.totalSuccess} 个渠道已更新`);
          setFailedChanges([]);
        } else {
          message.warning(`重试部分成功，${r.totalSuccess} 成功，${r.totalFailed} 失败`);
          const failedIds = new Set(r.results.filter((x) => !x.success).map((x) => x.channelId));
          setFailedChanges(failedChanges.filter((c) => failedIds.has(c.channelId)));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`重试失败: ${msg}`);
    } finally {
      setApplying(false);
    }
  }, [connection, failedChanges]);

  const previewColumns: ColumnsType<ChannelPriorityResult> = [
    {
      title: '渠道名称',
      dataIndex: 'channelName',
      key: 'channelName',
      width: 180,
      ellipsis: true,
    },
    {
      title: '旧优先级',
      dataIndex: 'oldPriority',
      key: 'oldPriority',
      width: 100,
      align: 'center',
    },
    {
      title: '新优先级',
      dataIndex: 'newPriority',
      key: 'newPriority',
      width: 100,
      align: 'center',
    },
    {
      title: '变化',
      key: 'change',
      width: 100,
      align: 'center',
      render: (_: unknown, record: ChannelPriorityResult) => {
        const diff = record.newPriority - record.oldPriority;
        if (diff > 0) return <Tag color="green">↑+{diff}</Tag>;
        if (diff < 0) return <Tag color="red">↓{diff}</Tag>;
        return <Tag color="default">不变</Tag>;
      },
    },
  ];

  if (!connection) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Text type="warning">请先在设置页面配置 New API 连接信息</Text>
      </div>
    );
  }

  return (
    <div>
      {/* Control row: Calculate button + Auto_Mode switch */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size="middle">
          <Button
            type="primary"
            icon={<CalculatorOutlined />}
            onClick={handleCalculate}
            loading={calculating}
            disabled={applying}
          >
            计算优先级
          </Button>
          <Space>
            <Text>自动模式</Text>
            <Switch
              checked={autoMode}
              onChange={handleAutoModeChange}
              loading={autoModeLoading}
            />
          </Space>
        </Space>
        {autoMode && (
          <Text type="secondary">自动模式已开启：计算后将直接应用变更，跳过预览</Text>
        )}
      </div>

      {/* Loading indicator */}
      {(calculating || applying) && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin tip={calculating ? '正在计算优先级...' : '正在应用变更...'}>
            <div style={{ padding: 24 }} />
          </Spin>
        </div>
      )}

      {/* Apply result summary */}
      {applyResult && !preview && !calculating && !applying && (
        <div style={{ marginBottom: 16 }}>
          <Alert
            type={applyResult.totalFailed === 0 ? 'success' : 'warning'}
            message={
              applyResult.totalFailed === 0
                ? `应用完成：${applyResult.totalSuccess} 个渠道优先级已更新`
                : `部分完成：${applyResult.totalSuccess} 个成功，${applyResult.totalFailed} 个失败`
            }
            showIcon
            closable
            onClose={() => { setApplyResult(null); setFailedChanges([]); }}
            action={
              failedChanges.length > 0 ? (
                <Button size="small" type="primary" danger onClick={handleRetryFailed} loading={applying}>
                  重试失败项
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Preview table (Auto_Mode OFF) */}
      {preview && !calculating && !applying && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Alert
              type="info"
              message={`计算完成：共 ${preview.totalChannels} 个渠道，${preview.changedChannels} 个需要变更，${preview.skippedChannels} 个未配置费率已跳过`}
              showIcon
            />
          </div>
          <Table<ChannelPriorityResult>
            columns={previewColumns}
            dataSource={preview.channels}
            rowKey="channelId"
            size="middle"
            pagination={false}
            rowClassName={(record) => {
              const diff = record.newPriority - record.oldPriority;
              if (diff > 0) return 'priority-row-up';
              if (diff < 0) return 'priority-row-down';
              return 'priority-row-same';
            }}
            scroll={{ x: 700 }}
          />
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <Button
              type="primary"
              onClick={handleConfirm}
              loading={applying}
              disabled={preview.changedChannels === 0}
            >
              确认应用
            </Button>
            <Button onClick={handleCancel}>取消</Button>
          </div>
        </div>
      )}

      {/* Empty state when nothing is happening */}
      {!preview && !applyResult && !calculating && !applying && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Text type="secondary">点击「计算优先级」按钮开始计算渠道优先级排序</Text>
        </div>
      )}
    </div>
  );
}

/** 渠道对比 Tab — Task 11.4 */
function ChannelComparisonTab() {
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
      // Fetch channels, price rates, and ratio config in parallel
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
        const mappedRates = buildChannelRateMap(
          fetchedChannels,
          sourcesResp.sources,
          sourceRatesResp.data,
        );
        setChannelPriceRates(mappedRates);
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build model list from all channels
  const modelList = useMemo(() => {
    const modelSet = new Set<string>();
    for (const ch of channels) {
      if (!ch.models) continue;
      const models = ch.models.split(',').map((m) => m.trim()).filter(Boolean);
      for (const m of models) {
        modelSet.add(m);
      }
    }
    return Array.from(modelSet).sort();
  }, [channels]);

  // Auto-select first model if none selected
  useEffect(() => {
    if (!selectedModel && modelList.length > 0) {
      setSelectedModel(modelList[0]);
    }
  }, [modelList, selectedModel]);

  // Build comparison data for the selected model
  interface ComparisonRow {
    key: string;
    channelId: number;
    channelName: string;
    modelRatio: number | null;
    priceRate: number | null;
    effectiveUnitCost: number | null;
  }

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

      rows.push({
        key: String(ch.id),
        channelId: ch.id,
        channelName: ch.name,
        modelRatio,
        priceRate,
        effectiveUnitCost,
      });
    }

    // Sort: channels with cost first (ascending), then channels without cost
    rows.sort((a, b) => {
      if (a.effectiveUnitCost != null && b.effectiveUnitCost != null) {
        return a.effectiveUnitCost - b.effectiveUnitCost;
      }
      if (a.effectiveUnitCost != null) return -1;
      if (b.effectiveUnitCost != null) return 1;
      return 0;
    });

    return rows;
  }, [selectedModel, ratioConfig, channels, channelPriceRates]);

  // Find the minimum effective unit cost for highlighting
  const minCost = useMemo(() => {
    const costs = comparisonData
      .map((r) => r.effectiveUnitCost)
      .filter((c): c is number => c != null);
    return costs.length > 0 ? Math.min(...costs) : null;
  }, [comparisonData]);

  if (!connection) {
    return (
      <Alert
        type="warning"
        showIcon
        message="未配置连接"
        description="请先在连接设置中配置 New API 实例地址和 API Key"
        style={{ margin: 24 }}
      />
    );
  }

  const columns: ColumnsType<ComparisonRow> = [
    {
      title: '渠道名称',
      dataIndex: 'channelName',
      key: 'channelName',
      render: (name: string, record) => {
        const isCheapest = minCost != null && record.effectiveUnitCost === minCost;
        return (
          <Space>
            <span>{name}</span>
            {isCheapest && <Tag color="green">最优</Tag>}
          </Space>
        );
      },
    },
    {
      title: '模型倍率 (Model Ratio)',
      dataIndex: 'modelRatio',
      key: 'modelRatio',
      align: 'right',
      render: (v: number | null) => (v != null ? v.toFixed(4) : <Text type="secondary">—</Text>),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space>
          <Text strong>选择模型：</Text>
          <Select
            showSearch
            placeholder="请选择模型"
            value={selectedModel}
            onChange={setSelectedModel}
            style={{ minWidth: 320 }}
            options={modelList.map((m) => ({ label: m, value: m }))}
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
            }
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
        </Space>

        {comparisonData.length > 0 ? (
          <Table<ComparisonRow>
            columns={columns}
            dataSource={comparisonData}
            pagination={false}
            size="middle"
            rowClassName={(record) =>
              minCost != null && record.effectiveUnitCost === minCost
                ? 'ant-table-row-cheapest'
                : ''
            }
          />
        ) : (
          <Empty description={selectedModel ? '该模型没有可用渠道' : '请选择一个模型'} />
        )}
      </Space>
    </Spin>
  );
}

/** 规则与调度 Tab — Task 11.5 */
function RulesScheduleTab() {
  const [rule, setRuleState] = useState<PriorityRule>({ startValue: 100, step: 10 });
  const [scheduleConfig, setScheduleConfigState] = useState<PriorityScheduleConfig>({ enabled: false, frequency: '1h' });
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loadingRule, setLoadingRule] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadingRule(true);
    setLoadingSchedule(true);
    setLoadingStatus(true);
    try {
      const [ruleRes, schedRes, statusRes] = await Promise.all([
        getRule(),
        getScheduleConfig(),
        getScheduleStatus(),
      ]);
      if (ruleRes.data) setRuleState(ruleRes.data);
      if (schedRes.data) setScheduleConfigState(schedRes.data);
      if (statusRes.data) setStatus(statusRes.data);
    } catch {
      message.error('加载规则与调度配置失败');
    } finally {
      setLoadingRule(false);
      setLoadingSchedule(false);
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSaveRule = async () => {
    setSavingRule(true);
    try {
      await setRule(rule);
      message.success('优先级规则已保存');
    } catch {
      message.error('保存优先级规则失败');
    } finally {
      setSavingRule(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      await setScheduleConfig(scheduleConfig);
      message.success('定时调度配置已保存');
      // Refresh status after config change
      try {
        const statusRes = await getScheduleStatus();
        if (statusRes.data) setStatus(statusRes.data);
      } catch { /* ignore */ }
    } catch {
      message.error('保存定时调度配置失败');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleRefreshStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await getScheduleStatus();
      if (res.data) setStatus(res.data);
    } catch {
      message.error('刷新调度状态失败');
    } finally {
      setLoadingStatus(false);
    }
  };

  const frequencyOptions = [
    { value: '1h', label: '每小时' },
    { value: '6h', label: '每6小时' },
    { value: '12h', label: '每12小时' },
    { value: '24h', label: '每天' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="优先级规则" size="small" loading={loadingRule}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Text>起始值：</Text>
            <InputNumber
              min={1}
              value={rule.startValue}
              onChange={(v) => v != null && setRuleState((prev) => ({ ...prev, startValue: v }))}
            />
          </Space>
          <Space>
            <Text>步长：</Text>
            <InputNumber
              min={1}
              value={rule.step}
              onChange={(v) => v != null && setRuleState((prev) => ({ ...prev, step: v }))}
            />
          </Space>
          <Text type="secondary">
            排序第一的渠道优先级为 {rule.startValue}，第二为 {Math.max(rule.startValue - rule.step, 1)}，依次递减（最小值为 1）
          </Text>
          <Button type="primary" onClick={handleSaveRule} loading={savingRule}>
            保存规则
          </Button>
        </Space>
      </Card>

      <Card title="定时调度" size="small" loading={loadingSchedule}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Text>启用定时调度：</Text>
            <Switch
              checked={scheduleConfig.enabled}
              onChange={(checked) => setScheduleConfigState((prev) => ({ ...prev, enabled: checked }))}
            />
          </Space>
          <Space>
            <Text>调度频率：</Text>
            <Select
              value={scheduleConfig.frequency}
              onChange={(v) => setScheduleConfigState((prev) => ({ ...prev, frequency: v }))}
              options={frequencyOptions}
              style={{ width: 140 }}
              disabled={!scheduleConfig.enabled}
            />
          </Space>
          <Button type="primary" onClick={handleSaveSchedule} loading={savingSchedule}>
            保存配置
          </Button>

          <Descriptions
            title={
              <Space>
                <Text strong>调度状态</Text>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleRefreshStatus}
                  loading={loadingStatus}
                />
              </Space>
            }
            bordered
            size="small"
            column={1}
          >
            <Descriptions.Item label="上次执行时间">
              {status?.lastRunAt ?? '暂无'}
            </Descriptions.Item>
            <Descriptions.Item label="执行结果">
              {status?.lastRunResult ?? '暂无'}
            </Descriptions.Item>
            <Descriptions.Item label="下次计划时间">
              {status?.nextRunAt ?? '暂无'}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>
    </div>
  );
}

/** 调整日志 Tab — Task 11.6 */
function AdjustmentLogsTab() {
  const [logs, setLogs] = useState<PriorityAdjustmentLog[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdjustmentLogs(50);
      if (res.data) setLogs(res.data);
    } catch {
      message.error('加载调整日志失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const detailColumns: ColumnsType<ChannelPriorityResult> = [
    {
      title: '渠道名称',
      dataIndex: 'channelName',
      key: 'channelName',
    },
    {
      title: '旧优先级',
      dataIndex: 'oldPriority',
      key: 'oldPriority',
    },
    {
      title: '新优先级',
      dataIndex: 'newPriority',
      key: 'newPriority',
      render: (val: number, record: ChannelPriorityResult) => {
        if (val > record.oldPriority) return <Tag color="green">{val} ↑</Tag>;
        if (val < record.oldPriority) return <Tag color="red">{val} ↓</Tag>;
        return <Tag>{val}</Tag>;
      },
    },
    {
      title: 'Channel_Price_Rate',
      dataIndex: 'priceRate',
      key: 'priceRate',
      render: (val: number) => val?.toFixed(4) ?? '-',
    },
  ];

  const columns: ColumnsType<PriorityAdjustmentLog> = [
    {
      title: '调整时间',
      dataIndex: 'adjustedAt',
      key: 'adjustedAt',
      render: (val: string) => new Date(val).toLocaleString(),
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.adjustedAt).getTime() - new Date(b.adjustedAt).getTime(),
    },
    {
      title: '触发方式',
      dataIndex: 'triggerType',
      key: 'triggerType',
      render: (val: string) => (
        <Tag color={val === 'manual' ? 'blue' : 'purple'}>
          {val === 'manual' ? '手动' : '定时'}
        </Tag>
      ),
    },
    {
      title: '是否有变更',
      dataIndex: 'hasChanges',
      key: 'hasChanges',
      render: (val: boolean) => (
        <Tag color={val ? 'green' : 'default'}>
          {val ? '有变更' : '无变更'}
        </Tag>
      ),
    },
    {
      title: '变更渠道数',
      key: 'changedCount',
      render: (_: unknown, record: PriorityAdjustmentLog) =>
        record.details?.filter((d) => d.changed).length ?? 0,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button icon={<ReloadOutlined />} onClick={loadLogs} loading={loading}>
          刷新
        </Button>
      </div>
      <Table<PriorityAdjustmentLog>
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (record) => (
            <Table<ChannelPriorityResult>
              columns={detailColumns}
              dataSource={record.details ?? []}
              rowKey="channelId"
              pagination={false}
              size="small"
            />
          ),
        }}
        locale={{ emptyText: <Empty description="暂无调整日志" /> }}
      />
    </div>
  );
}

/** 渠道商管理 Tab */
function ChannelSourceManagementTab() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [sources, setSources] = useState<ChannelSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  const loadData = useCallback(async () => {
    if (!connection) return;
    setLoading(true);
    try {
      const [channelResp, sourcesResp] = await Promise.all([
        fetchChannels(connection),
        getChannelSources(),
      ]);
      if (channelResp.success && channelResp.data) {
        setChannels(channelResp.data);
      }
      if (sourcesResp.success) {
        setSources(sourcesResp.sources);
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

  // Group channels by source (base_url matching)
  interface SourceGroup {
    key: string;
    sourceName: string;
    baseUrl: string;
    channelCount: number;
    modelCount: number;
    models: string[];
    channels: Channel[];
    isOwnInstance?: boolean;
  }

  const sourceGroups = useMemo((): SourceGroup[] => {
    // Build a map: normalized base_url -> source info
    const sourceByUrl = new Map<string, ChannelSource>();
    for (const source of sources) {
      const normalized = normalizeBaseUrl(source.baseUrl);
      if (normalized) {
        sourceByUrl.set(normalized, source);
      }
    }

    // Group channels by normalized base_url
    const groups = new Map<string, { source: ChannelSource | null; channels: Channel[] }>();

    for (const ch of channels) {
      const rawUrl = ch.base_url?.trim() || (ch.key?.trim() && /^https?:\/\//i.test(ch.key) ? ch.key.trim() : null);
      const normalized = normalizeBaseUrl(rawUrl ?? undefined);
      const groupKey = normalized || `__type_${ch.type}`;

      if (!groups.has(groupKey)) {
        const matchedSource = normalized ? sourceByUrl.get(normalized) ?? null : null;
        groups.set(groupKey, { source: matchedSource, channels: [] });
      }
      groups.get(groupKey)!.channels.push(ch);
    }

    // Convert to array
    const result: SourceGroup[] = [];
    for (const [key, { source, channels: groupChannels }] of groups) {
      const modelSet = new Set<string>();
      for (const ch of groupChannels) {
        if (!ch.models) continue;
        ch.models.split(',').map((m) => m.trim()).filter(Boolean).forEach((m) => modelSet.add(m));
      }
      const models = Array.from(modelSet).sort();

      result.push({
        key,
        sourceName: source?.name ?? groupChannels[0]?.name ?? key,
        baseUrl: source?.baseUrl ?? key,
        channelCount: groupChannels.length,
        modelCount: models.length,
        models,
        channels: groupChannels,
        isOwnInstance: source?.isOwnInstance,
      });
    }

    // Sort by model count descending
    result.sort((a, b) => b.modelCount - a.modelCount);
    return result;
  }, [channels, sources]);

  // Filter
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return sourceGroups;
    const q = search.toLowerCase();
    return sourceGroups.filter(
      (g) =>
        g.sourceName.toLowerCase().includes(q) ||
        g.baseUrl.toLowerCase().includes(q) ||
        g.models.some((m) => m.toLowerCase().includes(q)),
    );
  }, [sourceGroups, search]);

  // Stats
  const totalModels = useMemo(() => {
    const allModels = new Set<string>();
    sourceGroups.forEach((g) => g.models.forEach((m) => allModels.add(m)));
    return allModels.size;
  }, [sourceGroups]);

  const groupColumns: ColumnsType<SourceGroup> = [
    {
      title: '渠道商名称',
      dataIndex: 'sourceName',
      key: 'sourceName',
      width: 200,
      render: (name: string, record) => (
        <Space>
          <Text strong>{name}</Text>
          {record.isOwnInstance && <Tag color="blue">自有实例</Tag>}
        </Space>
      ),
    },
    {
      title: 'Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
      render: (url: string) =>
        url.startsWith('__type_') ? <Text type="secondary">未知</Text> : url,
    },
    {
      title: '渠道数',
      dataIndex: 'channelCount',
      key: 'channelCount',
      width: 100,
      sorter: (a, b) => a.channelCount - b.channelCount,
    },
    {
      title: '模型数',
      dataIndex: 'modelCount',
      key: 'modelCount',
      width: 100,
      sorter: (a, b) => a.modelCount - b.modelCount,
      defaultSortOrder: 'descend',
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
  ];

  if (!connection) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Text type="warning">请先在设置页面配置 New API 连接信息</Text>
      </div>
    );
  }

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Row gutter={16}>
          <Col span={8}>
            <Card size="small"><Statistic title="渠道商数量" value={sourceGroups.length} /></Card>
          </Col>
          <Col span={8}>
            <Card size="small"><Statistic title="渠道总数" value={channels.length} /></Card>
          </Col>
          <Col span={8}>
            <Card size="small"><Statistic title="模型总数（去重）" value={totalModels} /></Card>
          </Col>
        </Row>

        <Space>
          <Input
            placeholder="搜索渠道商名称、URL 或模型名"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 360 }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
        </Space>

        <Table<SourceGroup>
          columns={groupColumns}
          dataSource={filteredGroups}
          rowKey="key"
          size="middle"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 个渠道商` }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as React.Key[]),
            expandedRowRender: (record) => (
              <div style={{ padding: '8px 0' }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  渠道列表（{record.channelCount} 个）
                </Text>
                <Table<Channel>
                  columns={[
                    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
                    { title: '渠道名称', dataIndex: 'name', key: 'name', width: 200 },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      key: 'status',
                      width: 80,
                      render: (s: number) =>
                        s === 1 ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>,
                    },
                    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80 },
                    {
                      title: '模型数',
                      key: 'modelCount',
                      width: 80,
                      render: (_: unknown, ch: Channel) =>
                        ch.models?.split(',').filter(Boolean).length ?? 0,
                    },
                  ]}
                  dataSource={record.channels}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
                <Text strong style={{ display: 'block', margin: '16px 0 8px' }}>
                  支持的模型（{record.modelCount} 个）
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {record.models.map((m) => (
                    <Tag key={m}>{m}</Tag>
                  ))}
                </div>
              </div>
            ),
          }}
        />
      </Space>
    </Spin>
  );
}

const tabItems = [
  {
    key: 'source-management',
    label: '渠道商管理',
    icon: <ShopOutlined />,
    children: <ChannelSourceManagementTab />,
  },
  {
    key: 'priority-calc',
    label: '优先级计算',
    icon: <CalculatorOutlined />,
    children: <PriorityCalculationTab />,
  },
  {
    key: 'channel-compare',
    label: '渠道对比',
    icon: <BarChartOutlined />,
    children: <ChannelComparisonTab />,
  },
  {
    key: 'rules-schedule',
    label: '规则与调度',
    icon: <SettingOutlined />,
    children: <RulesScheduleTab />,
  },
  {
    key: 'adjustment-logs',
    label: '调整日志',
    icon: <FileTextOutlined />,
    children: <AdjustmentLogsTab />,
  },
];

export default function ChannelPriority() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        渠道优先级管理
      </Title>
      <Card bordered={false}>
        <Tabs
          defaultActiveKey="source-management"
          items={tabItems.map((item) => ({
            ...item,
            label: (
              <span>
                {item.icon} {item.label}
              </span>
            ),
          }))}
        />
      </Card>
    </div>
  );
}
