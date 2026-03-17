import { useState, useEffect, useCallback } from 'react';
import { Button, Table, Tag, Empty, message, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getAdjustmentLogs } from '../../api/client';
import type { ChannelPriorityResult, PriorityAdjustmentLog } from '@newapi-sync/shared';

export default function AdjustmentLogsTab() {
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
    { title: '渠道名称', dataIndex: 'channelName', key: 'channelName' },
    { title: '旧优先级', dataIndex: 'oldPriority', key: 'oldPriority' },
    {
      title: '新优先级', dataIndex: 'newPriority', key: 'newPriority',
      render: (val: number, record: ChannelPriorityResult) => {
        if (val > record.oldPriority) return <Tag color="green">{val} ↑</Tag>;
        if (val < record.oldPriority) return <Tag color="red">{val} ↓</Tag>;
        return <Tag>{val}</Tag>;
      },
    },
    {
      title: 'Channel_Price_Rate', dataIndex: 'priceRate', key: 'priceRate',
      render: (val: number) => val?.toFixed(4) ?? '-',
    },
  ];

  const columns: ColumnsType<PriorityAdjustmentLog> = [
    {
      title: '调整时间', dataIndex: 'adjustedAt', key: 'adjustedAt',
      render: (val: string) => new Date(val).toLocaleString(),
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.adjustedAt).getTime() - new Date(b.adjustedAt).getTime(),
    },
    {
      title: '触发方式', dataIndex: 'triggerType', key: 'triggerType',
      render: (val: string) => (
        <Tag color={val === 'manual' ? 'blue' : 'purple'}>
          {val === 'manual' ? '手动' : '定时'}
        </Tag>
      ),
    },
    {
      title: '是否有变更', dataIndex: 'hasChanges', key: 'hasChanges',
      render: (val: boolean) => <Tag color={val ? 'green' : 'default'}>{val ? '有变更' : '无变更'}</Tag>,
    },
    {
      title: '变更渠道数', key: 'changedCount',
      render: (_: unknown, record: PriorityAdjustmentLog) => record.details?.filter((d) => d.changed).length ?? 0,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button icon={<ReloadOutlined />} onClick={loadLogs} loading={loading}>刷新</Button>
      </div>
      <Table<PriorityAdjustmentLog>
        columns={columns} dataSource={logs} rowKey="id" loading={loading}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (record) => (
            <Table<ChannelPriorityResult>
              columns={detailColumns} dataSource={record.details ?? []}
              rowKey="channelId" pagination={false} size="small"
            />
          ),
        }}
        locale={{ emptyText: <Empty description="暂无调整日志" /> }}
      />
    </div>
  );
}
