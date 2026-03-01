import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Tabs,
  Typography,
  Table,
  Button,
  Space,
  message,
  Tag,
  Alert,
  Spin,
  Checkbox,
  Select,
  Input,
  Modal,
  Radio,
  Descriptions,
  Progress,
  Empty,
  Popconfirm,
} from 'antd';
import {
  SplitCellsOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  BulbOutlined,
  SettingOutlined,
  ReloadOutlined,
  RollbackOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../context/AppContext';
import {
  fetchChannels,
  previewSplit,
  executeSplit,
  getSplitHistory,
  rollbackSplit,
  getSplitSuggestions,
  getSplitConfigs,
  saveSplitConfig,
  deleteSplitConfig,
} from '../api/client';
import type {
  Channel,
  SplitPreview,
  SplitExecutionOptions,
  SplitExecutionResult,
  SplitHistoryEntry,
  SplitSuggestion,
  SplitConfiguration,
  ParentChannelAction,
} from '@newapi-sync/shared';

const { Title, Text } = Typography;
const { Search } = Input;

export default function ChannelSplit() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [activeTab, setActiveTab] = useState('select');

  if (!connection) {
    return (
      <Card>
        <Alert
          message="未配置连接"
          description="请先在设置页面配置 New API 连接信息"
          type="warning"
          showIcon
        />
      </Card>
    );
  }

  return (
    <Card>
      <Title level={2}>
        <SplitCellsOutlined /> 渠道自动拆分
      </Title>
      <Text type="secondary">
        将支持多个模型的渠道拆分为单模型子渠道，实现基于模型的精细化成本优化
      </Text>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'select',
            label: (
              <span>
                <SplitCellsOutlined /> 渠道选择
              </span>
            ),
            children: <ChannelSelectionTab connection={connection} onNext={() => setActiveTab('preview')} />,
          },
          {
            key: 'preview',
            label: (
              <span>
                <EyeOutlined /> 拆分预览
              </span>
            ),
            children: <SplitPreviewTab connection={connection} onNext={() => setActiveTab('result')} />,
          },
          {
            key: 'result',
            label: (
              <span>
                <PlayCircleOutlined /> 执行结果
              </span>
            ),
            children: <ExecutionResultTab />,
          },
          {
            key: 'history',
            label: (
              <span>
                <HistoryOutlined /> 拆分历史
              </span>
            ),
            children: <SplitHistoryTab connection={connection} />,
          },
          {
            key: 'suggestions',
            label: (
              <span>
                <BulbOutlined /> 智能建议
              </span>
            ),
            children: <SmartSuggestionsTab connection={connection} />,
          },
          {
            key: 'configs',
            label: (
              <span>
                <SettingOutlined /> 配置管理
              </span>
            ),
            children: <ConfigManagementTab />,
          },
        ]}
      />
    </Card>
  );
}

// ============================================================================
// Channel Selection Tab
// ============================================================================

interface ChannelSelectionTabProps {
  connection: any;
  onNext: () => void;
}

