import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  message,
  Tag,
  Alert,
  Spin,
  Input,
  Modal,
  Typography,
  Descriptions,
} from 'antd';
import { SwapOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../context/AppContext';
import { fetchChannels, batchUpdateModelMapping } from '../api/client';
import type { Channel, ConnectionSettings } from '@newapi-sync/shared';

const { Text } = Typography;
const { Search } = Input;

interface ModelNameInfo {
  modelName: string;
  channelCount: number;
  channels: { id: number; name: string }[];
  existingMappings: Record<string, string>; // channelId -> mapped target
}

interface PreviewItem {
  channelId: number;
  channelName: string;
  originalMapping: Record<string, string>;
  newMapping: Record<string, string>;
  changes: { from: string; to: string }[];
}

export default function ModelNameMappingTab() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedModelNames, setSelectedModelNames] = useState<string[]>([]);
  const [targetName, setTargetName] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewItem[]>([]);
  const [executing, setExecuting] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!connection) return;
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

  // Parse all model names from channels
  const allModelNames = useMemo<ModelNameInfo[]>(() => {
    const map = new Map<string, ModelNameInfo>();

    for (const ch of channels) {
      const models = ch.models ? ch.models.split(',').map((m) => m.trim()).filter(Boolean) : [];
      let mapping: Record<string, string> = {};
      if (ch.model_mapping && ch.model_mapping.trim()) {
        try {
          mapping = JSON.parse(ch.model_mapping);
        } catch { /* ignore */ }
      }

      for (const modelName of models) {
        if (!map.has(modelName)) {
          map.set(modelName, {
            modelName,
            channelCount: 0,
            channels: [],
            existingMappings: {},
          });
        }
        const info = map.get(modelName)!;
        info.channelCount++;
        info.channels.push({ id: ch.id, name: ch.name });
        if (mapping[modelName]) {
          info.existingMappings[String(ch.id)] = mapping[modelName];
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.channelCount - a.channelCount);
  }, [channels]);

  const filteredModelNames = useMemo(() => {
    if (!searchText) return allModelNames;
    const lower = searchText.toLowerCase();
    return allModelNames.filter((m) => m.modelName.toLowerCase().includes(lower));
  }, [allModelNames, searchText]);

  // Build preview data
  const buildPreview = useCallback(() => {
    if (selectedModelNames.length < 2) {
      message.warning('请至少选择 2 个模型名称进行合并');
      return;
    }
    if (!targetName.trim()) {
      message.warning('请输入目标标准名称');
      return;
    }

    const mappings: Record<string, string> = {};
    for (const name of selectedModelNames) {
      if (name !== targetName) {
        mappings[name] = targetName;
      }
    }

    if (Object.keys(mappings).length === 0) {
      message.info('所有选中的模型名称与目标名称相同，无需映射');
      return;
    }

    // Find affected channels
    const affectedChannels = new Map<number, { channel: Channel; changes: { from: string; to: string }[] }>();

    for (const ch of channels) {
      const models = ch.models ? ch.models.split(',').map((m) => m.trim()).filter(Boolean) : [];
      const changes: { from: string; to: string }[] = [];

      for (const modelName of models) {
        if (mappings[modelName]) {
          changes.push({ from: modelName, to: mappings[modelName] });
        }
      }

      if (changes.length > 0) {
        affectedChannels.set(ch.id, { channel: ch, changes });
      }
    }

    const preview: PreviewItem[] = [];
    for (const [, { channel, changes }] of affectedChannels) {
      let originalMapping: Record<string, string> = {};
      if (channel.model_mapping && channel.model_mapping.trim()) {
        try {
          originalMapping = JSON.parse(channel.model_mapping);
        } catch { /* ignore */ }
      }
      const newMapping = { ...originalMapping };
      for (const c of changes) {
        newMapping[c.from] = c.to;
      }

      preview.push({
        channelId: channel.id,
        channelName: channel.name,
        originalMapping,
        newMapping,
        changes,
      });
    }

    setPreviewData(preview);
    setPreviewVisible(true);
  }, [selectedModelNames, targetName, channels]);

  // Execute mapping
  const executeMapping = useCallback(async () => {
    if (!connection || previewData.length === 0) return;

    const mappings: Record<string, string> = {};
    for (const name of selectedModelNames) {
      if (name !== targetName) {
        mappings[name] = targetName;
      }
    }

    const channelIds = previewData.map((p) => p.channelId);

    setExecuting(true);
    try {
      const resp = await batchUpdateModelMapping(connection, channelIds, mappings);
      if (resp.success && resp.data) {
        message.success(`映射完成：成功 ${resp.data.totalSuccess}，失败 ${resp.data.totalFailed}`);
        if (resp.data.totalFailed > 0) {
          const failedItems = resp.data.results.filter((r) => !r.success);
          for (const item of failedItems) {
            message.error(`渠道 ${item.channelId} 失败: ${item.error}`);
          }
        }
        setPreviewVisible(false);
        setSelectedModelNames([]);
        setTargetName('');
        loadChannels();
      } else {
        message.error(`映射失败: ${resp.error || '未知错误'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`执行映射失败: ${msg}`);
    } finally {
      setExecuting(false);
    }
  }, [connection, previewData, selectedModelNames, targetName, loadChannels]);

  if (!connection) {
    return (
      <Alert
        message="未配置连接"
        description="请先在设置页面配置 New API 连接信息"
        type="warning"
        showIcon
      />
    );
  }

  const columns: ColumnsType<ModelNameInfo> = [
    {
      title: '模型名称',
      dataIndex: 'modelName',
      key: 'modelName',
      ellipsis: true,
      render: (name: string) => <Text copyable={{ text: name }}>{name}</Text>,
    },
    {
      title: '渠道数',
      dataIndex: 'channelCount',
      key: 'channelCount',
      width: 80,
      sorter: (a, b) => a.channelCount - b.channelCount,
    },
    {
      title: '已有映射',
      key: 'existingMappings',
      width: 200,
      render: (_: unknown, record: ModelNameInfo) => {
        const mappingValues = Object.values(record.existingMappings);
        if (mappingValues.length === 0) return <Text type="secondary">无</Text>;
        const unique = [...new Set(mappingValues)];
        return (
          <Space size={4} wrap>
            {unique.map((v) => (
              <Tag key={v} color="blue">{v}</Tag>
            ))}
          </Space>
        );
      },
    },
  ];

  const previewColumns: ColumnsType<PreviewItem> = [
    {
      title: '渠道 ID',
      dataIndex: 'channelId',
      key: 'channelId',
      width: 80,
    },
    {
      title: '渠道名称',
      dataIndex: 'channelName',
      key: 'channelName',
      ellipsis: true,
    },
    {
      title: '映射变更',
      key: 'changes',
      render: (_: unknown, record: PreviewItem) => (
        <Space direction="vertical" size={2}>
          {record.changes.map((c, i) => (
            <Text key={i}>
              <Text code>{c.from}</Text> → <Text code>{c.to}</Text>
            </Text>
          ))}
        </Space>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>模型名称映射</Typography.Title>
          <Space>
            <Search
              placeholder="搜索模型名称"
              allowClear
              onSearch={setSearchText}
              onChange={(e) => !e.target.value && setSearchText('')}
              style={{ width: 300 }}
              prefix={<SearchOutlined />}
            />
            <Button onClick={loadChannels} loading={loading}>
              刷新
            </Button>
          </Space>
        </div>

        <Alert
          message="选择多个相似的模型名称，将它们统一映射到一个标准名称。映射通过修改渠道的 model_mapping 字段实现。"
          type="info"
          showIcon
        />

        <Card styles={{ body: { padding: 0 } }}>
          <Table
          rowKey="modelName"
          columns={columns}
          dataSource={filteredModelNames}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 个模型` }}
          rowSelection={{
            selectedRowKeys: selectedModelNames,
            onChange: (keys) => setSelectedModelNames(keys as string[]),
          }}
        />
        </Card>

        {selectedModelNames.length >= 2 && (
          <Card style={{ background: '#fafafa' }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="已选模型名称">
                  <Space wrap>
                    {selectedModelNames.map((name) => (
                      <Tag key={name} color="processing">{name}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>

              <Space>
                <Text>目标标准名称：</Text>
                <Input
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  placeholder="输入或从下方选择"
                  style={{ width: 300 }}
                />
              </Space>

              <Space wrap>
                <Text type="secondary">快速选择：</Text>
                {selectedModelNames.map((name) => (
                  <Button
                    key={name}
                    size="small"
                    type={targetName === name ? 'primary' : 'default'}
                    onClick={() => setTargetName(name)}
                  >
                    {name}
                  </Button>
                ))}
              </Space>

              <Button
                type="primary"
                icon={<EyeOutlined />}
                onClick={buildPreview}
                disabled={!targetName.trim()}
              >
                预览映射变更
              </Button>
            </Space>
          </Card>
        )}
      </Space>

      <Modal
        title={<><SwapOutlined /> 映射变更预览</>}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={700}
        footer={[
          <Button key="cancel" onClick={() => setPreviewVisible(false)}>
            取消
          </Button>,
          <Button
            key="execute"
            type="primary"
            loading={executing}
            onClick={executeMapping}
          >
            确认执行 ({previewData.length} 个渠道)
          </Button>,
        ]}
      >
        <Alert
          message={`将为 ${previewData.length} 个渠道添加模型名称映射`}
          description={
            <Space direction="vertical" size={2}>
              {selectedModelNames
                .filter((n) => n !== targetName)
                .map((n) => (
                  <Text key={n}>
                    <Text code>{n}</Text> → <Text code>{targetName}</Text>
                  </Text>
                ))}
            </Space>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          rowKey="channelId"
          columns={previewColumns}
          dataSource={previewData}
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
        />
      </Modal>
    </Spin>
  );
}
