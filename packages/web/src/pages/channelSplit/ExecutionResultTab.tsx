import { useState, useEffect } from 'react';
import { Alert, Button, Card, Empty, Progress, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { SplitExecutionResult } from '@newapi-sync/shared';
import { useAppContext } from '../../context/AppContext';
import { executeSplit } from '../../api/client';
import type { SplitExecution } from './types';

const { Text } = Typography;

interface Props {
  execution: SplitExecution | null;
}

export default function ExecutionResultTab({ execution }: Props) {
  const [result, setResult] = useState<SplitExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });
  const { state } = useAppContext();
  const connection = state.connection.settings;

  useEffect(() => {
    if (!execution || !connection) return;
    const run = async () => {
      setLoading(true);
      const totalSub = execution.preview.totalSubChannels;
      const totalParent = execution.preview.parentChannels.length;
      const total = totalSub + totalParent;
      setProgress({ current: 0, total, phase: '创建子渠道' });
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev.current >= total - 1) return prev;
          const next = prev.current + 1;
          return { ...prev, current: next, phase: next <= totalSub ? '创建子渠道' : '处理父渠道' };
        });
      }, 800);
      try {
        const resp = await executeSplit(connection, execution.preview, execution.options);
        clearInterval(interval);
        setProgress({ current: total, total, phase: '完成' });
        if (resp.success && resp.data) {
          setResult(resp.data);
          message[resp.data.success ? 'success' : 'warning'](resp.data.success ? '拆分操作完成' : '拆分操作部分成功');
        }
      } catch (err: unknown) {
        clearInterval(interval);
        message.error(`执行拆分失败: ${err instanceof Error ? err.message : String(err)}`);
      } finally { setLoading(false); }
    };
    run();
  }, [execution, connection]);

  if (loading) {
    const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
        <div style={{ marginTop: 24, maxWidth: 400, margin: '24px auto 0' }}>
          <Progress percent={percent} status="active" />
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{progress.phase}（{progress.current}/{progress.total}）</Text>
        </div>
      </div>
    );
  }
  if (!result) return <Empty description="暂无执行结果" />;

  const statusIcon = (success: boolean) => success
    ? <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 20 }} />
    : <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 20 }} />;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert message={result.success ? '拆分成功' : '拆分部分成功'} description={`成功: ${result.totalSuccess} 个，失败: ${result.totalFailed} 个`} type={result.success ? 'success' : 'warning'} showIcon />
      <Card title="子渠道创建结果" size="small">
        <Table columns={[
          { title: '状态', key: 'status', width: 80, render: (_: unknown, r: any) => statusIcon(r.success) },
          { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
          { title: '名称', dataIndex: 'name', key: 'name' },
          { title: '模型', dataIndex: 'modelId', key: 'modelId' },
          { title: '错误信息', dataIndex: 'error', key: 'error', render: (e?: string) => e || '-' },
        ]} dataSource={result.createdSubChannels} rowKey="id" pagination={false} />
      </Card>
      {result.priorityUpdateResults && result.priorityUpdateResults.length > 0 && (
        <Card title="优先级更新结果" size="small">
          <Text>成功更新 {result.priorityUpdateResults.filter((r: any) => r.success).length} 个渠道的优先级</Text>
        </Card>
      )}
      <Card title="父渠道处理结果" size="small">
        <Table columns={[
          { title: '状态', key: 'status', width: 80, render: (_: unknown, r: any) => statusIcon(r.success) },
          { title: '渠道 ID', dataIndex: 'channelId', key: 'channelId', width: 100 },
          { title: '操作', dataIndex: 'action', key: 'action', width: 100 },
          { title: '错误信息', dataIndex: 'error', key: 'error', render: (e?: string) => e || '-' },
        ]} dataSource={result.parentChannelResults} rowKey="channelId" pagination={false} />
      </Card>
    </Space>
  );
}