function ChannelSelectionTab({ connection, onNext }: ChannelSelectionTabProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const [searchText, setSearchText] = useState('');

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetchChannels(connection);
      if (resp.success && resp.data) {
        setChannels(resp.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`加载渠道失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // 提取所有模型列表
  const allModels = React.useMemo(() => {
    const modelSet = new Set<string>();
    for (const ch of channels) {
      const models = ch.models?.split(',').filter(Boolean) || [];
      models.forEach((m) => modelSet.add(m.trim()));
    }
    return Array.from(modelSet).sort();
  }, [channels]);

  // 根据选中的模型筛选渠道（支持这些模型且是多模型渠道）
  const filteredChannels = React.useMemo(() => {
    if (selectedModels.length === 0) return [];

    return channels.filter((ch) => {
      const models = ch.models?.split(',').filter(Boolean).map((m) => m.trim()) || [];

      // 必须是多模型渠道
      if (models.length <= 1) return false;

      // 必须包含至少一个选中的模型
      const hasSelectedModel = selectedModels.some((sm) => models.includes(sm));
      if (!hasSelectedModel) return false;

      // 搜索过滤
      if (searchText && !ch.name.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [channels, selectedModels, searchText]);

  const columns: ColumnsType<Channel> = [
    {
      title: '选择',
      key: 'select',
      width: 60,
      render: (_, record) => (
        <Checkbox
          checked={selectedChannelIds.includes(record.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedChannelIds([...selectedChannelIds, record.id]);
            } else {
              setSelectedChannelIds(selectedChannelIds.filter((id) => id !== record.id));
            }
          }}
        />
      ),
    },
    {
      title: '渠道名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: number) => <Tag>{type}</Tag>,
    },
    {
      title: '支持的模型',
      key: 'models',
      render: (_, record) => {
        const models = record.models?.split(',').filter(Boolean).map((m) => m.trim()) || [];
        return (
          <Space wrap>
            {models.map((m) => (
              <Tag key={m} color={selectedModels.includes(m) ? 'blue' : 'default'}>
                {m}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
    },
  ];

  const handleNext = () => {
    if (selectedModels.length === 0) {
      message.warning('请先选择要拆分的模型');
      return;
    }
    if (selectedChannelIds.length === 0) {
      message.warning('请选择要拆分的渠道');
      return;
    }

    // 为每个选中的渠道设置模型筛选器（只拆分选中的模型）
    const modelFilters: Record<number, string[]> = {};
    for (const channelId of selectedChannelIds) {
      modelFilters[channelId] = selectedModels;
    }

    (window as any).__splitSelection = {
      channelIds: selectedChannelIds,
      modelFilters,
    };
    onNext();
  };

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message="拆分流程"
          description="第一步：选择要拆分的模型；第二步：选择包含这些模型的渠道进行拆分"
          type="info"
          showIcon
        />

        {/* 第一步：选择模型 */}
        <Card title="第一步：选择要拆分的模型" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text type="secondary">
              选择一个或多个模型，系统将显示包含这些模型的多模型渠道
            </Text>
            <Select
              mode="multiple"
              placeholder="请选择要拆分的模型"
              style={{ width: '100%' }}
              value={selectedModels}
              onChange={(value) => {
                setSelectedModels(value);
                setSelectedChannelIds([]); // 清空渠道选择
              }}
              options={allModels.map((m) => ({ label: m, value: m }))}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
            {selectedModels.length > 0 && (
              <Alert
                message={`已选择 ${selectedModels.length} 个模型`}
                type="success"
                showIcon
              />
            )}
          </Space>
        </Card>

        {/* 第二步：选择渠道 */}
        {selectedModels.length > 0 && (
          <Card title="第二步：选择要拆分的渠道" size="small">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space>
                <Search
                  placeholder="搜索渠道名称"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={{ width: 300 }}
                />
                <Button icon={<ReloadOutlined />} onClick={loadChannels}>
                  刷新
                </Button>
              </Space>

              {filteredChannels.length === 0 ? (
                <Empty description="没有找到包含所选模型的多模型渠道" />
              ) : (
                <>
                  <Alert
                    message={`找到 ${filteredChannels.length} 个包含所选模型的多模型渠道`}
                    type="info"
                    showIcon
                  />
                  <Table
                    columns={columns}
                    dataSource={filteredChannels}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                  />
                </>
              )}
            </Space>
          </Card>
        )}

        <Space>
          <Button
            type="primary"
            icon={<EyeOutlined />}
            disabled={selectedModels.length === 0 || selectedChannelIds.length === 0}
            onClick={handleNext}
          >
            生成预览 ({selectedChannelIds.length} 个渠道)
          </Button>
          {selectedModels.length > 0 && selectedChannelIds.length > 0 && (
            <Text type="secondary">
              将为选中的 {selectedChannelIds.length} 个渠道拆分出 {selectedModels.length} 个模型
            </Text>
          )}
        </Space>
      </Space>
    </Spin>
  );
}

// ============================================================================
// Split Preview Tab
// ============================================================================

interface SplitPreviewTabProps {
  connection: any;
  onNext: () => void;
}

function SplitPreviewTab({ connection, onNext }: SplitPreviewTabProps) {
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [parentAction, setParentAction] = useState<ParentChannelAction>('disable');
  const [autoPriority, setAutoPriority] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    const selection = (window as any).__splitSelection;
    if (!selection) {
      setError('请先选择要拆分的渠道');
      message.warning('请先选择要拆分的渠道');
      return;
    }

    console.log('Split selection:', selection);

    setLoading(true);
    setError(null);
    try {
      const resp = await previewSplit(connection, selection.channelIds, selection.modelFilters);
      console.log('Preview response:', resp);

      if (resp.success && resp.data) {
        setPreview(resp.data);
        console.log('Preview data:', resp.data);
      } else {
        const errorMsg = resp.error || '生成预览失败';
        setError(errorMsg);
        message.error(errorMsg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Preview error:', err);
      setError(msg);
      message.error(`生成预览失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleExecute = async () => {
    if (!preview) return;

    const options: SplitExecutionOptions = {
      parentAction,
      autoPriority,
    };

    (window as any).__splitExecution = { preview, options };
    onNext();
  };

  if (loading) {
    return <Spin tip="正在生成预览..." />;
  }

  if (error) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message="生成预览失败"
          description={error}
          type="error"
          showIcon
        />
        <Button onClick={loadPreview}>重新生成预览</Button>
      </Space>
    );
  }

  if (!preview) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Empty description="暂无预览数据" />
        <Button onClick={loadPreview}>生成预览</Button>
      </Space>
    );
  }

  const subChannelColumns: ColumnsType<any> = [
    {
      title: '子渠道名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => (
        <Space>
          <Text>{name}</Text>
          {record.nameConflict && <Tag color="warning">名称冲突</Tag>}
        </Space>
      ),
    },
    {
      title: '模型',
      dataIndex: 'modelId',
      key: 'modelId',
    },
    {
      title: '父渠道',
      dataIndex: 'parentChannelName',
      key: 'parentChannelName',
    },
    {
      title: '建议优先级',
      dataIndex: 'suggestedPriority',
      key: 'suggestedPriority',
      render: (priority: number | undefined) => priority ?? '-',
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {preview.validationErrors.length > 0 && (
        <Alert
          message="配置验证失败"
          description={
            <ul>
              {preview.validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          }
          type="error"
          showIcon
        />
      )}

      <Descriptions bordered column={2}>
        <Descriptions.Item label="父渠道数量">{preview.parentChannels.length}</Descriptions.Item>
        <Descriptions.Item label="将创建子渠道">{preview.totalSubChannels}</Descriptions.Item>
        <Descriptions.Item label="名称冲突">{preview.nameConflicts}</Descriptions.Item>
      </Descriptions>

      <Card title="拆分配置" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>父渠道处理方式：</Text>
            <Radio.Group value={parentAction} onChange={(e) => setParentAction(e.target.value)}>
              <Radio value="disable">禁用父渠道（推荐）</Radio>
              <Radio value="keep">保留父渠道</Radio>
              <Radio value="delete">删除父渠道</Radio>
            </Radio.Group>
          </div>
          <div>
            <Checkbox checked={autoPriority} onChange={(e) => setAutoPriority(e.target.checked)}>
              自动计算并分配优先级
            </Checkbox>
          </div>
        </Space>
      </Card>

      <Table
        columns={subChannelColumns}
        dataSource={preview.subChannels}
        rowKey={(record) => `${record.parentChannelId}-${record.modelId}`}
        pagination={{ pageSize: 20 }}
      />

      <Space>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={handleExecute}
          disabled={preview.validationErrors.length > 0}
        >
          执行拆分
        </Button>
        <Button onClick={loadPreview}>重新生成预览</Button>
      </Space>
    </Space>
  );
}

