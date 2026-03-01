import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
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
import type { CheckinTarget, CheckinRecord } from '@newapi-sync/shared';
import {
  getCheckinTargets,
  addCheckinTarget,
  updateCheckinTarget,
  deleteCheckinTarget,
  executeCheckin,
  executeCheckinAll,
  getCheckinRecords,
  getLatestCheckinRecord,
} from '../api/client';

const { Title, Text } = Typography;

/** Merged row data: channel source + its checkin config + latest record */
interface TargetRow extends CheckinTarget {
  latestRecord?: CheckinRecord | null;
}

export default function CheckinManagement() {
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [recordsMap, setRecordsMap] = useState<Record<number, CheckinRecord[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<CheckinTarget | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Checkin execution loading
  const [checkinLoading, setCheckinLoading] = useState<Record<number | string, boolean>>({});

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadTargets = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const resp = await getCheckinTargets();
      const list: CheckinTarget[] = resp.data ?? [];

      // Fetch latest record for each target in parallel
      const withRecords = await Promise.all(
        list.map(async (t) => {
          try {
            const lr = await getLatestCheckinRecord(t.id!);
            return { ...t, latestRecord: lr.data } as TargetRow;
          } catch {
            return { ...t, latestRecord: null } as TargetRow;
          }
        }),
      );
      setTargets(withRecords);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  // -----------------------------------------------------------------------
  // Expand: load records for a target
  // -----------------------------------------------------------------------

  const loadRecords = useCallback(async (targetId: number) => {
    try {
      const resp = await getCheckinRecords(targetId, 20);
      setRecordsMap((prev) => ({ ...prev, [targetId]: resp.data ?? [] }));
    } catch {
      // silently ignore
    }
  }, []);

  // -----------------------------------------------------------------------
  // Add / Edit
  // -----------------------------------------------------------------------

  const openAddModal = () => {
    message.info('请在"渠道源"页面添加新的渠道');
  };

  const openEditModal = (target: CheckinTarget) => {
    setEditingTarget(target);
    form.setFieldsValue({
      autoCheckin: target.checkinConfig?.autoCheckin ?? false,
      checkinTime: dayjs(target.checkinConfig?.checkinTime ?? '00:05', 'HH:mm'),
    });
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // Convert TimePicker value to HH:mm string
      const payload = {
        checkinConfig: {
          sourceId: editingTarget!.id!,
          autoCheckin: values.autoCheckin,
          checkinTime: values.checkinTime ? values.checkinTime.format('HH:mm') : '00:05',
          createdAt: editingTarget!.createdAt || new Date().toISOString()
        }
      };

      await updateCheckinTarget(editingTarget!.id!, payload);
      message.success('签到配置已更新');
      setModalOpen(false);
      loadTargets();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // validation error
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
      await deleteCheckinTarget(id);
      message.success('签到配置已删除');
      loadTargets();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // -----------------------------------------------------------------------
  // Toggle enabled
  // -----------------------------------------------------------------------

  const handleToggleEnabled = async (target: CheckinTarget, enabled: boolean) => {
    message.info('请在"渠道源"页面修改渠道的启用状态');
  };

  // -----------------------------------------------------------------------
  // Execute checkin
  // -----------------------------------------------------------------------

  const handleCheckinOne = async (targetId: number) => {
    setCheckinLoading((prev) => ({ ...prev, [targetId]: true }));
    try {
      const resp = await executeCheckin(targetId);
      if (resp.data?.success) {
        message.success('签到成功');
      } else {
        message.warning(`签到失败: ${resp.data?.error ?? '未知错误'}`);
      }
      loadTargets();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '签到请求失败');
    } finally {
      setCheckinLoading((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  const handleCheckinAll = async () => {
    setCheckinLoading((prev) => ({ ...prev, all: true }));
    try {
      const resp = await executeCheckinAll();
      const records = resp.data ?? [];
      const successCount = records.filter((r) => r.success).length;
      const failCount = records.filter((r) => !r.success).length;
      message.info(`签到完成: ${successCount} 成功, ${failCount} 失败`);
      loadTargets();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '批量签到失败');
    } finally {
      setCheckinLoading((prev) => ({ ...prev, all: false }));
    }
  };

  // -----------------------------------------------------------------------
  // Table columns
  // -----------------------------------------------------------------------

  const columns: ColumnsType<TargetRow> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
    },
    {
      title: '地址',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
    },
    {
      title: '启用状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) => (
        <span style={{ color: enabled ? '#52c41a' : '#999' }}>
          {enabled ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      title: '自动签到',
      key: 'autoCheckin',
      width: 120,
      render: (_: unknown, record: TargetRow) => {
        if (!record.checkinConfig?.autoCheckin) return <Tag>手动</Tag>;
        return (
          <Tag color="blue">
            自动 {record.checkinConfig.checkinTime}
          </Tag>
        );
      },
    },
    {
      title: '最后签到时间',
      key: 'lastCheckinAt',
      width: 180,
      render: (_: unknown, record: TargetRow) =>
        record.latestRecord?.checkinAt
          ? new Date(record.latestRecord.checkinAt).toLocaleString()
          : '-',
    },
    {
      title: '签到结果',
      key: 'lastResult',
      width: 120,
      render: (_: unknown, record: TargetRow) => {
        if (!record.latestRecord) return <Tag>未签到</Tag>;
        return record.latestRecord.success ? (
          <Tag color="success">成功</Tag>
        ) : (
          <Tag color="error">失败</Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_: unknown, record: TargetRow) => (
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
            title="确定删除该签到配置？"
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
            loading={!!checkinLoading[record.id!]}
            onClick={() => handleCheckinOne(record.id!)}
          >
            签到
          </Button>
        </Space>
      ),
    },
  ];

  // -----------------------------------------------------------------------
  // Expanded row: recent checkin records
  // -----------------------------------------------------------------------

  const expandedRowRender = (record: TargetRow) => {
    const records = recordsMap[record.id!];
    if (!records) return <Text type="secondary">加载中...</Text>;
    if (records.length === 0) return <Text type="secondary">暂无签到记录</Text>;

    const recordColumns: ColumnsType<CheckinRecord> = [
      {
        title: '签到时间',
        dataIndex: 'checkinAt',
        key: 'checkinAt',
        width: 180,
        render: (v: string) => new Date(v).toLocaleString(),
      },
      {
        title: '结果',
        dataIndex: 'success',
        key: 'success',
        width: 80,
        render: (v: boolean) =>
          v ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>,
      },
      {
        title: '额度信息',
        dataIndex: 'quota',
        key: 'quota',
        render: (v?: string) => v || '-',
      },
      {
        title: '错误信息',
        dataIndex: 'error',
        key: 'error',
        render: (v?: string) => (v ? <Text type="danger">{v}</Text> : '-'),
      },
    ];

    return (
      <Table
        columns={recordColumns}
        dataSource={records}
        rowKey="id"
        size="small"
        pagination={false}
      />
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        签到管理
      </Title>

      {/* Action bar */}
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ThunderboltOutlined />}
          loading={!!checkinLoading['all']}
          onClick={handleCheckinAll}
        >
          全部签到
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
      <Table<TargetRow>
        columns={columns}
        dataSource={targets}
        rowKey="id"
        loading={loading}
        expandable={{
          expandedRowRender,
          onExpand: (expanded, record) => {
            if (expanded && record.id != null) loadRecords(record.id);
          },
        }}
        pagination={false}
        scroll={{ x: 1000 }}
      />

      {/* Add / Edit Modal */}
      <Modal
        title="配置自动签到"
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item name="autoCheckin" label="启用自动签到" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="checkinTime"
            label="签到时间"
            tooltip="每天自动签到的时间"
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
