import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Space, Switch, Table, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ChannelSource } from '@newapi-sync/shared';
import {
  getChannelSources,
  addChannelSource,
  updateChannelSource,
  deleteChannelSource,
} from '../api/client';

export default function ChannelSourcesPage() {
  const [sources, setSources] = useState<ChannelSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSource, setEditingSource] = useState<ChannelSource | null>(null);
  const [form] = Form.useForm();

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const resp = await getChannelSources();
      if (resp.success) {
        setSources(resp.sources);
      } else {
        setError('获取渠道源失败');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleAdd = () => {
    setEditingSource(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setModalVisible(true);
  };

  const handleEdit = (source: ChannelSource) => {
    setEditingSource(source);
    form.setFieldsValue(source);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个渠道源吗？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteChannelSource(id);
          message.success('删除成功');
          fetchSources();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          message.error(`删除失败: ${msg}`);
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingSource) {
        await updateChannelSource(editingSource.id!, values);
        message.success('更新成功');
      } else {
        await addChannelSource(values);
        message.success('添加成功');
      }
      setModalVisible(false);
      fetchSources();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`操作失败: ${msg}`);
    }
  };

  const columns: ColumnsType<ChannelSource> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
    },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      key: 'apiKey',
      render: (key: string) => `${key.slice(0, 8)}...${key.slice(-4)}`,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <span style={{ color: enabled ? '#52c41a' : '#999' }}>
          {enabled ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: ChannelSource) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id!)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>渠道源管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchSources} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加渠道源
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="加载失败"
          description={error}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={fetchSources}>
              重试
            </Button>
          }
        />
      )}

      <Table<ChannelSource>
        columns={columns}
        dataSource={sources}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal
        title={editingSource ? '编辑渠道源' : '添加渠道源'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="例如：主渠道" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[
              { required: true, message: '请输入 URL' },
              { type: 'url', message: '请输入有效的 URL' },
            ]}
          >
            <Input placeholder="https://api.example.com" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Form.Item
            name="userId"
            label="用户 ID"
            tooltip="部分 New API 实例需要提供用户 ID"
          >
            <Input placeholder="例如：1" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