// ============================================================================
// Execution Result Tab
// ============================================================================

function ExecutionResultTab() {
  const [result, setResult] = useState<SplitExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { state } = useAppContext();
  const connection = state.connection.settings;

  useEffect(() => {
    const executeData = (window as any).__splitExecution;
    if (!executeData || !connection) return;

    const execute = async () => {
      setLoading(true);
      try {
        const resp = await executeSplit(connection, executeData.preview, executeData.options);
        if (resp.success && resp.data) {
          setResult(resp.data);
          if (resp.data.success) {
            message.success('拆分操作完成');
          } else {
            message.warning('拆分操作部分成功');
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(`执行拆分失败: ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    execute();
  }, [connection]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" tip="正在执行拆分操作..." />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">这可能需要几分钟时间，请耐心等待</Text>
        </div>
      </div>
    );
  }

  if (!result) {
    return <Empty description="暂无执行结果" />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert
        message={result.success ? '拆分成功' : '拆分部分成功'}
        description={`成功: ${result.totalSuccess} 个，失败: ${result.totalFailed} 个`}
        type={result.success ? 'success' : 'warning'}
        showIcon
      />

      <Card title="子渠道创建结果" size="small">
        <Table
          columns={[
            {
              title: '状态',
              key: 'status',
              width: 80,
              render: (_, record: any) =>
                record.success ? (
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                ),
            },
            { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
            { title: '名称', dataIndex: 'name', key: 'name' },
            { title: '模型', dataIndex: 'modelId', key: 'modelId' },
            {
              title: '错误信息',
              dataIndex: 'error',
              key: 'error',
              render: (error: string | undefined) => error || '-',
            },
          ]}
          dataSource={result.createdSubChannels}
          rowKey="id"
          pagination={false}
        />
      </Card>

      {result.priorityUpdateResults && result.priorityUpdateResults.length > 0 && (
        <Card title="优先级更新结果" size="small">
          <Text>
            成功更新 {result.priorityUpdateResults.filter((r) => r.success).length} 个渠道的优先级
          </Text>
        </Card>
      )}

      <Card title="父渠道处理结果" size="small">
        <Table
          columns={[
            {
              title: '状态',
              key: 'status',
              width: 80,
              render: (_, record: any) =>
                record.success ? (
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
                ),
            },
            { title: '渠道 ID', dataIndex: 'channelId', key: 'channelId', width: 100 },
            { title: '操作', dataIndex: 'action', key: 'action', width: 100 },
            {
              title: '错误信息',
              dataIndex: 'error',
              key: 'error',
              render: (error: string | undefined) => error || '-',
            },
          ]}
          dataSource={result.parentChannelResults}
          rowKey="channelId"
          pagination={false}
        />
      </Card>
    </Space>
  );
}

// ============================================================================
// Split History Tab
// ============================================================================

interface SplitHistoryTabProps {
  connection: any;
}

function SplitHistoryTab({ connection }: SplitHistoryTabProps) {
  const [history, setHistory] = useState<SplitHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getSplitHistory();
      if (resp.success && resp.data) {
        setHistory(resp.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`加载历史失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRollback = async (id: number) => {
    try {
      const resp = await rollbackSplit(connection, id);
      if (resp.success && resp.data) {
        message.success('回滚成功');
        loadHistory();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`回滚失败: ${msg}`);
    }
  };

  const columns: ColumnsType<SplitHistoryEntry> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '拆分时间', dataIndex: 'splitAt', key: 'splitAt', width: 180 },
    { title: '父渠道', dataIndex: 'parentChannelName', key: 'parentChannelName' },
    {
      title: '子渠道数量',
      key: 'subChannelCount',
      width: 120,
      render: (_, record) => record.subChannelIds.length,
    },
    { title: '父渠道操作', dataIndex: 'parentAction', key: 'parentAction', width: 120 },
    {
      title: '回滚状态',
      dataIndex: 'rollbackStatus',
      key: 'rollbackStatus',
      width: 120,
      render: (status: string | undefined) => {
        if (!status) return <Tag>未回滚</Tag>;
        if (status === 'success') return <Tag color="success">已回滚</Tag>;
        if (status === 'partial') return <Tag color="warning">部分回滚</Tag>;
        return <Tag color="error">回滚失败</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Popconfirm
          title="确认回滚"
          description="这将删除所有子渠道并恢复父渠道状态"
          onConfirm={() => handleRollback(record.id!)}
          disabled={!!record.rollbackStatus}
        >
          <Button
            type="link"
            icon={<RollbackOutlined />}
            size="small"
            disabled={!!record.rollbackStatus}
          >
            回滚
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadHistory}>
            刷新
          </Button>
        </Space>

        <Table columns={columns} dataSource={history} rowKey="id" pagination={{ pageSize: 20 }} />
      </Space>
    </Spin>
  );
}

// ============================================================================
// Smart Suggestions Tab
// ============================================================================

interface SmartSuggestionsTabProps {
  connection: any;
}

function SmartSuggestionsTab({ connection }: SmartSuggestionsTabProps) {
  const [suggestions, setSuggestions] = useState<SplitSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getSplitSuggestions(connection);
      if (resp.success && resp.data) {
        setSuggestions(resp.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`加载建议失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const columns: ColumnsType<SplitSuggestion> = [
    { title: '渠道名称', dataIndex: 'channelName', key: 'channelName' },
    { title: '模型数量', dataIndex: 'modelCount', key: 'modelCount', width: 100 },
    {
      title: '预计成本节省',
      dataIndex: 'estimatedCostSaving',
      key: 'estimatedCostSaving',
      width: 150,
      render: (saving: number) => `${(saving * 100).toFixed(1)}%`,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority: string) => {
        const color = priority === 'high' ? 'red' : priority === 'medium' ? 'orange' : 'blue';
        return <Tag color={color}>{priority}</Tag>;
      },
    },
    { title: '原因', dataIndex: 'reason', key: 'reason' },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          message="智能建议"
          description="系统根据价格数据分析，识别出以下渠道适合拆分以优化成本"
          type="info"
          showIcon
        />

        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadSuggestions}>
            刷新
          </Button>
        </Space>

        {suggestions.length === 0 ? (
          <Empty description="暂无拆分建议" />
        ) : (
          <Table columns={columns} dataSource={suggestions} rowKey="channelId" pagination={false} />
        )}
      </Space>
    </Spin>
  );
}

// ============================================================================
// Config Management Tab
// ============================================================================

function ConfigManagementTab() {
  const [configs, setConfigs] = useState<SplitConfiguration[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getSplitConfigs();
      if (resp.success && resp.data) {
        setConfigs(resp.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`加载配置失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleDelete = async (id: number) => {
    try {
      await deleteSplitConfig(id);
      message.success('删除成功');
      loadConfigs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`删除失败: ${msg}`);
    }
  };

  const columns: ColumnsType<SplitConfiguration> = [
    { title: '配置名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description' },
    { title: '命名模式', dataIndex: 'namingPattern', key: 'namingPattern' },
    { title: '父渠道操作', dataIndex: 'parentAction', key: 'parentAction', width: 120 },
    {
      title: '自动优先级',
      dataIndex: 'autoPriority',
      key: 'autoPriority',
      width: 120,
      render: (auto: boolean) => (auto ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Popconfirm
          title="确认删除"
          description="确定要删除这个配置吗？"
          onConfirm={() => handleDelete(record.id!)}
        >
          <Button type="link" danger icon={<DeleteOutlined />} size="small">
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadConfigs}>
            刷新
          </Button>
        </Space>

        <Table columns={columns} dataSource={configs} rowKey="id" pagination={false} />
      </Space>
    </Spin>
  );
}
