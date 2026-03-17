import { useState, useCallback, useEffect } from 'react';
import {
  Button, Checkbox, Descriptions, Radio, Space, Spin, Table, Tag, Tooltip, Typography, Alert, Empty, message,
} from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SplitPreview as SplitPreviewType, ParentChannelAction } from '@newapi-sync/shared';
import { previewSplit } from '../../api/client';
import type { SplitSelection, SplitExecution } from './types';

const { Text } = Typography;

interface Props {
  connection: any;
  selection: SplitSelection | null;
  onNext: (execution: SplitExecution) => void;
  onBack: () => void;
}

export default function SplitPreviewTab({ connection, selection, onNext, onBack }: Props) {
  const [preview, setPreview] = useState<SplitPreviewType | null>(null);
  const [loading, setLoading] = useState(false);
  const [parentAction, setParentAction] = useState<ParentChannelAction>('disable');
  const [autoPriority, setAutoPriority] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!selection) { setError('请先选择要拆分的渠道'); message.warning('请先选择要拆分的渠道'); return; }
    setLoading(true); setError(null);
    try {
      const resp = await previewSplit(connection, selection.channelIds, selection.modelFilters);
      if (resp.success && resp.data) setPreview(resp.data);
      else { const msg = resp.error || '生成预览失败'; setError(msg); message.error(msg); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); message.error(`生成预览失败: ${msg}`);
    } finally { setLoading(false); }
  }, [connection, selection]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  if (loading) return <Spin tip="正在生成预览..." />;
  if (error) return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert message="生成预览失败" description={error} type="error" showIcon />
      <Space><Button onClick={onBack}>返回上一步</Button><Button type="primary" onClick={loadPreview}>重新生成预览</Button></Space>
    </Space>
  );
  if (!preview) return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Empty description="暂无预览数据" /><Button onClick={loadPreview}>生成预览</Button>
    </Space>
  );

  const subChannelColumns: ColumnsType<any> = [
    { title: '子渠道名称', dataIndex: 'name', key: 'name', render: (name: string, record: any) => <Space><Text>{name}</Text>{record.nameConflict && <Tag color="warning">名称冲突</Tag>}</Space> },
    { title: '模型', dataIndex: 'modelId', key: 'modelId' },
    { title: '父渠道', dataIndex: 'parentChannelName', key: 'parentChannelName' },
    { title: '建议优先级', dataIndex: 'suggestedPriority', key: 'suggestedPriority', render: (p: number | undefined) => p ?? '-' },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {preview.validationErrors.length > 0 && (
        <Alert message="配置验证失败" description={<ul>{preview.validationErrors.map((err: string, idx: number) => <li key={idx}>{err}</li>)}</ul>} type="error" showIcon />
      )}
      <Descriptions bordered column={2}>
        <Descriptions.Item label="父渠道数量">{preview.parentChannels.length}</Descriptions.Item>
        <Descriptions.Item label="将创建子渠道">{preview.totalSubChannels}</Descriptions.Item>
        <Descriptions.Item label="名称冲突">{preview.nameConflicts}</Descriptions.Item>
      </Descriptions>
      <div>
        <Text strong>父渠道处理方式：</Text>
        <Radio.Group value={parentAction} onChange={(e) => setParentAction(e.target.value)}>
          <Tooltip title="拆分后禁用原渠道，保留记录但不再使用"><Radio value="disable">禁用父渠道（推荐）</Radio></Tooltip>
          <Tooltip title="拆分后保留原渠道不变"><Radio value="keep">保留父渠道</Radio></Tooltip>
          <Tooltip title="拆分后永久删除原渠道，不可恢复"><Radio value="delete">删除父渠道</Radio></Tooltip>
        </Radio.Group>
        <div style={{ marginTop: 8 }}>
          <Tooltip title="根据渠道的实际成本自动为子渠道分配优先级">
            <Checkbox checked={autoPriority} onChange={(e) => setAutoPriority(e.target.checked)}>自动计算并分配优先级</Checkbox>
          </Tooltip>
        </div>
      </div>
      <Table columns={subChannelColumns} dataSource={preview.subChannels} rowKey={(r) => `${r.parentChannelId}-${r.modelId}`} pagination={{ pageSize: 20 }} />
      <Space>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => onNext({ preview, options: { parentAction, autoPriority } })} disabled={preview.validationErrors.length > 0}>执行拆分</Button>
        <Button onClick={loadPreview}>重新生成预览</Button>
      </Space>
    </Space>
  );
}
