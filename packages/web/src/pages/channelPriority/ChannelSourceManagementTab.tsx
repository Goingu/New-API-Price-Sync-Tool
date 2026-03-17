import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Space, message, Tag, Table, Spin, Input, Card, Statistic, Row, Col, Typography } from 'antd';
import { ReloadOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../../context/AppContext';
import { fetchChannels, getChannelSources } from '../../api/client';
import type { Channel, ChannelSource } from '@newapi-sync/shared';
import { normalizeBaseUrl } from '../../utils/channelUrl';
import ModelSelectorModal from '../../components/ModelSelectorModal';
import type { SourceGroup } from './types';

const { Text } = Typography;

export default function ChannelSourceManagementTab() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [sources, setSources] = useState<ChannelSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  const loadData = useCallback(async () => {
    if (!connection) return;
    setLoading(true);
    try {
      const [channelResp, sourcesResp] = await Promise.all([
        fetchChannels(connection),
        getChannelSources(),
      ]);
      if (channelResp.success && channelResp.data) setChannels(channelResp.data);
      if (sourcesResp.success) setSources(sourcesResp.sources);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`加载数据失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenModelSelector = (channel: Channel) => {
    setSelectedChannel(channel);
    setModelSelectorVisible(true);
  };

  const handleCloseModelSelector = () => {
    setModelSelectorVisible(false);
    setSelectedChannel(null);
  };

  const sourceGroups = useMemo((): SourceGroup[] => {
    const sourceByUrl = new Map<string, ChannelSource>();
    for (const source of sources) {
      const normalized = normalizeBaseUrl(source.baseUrl);
      if (normalized) sourceByUrl.set(normalized, source);
    }

    const groups = new Map<string, { source: ChannelSource | null; channels: Channel[] }>();
    for (const ch of channels) {
      const rawUrl = ch.base_url?.trim() || (ch.key?.trim() && /^https?:\/\//i.test(ch.key) ? ch.key.trim() : null);
      const normalized = normalizeBaseUrl(rawUrl ?? undefined);
      const groupKey = normalized || `__type_${ch.type}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { source: normalized ? sourceByUrl.get(normalized) ?? null : null, channels: [] });
      }
      groups.get(groupKey)!.channels.push(ch);
    }

    const result: SourceGroup[] = [];
    for (const [key, { source, channels: groupChannels }] of groups) {
      const modelSet = new Set<string>();
      for (const ch of groupChannels) {
        if (!ch.models) continue;
        ch.models.split(',').map((m) => m.trim()).filter(Boolean).forEach((m) => modelSet.add(m));
      }
      const models = Array.from(modelSet).sort();
      result.push({
        key, sourceName: source?.name ?? groupChannels[0]?.name ?? key,
        baseUrl: source?.baseUrl ?? key, channelCount: groupChannels.length,
        modelCount: models.length, models, channels: groupChannels,
        isOwnInstance: source?.isOwnInstance,
      });
    }
    result.sort((a, b) => b.modelCount - a.modelCount);
    return result;
  }, [channels, sources]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return sourceGroups;
    const q = search.toLowerCase();
    return sourceGroups.filter((g) => g.sourceName.toLowerCase().includes(q) || g.baseUrl.toLowerCase().includes(q) || g.models.some((m) => m.toLowerCase().includes(q)));
  }, [sourceGroups, search]);

  const totalModels = useMemo(() => {
    const allModels = new Set<string>();
    sourceGroups.forEach((g) => g.models.forEach((m) => allModels.add(m)));
    return allModels.size;
  }, [sourceGroups]);

  const groupColumns: ColumnsType<SourceGroup> = [
    {
      title: '渠道商名称', dataIndex: 'sourceName', key: 'sourceName', width: 200,
      render: (name: string, record) => (
        <Space><Text strong>{name}</Text>{record.isOwnInstance && <Tag color="blue">自有实例</Tag>}</Space>
      ),
    },
    {
      title: 'Base URL', dataIndex: 'baseUrl', key: 'baseUrl', ellipsis: true,
      render: (url: string) => url.startsWith('__type_') ? <Text type="secondary">未知</Text> : url,
    },
    { title: '渠道数', dataIndex: 'channelCount', key: 'channelCount', width: 100, sorter: (a, b) => a.channelCount - b.channelCount },
    {
      title: '模型数', dataIndex: 'modelCount', key: 'modelCount', width: 100,
      sorter: (a, b) => a.modelCount - b.modelCount, defaultSortOrder: 'descend',
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
  ];

  if (!connection) {
    return <div style={{ padding: 24, textAlign: 'center' }}><Text type="warning">请先在设置页面配置 New API 连接信息</Text></div>;
  }

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Row gutter={16}>
          <Col span={8}><Card size="small"><Statistic title="渠道商数量" value={sourceGroups.length} /></Card></Col>
          <Col span={8}><Card size="small"><Statistic title="渠道总数" value={channels.length} /></Card></Col>
          <Col span={8}><Card size="small"><Statistic title="模型总数（去重）" value={totalModels} /></Card></Col>
        </Row>
        <Space>
          <Input placeholder="搜索渠道商名称、URL 或模型名" prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} allowClear style={{ width: 360 }} />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
        <Table<SourceGroup>
          columns={groupColumns} dataSource={filteredGroups} rowKey="key" size="middle"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 个渠道商` }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as React.Key[]),
            expandedRowRender: (record) => (
              <div style={{ padding: '8px 0' }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>渠道列表（{record.channelCount} 个）</Text>
                <Table<Channel>
                  columns={[
                    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
                    { title: '渠道名称', dataIndex: 'name', key: 'name', width: 200 },
                    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: number) => s === 1 ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag> },
                    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 80 },
                    { title: '模型数', key: 'modelCount', width: 80, render: (_: unknown, ch: Channel) => ch.models?.split(',').filter(Boolean).length ?? 0 },
                    { title: '操作', key: 'actions', width: 120, render: (_: unknown, ch: Channel) => (
                      <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleOpenModelSelector(ch)}>添加模型</Button>
                    )},
                  ]}
                  dataSource={record.channels} rowKey="id" size="small" pagination={false}
                />
                <Text strong style={{ display: 'block', margin: '16px 0 8px' }}>支持的模型（{record.modelCount} 个）</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {record.models.map((m) => <Tag key={m}>{m}</Tag>)}
                </div>
              </div>
            ),
          }}
        />
      </Space>
      {selectedChannel && connection && (
        <ModelSelectorModal
          visible={modelSelectorVisible} channelId={selectedChannel.id} channelName={selectedChannel.name}
          currentModels={selectedChannel.models ? selectedChannel.models.split(',').map(m => m.trim()) : []}
          connection={connection} onClose={handleCloseModelSelector} onSuccess={loadData}
        />
      )}
    </Spin>
  );
}
