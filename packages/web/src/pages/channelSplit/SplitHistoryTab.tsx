import { useState, useCallback, useEffect } from 'react';
import { Button, Popconfirm, Space, Spin, Table, Tag, message } from 'antd';
import { ReloadOutlined, RollbackOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SplitHistoryEntry } from '@newapi-sync/shared';
import { getSplitHistory, rollbackSplit } from '../../api/client';

interface Props {
  connection: any;
}

export default function SplitHistoryTab({ connection }: Props) {
  const [history, setHistory] = useState<SplitHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getSplitHistory();
      if (resp.success && resp.data) setHistory(resp.data);
    } catch (err: unknown) {
      message.error(`加载历史失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleRollback = async (id: number) => {
    try {
      const resp = await rollbackSplit(connection, id);
      if (resp.success && resp.data) { message.success('回滚成功'); loadHistory(); }
    } catch (err: unknown) {
      message.error(`回滚失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const columns: ColumnsType<SplitHistoryEntry> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '拆分时间', dataIndex: 'splitAt', key: 'splitAt', width: 180 },
    { title: '父渠道', dataIndex: 'parentChannelName', key: 'parentChannelName' },
    { title: '子渠道数量', key: 'subChannelCount', width: 120, render: (_, r) => r.subChannelIds.length },
    { title: '父渠道操作', dataIndex: 'parentAction', key: 'parentAction', width: 120 },
    {
      title: '回滚状态', dataIndex: 'rollbackStatus', key: 'rollbackStatus', width: 120,
      render: (status?: string) => {
        if (!status) return <Tag>未回滚</Tag>;
        if (status === 'success') return <Tag color="success">已回滚</Tag>;
        if (status === 'partial') return <Tag color="warning">部分回滚</Tag>;
        return <Tag color="error">回滚失败</Tag>;
      },
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_, record) => (
        <Popconfirm title="确认回滚" description="这将删除所有子渠道并恢复父渠道状态" onConfirm={() => handleRollback(record.id!)} disabled={!!record.rollbackStatus}>
          <Button type="link" icon={<RollbackOutlined />} size="small" disabled={!!record.rollbackStatus}>回滚</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Button icon={<ReloadOutlined />} onClick={loadHistory}>刷新</Button>
        <Table columns={columns} dataSource={history} rowKey="id" pagination={{ pageSize: 20 }} />
      </Space>
    </Spin>
  );
}
