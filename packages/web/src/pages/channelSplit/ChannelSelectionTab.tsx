import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Space, message, Tag, Spin, Checkbox, Select, Input, Empty, Alert,
} from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Channel } from '@newapi-sync/shared';
import { fetchChannels } from '../../api/client';
import type { SplitSelection } from './types';

const { Search } = Input;

interface Props {
  connection: any;
  onNext: (selection: SplitSelection) => void;
}

export default function ChannelSelectionTab({ connection, onNext }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const [searchText, setSearchText] = useState('');

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetchChannels(connection);
      if (resp.success && resp.data) setChannels(resp.data);
    } catch (err: unknown) {
      message.error(`加载渠道失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const allModels = useMemo(() => {
    const modelSet = new Set<string>();
    for (const ch of channels) {
      (ch.models?.split(',').filter(Boolean) || []).forEach((m) => modelSet.add(m.trim()));
    }
    return Array.from(modelSet).sort();
  }, [channels]);

  const filteredChannels = useMemo(() => {
    if (selectedModels.length === 0) return [];
    return channels.filter((ch) => {
      const models = ch.models?.split(',').filter(Boolean).map((m) => m.trim()) || [];
      if (models.length <= 1) return false;
      if (!selectedModels.some((sm) => models.includes(sm))) return false;
      if (searchText && !ch.name.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [channels, selectedModels, searchText]);

  const columns: ColumnsType<Channel> = useMemo(() => [
    {
      title: '选择', key: 'select', width: 60,
      render: (_, record) => (
        <Checkbox
          checked={selectedChannelIds.includes(record.id)}
          onChange={(e) => {
            setSelectedChannelIds(e.target.checked
              ? [...selectedChannelIds, record.id]
              : selectedChannelIds.filter((id) => id !== record.id));
          }}
        />
      ),
    },
    { title: '渠道名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'type', key: 'type', width: 120, render: (type: number) => <Tag>{type}</Tag> },
    {
      title: '支持的模型', key: 'models',
      render: (_, record) => {
        const models = record.models?.split(',').filter(Boolean).map((m) => m.trim()) || [];
        return <Space wrap>{models.map((m) => <Tag key={m} color={selectedModels.includes(m) ? 'blue' : 'default'}>{m}</Tag>)}</Space>;
      },
    },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 100 },
  ], [selectedChannelIds, selectedModels]);

  const handleNext = () => {
    if (selectedModels.length === 0) { message.warning('请先选择要拆分的模型'); return; }
    if (selectedChannelIds.length === 0) { message.warning('请选择要拆分的渠道'); return; }
    const modelFilters: Record<number, string[]> = {};
    for (const channelId of selectedChannelIds) modelFilters[channelId] = selectedModels;
    onNext({ channelIds: selectedChannelIds, modelFilters });
  };

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert message="拆分流程" description="第一步：选择要拆分的模型；第二步：选择包含这些模型的渠道进行拆分" type="info" showIcon />
        <div style={{ marginBottom: 16 }}>
          <strong>第一步：选择要拆分的模型</strong>
          <Select mode="multiple" placeholder="请选择要拆分的模型" style={{ width: '100%', marginTop: 8 }} value={selectedModels}
            onChange={(value) => { setSelectedModels(value); setSelectedChannelIds([]); }}
            options={allModels.map((m) => ({ label: m, value: m }))} showSearch
            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          />
        </div>
        {selectedModels.length > 0 && (
          <div>
            <strong>第二步：选择要拆分的渠道</strong>
            <Space style={{ marginTop: 8, marginBottom: 8 }}>
              <Search placeholder="搜索渠道名称" value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: 300 }} />
              <Button icon={<ReloadOutlined />} onClick={loadChannels}>刷新</Button>
            </Space>
            {filteredChannels.length === 0 ? (
              <Empty description="没有找到包含所选模型的多模型渠道" />
            ) : (
              <>
                <Alert message={`找到 ${filteredChannels.length} 个包含所选模型的多模型渠道`} type="info" showIcon style={{ marginBottom: 8 }} />
                <Table columns={columns} dataSource={filteredChannels} rowKey="id" pagination={{ pageSize: 10 }} />
              </>
            )}
          </div>
        )}
        <Button type="primary" icon={<EyeOutlined />} disabled={selectedModels.length === 0 || selectedChannelIds.length === 0} onClick={handleNext}>
          生成预览 ({selectedChannelIds.length} 个渠道)
        </Button>
      </Space>
    </Spin>
  );
}
