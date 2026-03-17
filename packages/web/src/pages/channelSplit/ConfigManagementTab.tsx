import { useState, useCallback, useEffect } from 'react';
import { Button, Popconfirm, Space, Spin, Table, Tag, message } from 'antd';
import { ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SplitConfiguration } from '@newapi-sync/shared';
import { getSplitConfigs, deleteSplitConfig } from '../../api/client';

export default function ConfigManagementTab() {
  const [configs, setConfigs] = useState<SplitConfiguration[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getSplitConfigs();
      if (resp.success && resp.data) setConfigs(resp.data);
    } catch (err: unknown) {
      message.error(`加载配置失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const handleDelete = async (id: number) => {
    try {
      await deleteSplitConfig(id);
      message.success('删除成功');
      loadConfigs();
    } catch (err: unknown) {
      message.error(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const columns: ColumnsType<SplitConfiguration> = [
    { title: '配置名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description' },
    { title: '命名模式', dataIndex: 'namingPattern', key: 'namingPattern' },
    { title: '父渠道操作', dataIndex: 'parentAction', key: 'parentAction', width: 120 },
    { title: '自动优先级', dataIndex: 'autoPriority', key: 'autoPriority', width: 120, render: (auto: boolean) => auto ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag> },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_, record) => (
        <Popconfirm title="确认删除" description="确定要删除这个配置吗？" onConfirm={() => handleDelete(record.id!)}>
          <Button type="link" danger icon={<DeleteOutlined />} size="small">删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Button icon={<ReloadOutlined />} onClick={loadConfigs}>刷新</Button>
        <Table columns={columns} dataSource={configs} rowKey="id" pagination={false} />
      </Space>
    </Spin>
  );
}
