import { useState, useEffect, useCallback } from 'react';
import { Button, Space, message, Tag, Switch, Alert, Spin, Table, Tooltip, Typography } from 'antd';
import { CalculatorOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../../context/AppContext';
import { calculatePriority, applyPriority, getAutoMode, setAutoMode } from '../../api/client';
import type { ChannelPriorityResult, PriorityCalculationResult, ApplyResult } from '@newapi-sync/shared';

const { Text } = Typography;

export default function PriorityCalculationTab() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [autoMode, setAutoModeState] = useState(false);
  const [autoModeLoading, setAutoModeLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PriorityCalculationResult | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [failedChanges, setFailedChanges] = useState<ChannelPriorityResult[]>([]);

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
    { title: '渠道名称', dataIndex: 'channelName', key: 'channelName', width: 180, ellipsis: true },
    { title: '旧优先级', dataIndex: 'oldPriority', key: 'oldPriority', width: 100, align: 'center' },
    { title: '新优先级', dataIndex: 'newPriority', key: 'newPriority', width: 100, align: 'center' },
    {
      title: '变化', key: 'change', width: 100, align: 'center',
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size="middle">
          <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalculate} loading={calculating} disabled={applying}>
            计算优先级
          </Button>
          <Space>
            <Text>自动模式</Text>
            <Tooltip title="开启后，计算优先级时将跳过预览直接应用变更到您的实例">
              <InfoCircleOutlined style={{ color: '#a1a1aa', cursor: 'help' }} />
            </Tooltip>
            <Switch checked={autoMode} onChange={handleAutoModeChange} loading={autoModeLoading} />
          </Space>
        </Space>
        {autoMode && <Text type="secondary">自动模式已开启：计算后将直接应用变更，跳过预览</Text>}
      </div>

      {(calculating || applying) && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin tip={calculating ? '正在计算优先级...' : '正在应用变更...'}>
            <div style={{ padding: 24 }} />
          </Spin>
        </div>
      )}

      {applyResult && !preview && !calculating && !applying && (
        <div style={{ marginBottom: 16 }}>
          <Alert
            type={applyResult.totalFailed === 0 ? 'success' : 'warning'}
            message={
              applyResult.totalFailed === 0
                ? `应用完成：${applyResult.totalSuccess} 个渠道优先级已更新`
                : `部分完成：${applyResult.totalSuccess} 个成功，${applyResult.totalFailed} 个失败`
            }
            showIcon closable
            onClose={() => { setApplyResult(null); setFailedChanges([]); }}
            action={
              failedChanges.length > 0 ? (
                <Button size="small" type="primary" danger onClick={handleRetryFailed} loading={applying}>重试失败项</Button>
              ) : undefined
            }
          />
        </div>
      )}

      {preview && !calculating && !applying && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Alert type="info" message={`计算完成：共 ${preview.totalChannels} 个渠道，${preview.changedChannels} 个需要变更，${preview.skippedChannels} 个未配置费率已跳过`} showIcon />
          </div>
          <Table<ChannelPriorityResult>
            columns={previewColumns} dataSource={preview.channels} rowKey="channelId" size="middle" pagination={false}
            rowClassName={(record) => {
              const diff = record.newPriority - record.oldPriority;
              if (diff > 0) return 'priority-row-up';
              if (diff < 0) return 'priority-row-down';
              return 'priority-row-same';
            }}
            scroll={{ x: 700 }}
          />
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <Button type="primary" onClick={handleConfirm} loading={applying} disabled={preview.changedChannels === 0}>确认应用</Button>
            <Button onClick={handleCancel}>取消</Button>
          </div>
        </div>
      )}

      {!preview && !applyResult && !calculating && !applying && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Text type="secondary">点击「计算优先级」按钮开始计算渠道优先级排序</Text>
        </div>
      )}
    </div>
  );
}
