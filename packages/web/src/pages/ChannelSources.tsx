import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Space, Spin, Switch, Table, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, ImportOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ChannelSource, ChannelSourcePriceRateConfig } from '@newapi-sync/shared';
import { useAppContext } from '../context/AppContext';
import {
  getChannelSources,
  addChannelSource,
  updateChannelSource,
  deleteChannelSource,
  getImportCandidates,
  importChannelSourcesBatch,
  getChannelSourcePriceRates,
  setChannelSourcePriceRate,
  deleteChannelSourcePriceRate,
  type ImportCandidate,
} from '../api/client';

export default function ChannelSourcesPage() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [sources, setSources] = useState<ChannelSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSource, setEditingSource] = useState<ChannelSource | null>(null);
  const [form] = Form.useForm();

  // Price rate state
  const [priceRates, setPriceRates] = useState<Map<number, ChannelSourcePriceRateConfig>>(new Map());
  const [editingRates, setEditingRates] = useState<Map<number, number | null>>(new Map());
  const [savingRateIds, setSavingRateIds] = useState<Set<number>>(new Set());
  const [deletingRateIds, setDeletingRateIds] = useState<Set<number>>(new Set());

  // Import modal state
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [sourcesResp, ratesResp] = await Promise.all([
        getChannelSources(),
        getChannelSourcePriceRates(),
      ]);
      
      if (sourcesResp.success) {
        setSources(sourcesResp.sources);
      } else {
        setError('获取渠道源失败');
      }

      if (ratesResp.success) {
        const rateMap = new Map<number, ChannelSourcePriceRateConfig>();
        ratesResp.data.forEach((rate) => {
          rateMap.set(rate.sourceId, rate);
        });
        setPriceRates(rateMap);
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
    form.setFieldsValue({ enabled: true, isOwnInstance: false });
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

  // --- Import from instance ---
  const handleOpenImport = async () => {
    if (!connection) {
      message.warning('请先在设置页面配置 New API 连接');
      return;
    }
    setImportModalVisible(true);
    setImportLoading(true);
    setCandidates([]);
    setSelectedCandidates(new Set());
    try {
      const resp = await getImportCandidates(connection);
      console.log('[ChannelSources] Import candidates response:', resp);
      if (resp.success) {
        console.log('[ChannelSources] Candidates count:', resp.candidates?.length);
        console.log('[ChannelSources] Candidates data:', resp.candidates);
        setCandidates(resp.candidates);
        // Auto-select candidates that don't already exist
        const autoSelected = new Set<string>();
        for (const c of resp.candidates) {
          if (!c.alreadyExists) autoSelected.add(c.baseUrl);
        }
        setSelectedCandidates(autoSelected);
      } else {
        message.error('获取渠道列表失败');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ChannelSources] Import error:', err);
      message.error(`获取渠道列表失败: ${msg}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleToggleCandidate = (baseUrl: string, checked: boolean) => {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (checked) next.add(baseUrl);
      else next.delete(baseUrl);
      return next;
    });
  };

  const handleImportSubmit = async () => {
    const toImport = candidates.filter((c) => selectedCandidates.has(c.baseUrl));
    if (toImport.length === 0) {
      message.warning('请至少选择一个渠道源');
      return;
    }
    
    // Check if any candidate has empty key
    const hasEmptyKey = toImport.some((c) => !c.key);
    if (hasEmptyKey && !connection) {
      message.error('部分渠道缺少 API Key，无法导入');
      return;
    }
    
    setImportSubmitting(true);
    try {
      const resp = await importChannelSourcesBatch(
        toImport.map((c) => ({ 
          name: c.suggestedName, 
          baseUrl: c.baseUrl, 
          // If key is empty, use the connection's API key (since it has admin access)
          apiKey: c.key || connection!.apiKey 
        })),
      );
      if (resp.success) {
        message.success(`成功导入 ${resp.imported} 个渠道源`);
        setImportModalVisible(false);
        fetchSources();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`导入失败: ${msg}`);
    } finally {
      setImportSubmitting(false);
    }
  };

  // --- Price Rate Handlers ---
  const getCurrentRate = useCallback((sourceId: number): number | null => {
    if (editingRates.has(sourceId)) return editingRates.get(sourceId) ?? null;
    return priceRates.get(sourceId)?.priceRate ?? null;
  }, [editingRates, priceRates]);

  const handleSaveRate = useCallback(async (source: ChannelSource) => {
    const rate = getCurrentRate(source.id!);
    if (rate == null || rate <= 0) {
      message.error('充值汇率必须大于 0');
      return;
    }
    setSavingRateIds((prev) => new Set(prev).add(source.id!));
    try {
      await setChannelSourcePriceRate(source.id!, source.name, rate);
      message.success(`渠道源「${source.name}」充值汇率已保存`);
      setEditingRates((prev) => {
        const next = new Map(prev);
        next.delete(source.id!);
        return next;
      });
      await fetchSources();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`保存失败: ${msg}`);
    } finally {
      setSavingRateIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id!);
        return next;
      });
    }
  }, [getCurrentRate, fetchSources]);

  const handleDeleteRate = useCallback(async (source: ChannelSource) => {
    setDeletingRateIds((prev) => new Set(prev).add(source.id!));
    try {
      await deleteChannelSourcePriceRate(source.id!);
      message.success(`渠道源「${source.name}」充值汇率已删除`);
      setEditingRates((prev) => {
        const next = new Map(prev);
        next.delete(source.id!);
        return next;
      });
      await fetchSources();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`删除失败: ${msg}`);
    } finally {
      setDeletingRateIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id!);
        return next;
      });
    }
  }, [fetchSources]);

  const columns: ColumnsType<ChannelSource> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 150 },
    {
      title: '分组',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 120,
      render: (groupName: string | undefined) => groupName ? <Tag color="purple">{groupName}</Tag> : <span style={{ color: '#999' }}>-</span>
    },
    { title: 'Base URL', dataIndex: 'baseUrl', key: 'baseUrl', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'isOwnInstance',
      key: 'isOwnInstance',
      width: 100,
      render: (isOwn: boolean) => (
        <Tag color={isOwn ? 'blue' : 'default'}>{isOwn ? '自有实例' : '渠道源'}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>{enabled ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: (
        <Tooltip title="充值汇率：X元人民币 = 1美元，数值越小表示渠道越便宜">
          充值汇率 (X元=1美金)
        </Tooltip>
      ),
      key: 'unitCost',
      width: 180,
      render: (_: unknown, record: ChannelSource) => {
        const rate = getCurrentRate(record.id!);
        const unitCost = rate && rate > 0 ? 1 / rate : null;
        return (
          <InputNumber
            min={0.0001}
            step={0.1}
            precision={4}
            placeholder="输入充值汇率"
            value={unitCost}
            onChange={(val) => {
              // Convert unit cost to price rate for storage
              const priceRate = val && val > 0 ? 1 / val : null;
              setEditingRates((prev) => {
                const next = new Map(prev);
                next.set(record.id!, priceRate);
                return next;
              });
            }}
            style={{ width: '100%' }}
          />
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: ChannelSource) => {
        const hasExisting = priceRates.has(record.id!);
        const isEditing = editingRates.has(record.id!);
        const rate = getCurrentRate(record.id!);
        const canSave = rate != null && rate > 0 && (isEditing || !hasExisting);

        return (
          <Space size="small">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id!)} />
            <Button
              type="primary"
              size="small"
              loading={savingRateIds.has(record.id!)}
              disabled={!canSave}
              onClick={() => handleSaveRate(record)}
            >
              保存
            </Button>
            {hasExisting && (
              <Popconfirm
                title="确定删除该渠道源的充值汇率配置？"
                onConfirm={() => handleDeleteRate(record)}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  danger
                  size="small"
                  loading={deletingRateIds.has(record.id!)}
                >
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  const importCandidateColumns: ColumnsType<ImportCandidate> = [
    {
      title: '',
      key: 'select',
      width: 40,
      render: (_: unknown, record: ImportCandidate) => (
        <Checkbox
          checked={selectedCandidates.has(record.baseUrl)}
          disabled={record.alreadyExists}
          onChange={(e) => handleToggleCandidate(record.baseUrl, e.target.checked)}
        />
      ),
    },
    {
      title: 'Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
    },
    {
      title: '建议名称',
      dataIndex: 'suggestedName',
      key: 'suggestedName',
    },
    {
      title: '渠道数',
      dataIndex: 'channelCount',
      key: 'channelCount',
      width: 80,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: unknown, record: ImportCandidate) =>
        record.alreadyExists ? <Tag color="orange">已存在</Tag> : <Tag color="blue">新</Tag>,
    },
  ];

  const selectableCount = candidates.filter((c) => !c.alreadyExists).length;
  const allSelectableSelected = selectableCount > 0 && candidates.filter((c) => !c.alreadyExists).every((c) => selectedCandidates.has(c.baseUrl));

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchSources}>刷新</Button>
        <Button icon={<ImportOutlined />} onClick={handleOpenImport}>从实例导入</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加渠道源</Button>
      </Space>

      {error && <Alert type="error" message={error} showIcon closable style={{ marginBottom: 16 }} />}

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={sources}
        pagination={false}
        size="small"
        scroll={{ x: 1200 }}
      />

      {/* Add / Edit Modal */}
      <Modal
        title={editingSource ? '编辑渠道源' : '添加渠道源'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="groupName" label="分组名称" tooltip="可选,用于区分同一渠道的不同价格分组(如VIP1、VIP2等)">
            <Input placeholder="如: VIP1, 普通用户, 企业版等" />
          </Form.Item>
          <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: '请输入 Base URL' }]}>
            <Input placeholder="https://api.example.com" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="userId" label="User ID">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isOwnInstance" label="自有实例" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import Modal */}
      <Modal
        title="从实例导入渠道源"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        width={720}
        footer={[
          <Button key="cancel" onClick={() => setImportModalVisible(false)}>取消</Button>,
          <Button
            key="import"
            type="primary"
            loading={importSubmitting}
            disabled={selectedCandidates.size === 0 || importLoading}
            onClick={handleImportSubmit}
          >
            导入选中 ({selectedCandidates.size})
          </Button>,
        ]}
      >
        {importLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin tip="正在读取实例渠道..." /></div>
        ) : (
          <>
            {candidates.length === 0 ? (
              <Alert type="info" message="未找到可导入的渠道源" showIcon style={{ marginBottom: 16 }} />
            ) : null}
            <div style={{ marginBottom: 8 }}>
              <Checkbox
                checked={allSelectableSelected}
                disabled={selectableCount === 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    const all = new Set<string>();
                    candidates.forEach((c) => { if (!c.alreadyExists) all.add(c.baseUrl); });
                    setSelectedCandidates(all);
                  } else {
                    setSelectedCandidates(new Set());
                  }
                }}
              >
                全选 ({selectableCount} 个可导入)
              </Checkbox>
            </div>
            <Table
              rowKey="baseUrl"
              columns={importCandidateColumns}
              dataSource={candidates}
              pagination={false}
              size="small"
            />
          </>
        )}
      </Modal>
    </div>
  );
}
