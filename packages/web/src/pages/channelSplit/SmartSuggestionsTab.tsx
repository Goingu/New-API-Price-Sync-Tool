import { useState, useCallback, useEffect } from 'react';
import { Alert, Button, Empty, Space, Spin, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SplitSuggestion } from '@newapi-sync/shared';
import { getSplitSuggestions } from '../../api/client';

interface Props {
  connection: any;
}

export default function SmartSuggestionsTab({ connection }: Props) {
  const [suggestions, setSuggestions] = useState<SplitSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getSplitSuggestions(connection);
      if (resp.success && resp.data) setSuggestions(resp.data);
    } catch (err: unknown) {
      message.error(`加载建议失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setLoading(false); }
  }, [connection]);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  const columns: ColumnsType<SplitSuggestion> = [
    { title: '渠道名称', dataIndex: 'channelName', key: 'channelName' },
    { title: '模型数量', dataIndex: 'modelCount', key: 'modelCount', width: 100 },
    { title: '预计成本节省', dataIndex: 'estimatedCostSaving', key: 'estimatedCostSaving', width: 150, render: (s: number) => `${(s * 100).toFixed(1)}%` },
    {
      title: '优先级', dataIndex: 'priority', key: 'priority', width: 100,
      render: (p: string) => <Tag color={p === 'high' ? 'red' : p === 'medium' ? 'orange' : 'blue'}>{p}</Tag>,
    },
    { title: '原因', dataIndex: 'reason', key: 'reason' },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert message="智能建议" description="系统根据价格数据分析，识别出以下渠道适合拆分以优化成本" type="info" showIcon />
        <Button icon={<ReloadOutlined />} onClick={loadSuggestions}>刷新</Button>
        {suggestions.length === 0 ? <Empty description="暂无拆分建议" /> : <Table columns={columns} dataSource={suggestions} rowKey="channelId" pagination={false} />}
      </Space>
    </Spin>
  );
}
