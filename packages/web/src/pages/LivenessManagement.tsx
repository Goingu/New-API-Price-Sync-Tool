import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type {
  LivenessConfig,
  LivenessResult,
  HealthStatus,
  CheckFrequency,
} from '@newapi-sync/shared';
import {
  getLivenessConfigs,
  addLivenessConfig,
  updateLivenessConfig,
  deleteLivenessConfig,
  checkModel,
  checkAllModels,
  checkAllConfigs,
  getLivenessResults,
  getLatestLivenessResults,
} from '../api/client';

const { Title, Text } = Typography;
const { TextArea } = Input;

const FREQUENCY_OPTIONS: { label: string; value: CheckFrequency }[] = [
  { label: '每 30 分钟', value: '30m' },
  { label: '每小时', value: '1h' },
  { label: '每 6 小时', value: '6h' },
  { label: '每天', value: '24h' },
];

const STATUS_TAG: Record<HealthStatus, { color: string; label: string }> = {
  online: { color: 'green', label: '在线' },
  offline: { color: 'red', label: '离线' },
  slow: { color: 'orange', label: '响应慢' },
};

/** Config row enriched with latest results */
interface ConfigRow extends LivenessConfig {
  latestResults?: LivenessResult[];
}

export default function LivenessManagement() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [historyMap, setHistoryMap] = useState<Record<number, LivenessResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<LivenessConfig | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Check execution loading
  const [checkLoading, setCheckLoading] = useState<Record<string, boolean>>({});

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const resp = await getLivenessConfigs();
      const list: LivenessConfig[] = resp.data ?? [];

      const withResults = await Promise.all(
        list.map(async (c) => {
          try {
            const lr = await getLatestLivenessResults(c.id!);
            return { ...c, latestResults: lr.data ?? [] } as ConfigRow;
          } catch {
            return { ...c, latestResults: [] } as ConfigRow;
          }
        }),
      );
      setConfigs(withResults);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // -----------------------------------------------------------------------
  // Expand: load history records for a config
  // -----------------------------------------------------------------------

  const loadHistory = useCallback(async (configId: number) => {
    try {
      const resp = await getLivenessResults({ configId, limit: 50 });
      setHistoryMap((prev) => ({ ...prev, [configId]: resp.data ?? [] }));
    } catch {
      // silently ignore
    }
  }, []);

  // -----------------------------------------------------------------------
  // Add / Edit
  // -----------------------------------------------------------------------

  const openAddModal = () => {
    setEditingConfig(null);
    form.resetFields();
    form.setFieldsValue({ frequency: '1h', enabled: true });
    setModalOpen(true);
  };

  const openEditModal = (config: LivenessConfig) => {
    setEditingConfig(config);
    form.setFieldsValue({
      name: config.name,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      models: config.models.join('\n'),
      frequency: config.frequency,
      enabled: config.enabled,
    });
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const modelsStr: string = values.models ?? '';
      const models = modelsStr
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);

      const payload = {
        name: values.name,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        models,
        frequency: values.frequency,
        enabled: values.enabled ?? true,
      };

      if (editingConfig) {
        await updateLivenessConfig(editingConfig.id!, payload);
        message.success('检测配置已更新');
      } else {
        await addLivenessConfig(payload);
        message.success('检测配置已添加');
      }
      setModalOpen(false);
      loadConfigs();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  const handleDelete = async (id: number) => {
    try {
      await deleteLivenessConfig(id);
      message.success('检测配置已删除');
      loadConfigs();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // -----------------------------------------------------------------------
  // Toggle enabled
  // -----------------------------------------------------------------------

  const handleToggleEnabled = async (config: LivenessConfig, enabled: boolean) => {
    try {
      await updateLivenessConfig(config.id!, { enabled });
      setConfigs((prev) =>
        prev.map((c) => (c.id === config.id ? { ...c, enabled } : c)),
      );
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  // -----------------------------------------------------------------------
  // Check execution
  // -----------------------------------------------------------------------

  const handleCheckModel = async (configId: number, modelId: string) => {
    const key = `${configId}:${modelId}`;
    setCheckLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const resp = await checkModel(configId, modelId);
      const result = resp.data;
      if (result?.status === 'online') {
        message.success(`${modelId}: 在线 (${result.responseTimeMs}ms)`);
      } else if (result?.status === 'slow') {
        message.warning(`${modelId}: 响应慢 (${result.responseTimeMs}ms)`);
      } else {
        message.error(`${modelId}: 离线 — ${result?.error ?? '未知错误'}`);
      }
      loadConfigs();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '检测请求失败');
    } finally {
      setCheckLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCheckAllModels = async (configId: number) => {
    const key = `config:${configId}`;
    setCheckLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const resp = await checkAllModels(configId);
      const results = resp.data ?? [];
      const online = results.filter((r) => r.status === 'online').length;
      const offline = results.filter((r) => r.status === 'offline').length;
      const slow = results.filter((r) => r.status === 'slow').length;
      message.info(`检测完成: ${online} 在线, ${slow} 响应慢, ${offline} 离线`);
      loadConfigs();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '批量检测失败');
    } finally {
      setCheckLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleCheckAll = async () => {
    setCheckLoading((prev) => ({ ...prev, all: true }));
    try {
      const resp = await checkAllConfigs();
      const results = resp.data ?? [];
      const online = results.filter((r) => r.status === 'online').length;
      const offline = results.filter((r) => r.status === 'offline').length;
      const slow = results.filter((r) => r.status === 'slow').length;
      message.info(`全部检测完成: ${online} 在线, ${slow} 响应慢, ${offline} 离线`);
      loadConfigs();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '全部检测失败');
    } finally {
      setCheckLoading((prev) => ({ ...prev, all: false }));
    }
  };

  // -----------------------------------------------------------------------
  // Table columns — main config table
  // -----------------------------------------------------------------------

  const columns: ColumnsType<ConfigRow> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
    },
    {
      title: '实例地址',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
    },
    {
      title: '模型数量',
      key: 'modelCount',
      width: 100,
      render: (_: unknown, record: ConfigRow) => record.models?.length ?? 0,
    },
    {
      title: '检测频率',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 120,
      render: (v: CheckFrequency) =>
        FREQUENCY_OPTIONS.find((o) => o.value === v)?.label ?? v,
    },
    {
      title: '启用状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          onChange={(val) => handleToggleEnabled(record, val)}
          size="small"
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_: unknown, record: ConfigRow) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该检测配置？"
            onConfirm={() => handleDelete(record.id!)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={!!checkLoading[`config:${record.id}`]}
            onClick={() => handleCheckAllModels(record.id!)}
          >
            检测全部
          </Button>
        </Space>
      ),
    },
  ];

  // -----------------------------------------------------------------------
  // Expanded row: model health status + history
  // -----------------------------------------------------------------------

  const expandedRowRender = (record: ConfigRow) => {
    const results = record.latestResults ?? [];

    // Build a row per model in the config
    const modelRows = record.models.map((modelId) => {
      const result = results.find((r) => r.modelId === modelId);
      return { modelId, result };
    });

    const modelColumns: ColumnsType<{ modelId: string; result?: LivenessResult }> = [
      {
        title: '模型名',
        dataIndex: 'modelId',
        key: 'modelId',
        width: 200,
      },
      {
        title: '状态',
        key: 'status',
        width: 100,
        render: (_: unknown, row) => {
          if (!row.result) return <Tag>未检测</Tag>;
          const info = STATUS_TAG[row.result.status];
          return <Tag color={info.color}>{info.label}</Tag>;
        },
      },
      {
        title: '响应时间',
        key: 'responseTime',
        width: 120,
        render: (_: unknown, row) =>
          row.result?.responseTimeMs != null ? `${row.result.responseTimeMs}ms` : '-',
      },
      {
        title: '最后检测时间',
        key: 'checkedAt',
        width: 180,
        render: (_: unknown, row) =>
          row.result?.checkedAt
            ? new Date(row.result.checkedAt).toLocaleString()
            : '-',
      },
      {
        title: '错误信息',
        key: 'error',
        render: (_: unknown, row) =>
          row.result?.error ? <Text type="danger">{row.result.error}</Text> : '-',
      },
      {
        title: '操作',
        key: 'actions',
        width: 100,
        render: (_: unknown, row) => (
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={!!checkLoading[`${record.id}:${row.modelId}`]}
            onClick={() => handleCheckModel(record.id!, row.modelId)}
          >
            检测
          </Button>
        ),
      },
    ];

    // History section
    const history = historyMap[record.id!];

    return (
      <div>
        <Table
          columns={modelColumns}
          dataSource={modelRows}
          rowKey="modelId"
          size="small"
          pagination={false}
          style={{ marginBottom: 16 }}
        />

        {history === undefined ? (
          <Button
            size="small"
            onClick={() => loadHistory(record.id!)}
          >
            加载历史检测记录
          </Button>
        ) : history.length === 0 ? (
          <Text type="secondary">暂无历史检测记录</Text>
        ) : (
          <>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              历史检测记录（最近 50 条）
            </Text>
            <Table
              columns={[
                {
                  title: '模型',
                  dataIndex: 'modelId',
                  key: 'modelId',
                  width: 200,
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  key: 'status',
                  width: 100,
                  render: (s: HealthStatus) => {
                    const info = STATUS_TAG[s];
                    return <Tag color={info.color}>{info.label}</Tag>;
                  },
                },
                {
                  title: '响应时间',
                  dataIndex: 'responseTimeMs',
                  key: 'responseTimeMs',
                  width: 120,
                  render: (v?: number) => (v != null ? `${v}ms` : '-'),
                },
                {
                  title: '检测时间',
                  dataIndex: 'checkedAt',
                  key: 'checkedAt',
                  width: 180,
                  render: (v: string) => new Date(v).toLocaleString(),
                },
                {
                  title: '错误信息',
                  dataIndex: 'error',
                  key: 'error',
                  render: (v?: string) =>
                    v ? <Text type="danger">{v}</Text> : '-',
                },
              ]}
              dataSource={history}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10, size: 'small' }}
            />
          </>
        )}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        模型活性检测
      </Title>

      {/* Action bar */}
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
          添加检测配置
        </Button>
        <Button
          icon={<ThunderboltOutlined />}
          loading={!!checkLoading['all']}
          onClick={handleCheckAll}
        >
          全部检测
        </Button>
      </Space>

      {/* Error */}
      {error && (
        <Alert
          type="error"
          showIcon
          message="加载失败"
          description={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(undefined)}
        />
      )}

      {/* Main table */}
      <Table<ConfigRow>
        columns={columns}
        dataSource={configs}
        rowKey="id"
        loading={loading}
        expandable={{
          expandedRowRender,
          onExpand: (expanded, record) => {
            if (expanded && record.id != null && historyMap[record.id] === undefined) {
              // Don't auto-load history; user clicks button
            }
          },
        }}
        pagination={false}
      />

      {/* Add / Edit Modal */}
      <Modal
        title={editingConfig ? '编辑检测配置' : '添加检测配置'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="例如：主站模型检测" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="实例地址"
            rules={[
              { required: true, message: '请输入实例地址' },
              { type: 'url', message: '请输入有效的 URL' },
            ]}
          >
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Form.Item
            name="models"
            label="模型列表（每行一个）"
            rules={[{ required: true, message: '请输入至少一个模型名称' }]}
          >
            <TextArea
              rows={4}
              placeholder={'gpt-4o\nclaude-3-5-sonnet\ndeepseek-chat'}
            />
          </Form.Item>
          <Form.Item
            name="frequency"
            label="检测频率"
            rules={[{ required: true, message: '请选择检测频率' }]}
          >
            <Select options={FREQUENCY_OPTIONS} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
