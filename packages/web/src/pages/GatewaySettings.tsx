import React, { useState, useEffect, useCallback } from 'react';
import { Card, Switch, Input, Button, Table, Typography, Space, Spin, message, Tag, Tooltip } from 'antd';
import { CopyOutlined, ReloadOutlined, KeyOutlined } from '@ant-design/icons';
import { getGatewaySettings, updateGatewaySettings, getGatewayModels } from '../api/client';

const { Title, Text, Paragraph } = Typography;

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'sk-gw-';
  for (let i = 0; i < 40; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export default function GatewaySettings() {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [models, setModels] = useState<Array<{ id: string; sources: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getGatewaySettings();
      if (res.success && res.data) {
        setEnabled(res.data.enabled);
        setApiKey(res.data.apiKey ?? '');
      }
    } catch {
      message.error('加载网关设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      setModelsLoading(true);
      const res = await getGatewayModels();
      if (res.success && res.data) {
        setModels(res.data);
      }
    } catch {
      message.error('加载模型列表失败');
    } finally {
      setModelsLoading(false);
    }
  }, []);
// PLACEHOLDER_EFFECTS

  useEffect(() => { loadSettings(); loadModels(); }, [loadSettings, loadModels]);

  const handleToggle = async (checked: boolean) => {
    try {
      setSaving(true);
      await updateGatewaySettings({ enabled: checked });
      setEnabled(checked);
      message.success(checked ? '网关已启用' : '网关已禁用');
    } catch {
      message.error('更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      message.warning('请输入或生成 API Key');
      return;
    }
    try {
      setSaving(true);
      await updateGatewaySettings({ apiKey: apiKey.trim() });
      message.success('API Key 已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = () => {
    setApiKey(generateApiKey());
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  const gatewayUrl = `${window.location.protocol}//${window.location.host}/v1`;

  const modelColumns = [
    { title: '模型 ID', dataIndex: 'id', key: 'id', ellipsis: true },
    {
      title: '可用源数',
      dataIndex: 'sources',
      key: 'sources',
      width: 100,
      render: (v: number) => <Tag color={v > 1 ? 'green' : 'default'}>{v}</Tag>,
    },
  ];

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <Spin size="large" />
    </div>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Title level={4} style={{ margin: 0 }}>API 网关</Title>
      <Paragraph type="secondary">
        将本系统作为 OpenAI 兼容的 API 网关，根据模型和成本自动选择最优渠道源转发请求。
      </Paragraph>

      <Card size="small">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text strong>启用网关</Text>
            <Switch checked={enabled} onChange={handleToggle} loading={saving} />
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>API Key</Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="输入或生成 API Key"
                prefix={<KeyOutlined />}
              />
              <Button onClick={handleGenerate}>生成</Button>
              <Button onClick={handleSaveKey} type="primary" loading={saving}>保存</Button>
            </Space.Compact>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>网关地址</Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input value={gatewayUrl} readOnly />
              <Tooltip title="复制">
                <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(gatewayUrl)} />
              </Tooltip>
            </Space.Compact>
          </div>

          {apiKey && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>快速配置</Text>
              <Paragraph code copyable style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
{`Base URL: ${gatewayUrl}
API Key: ${apiKey}`}
              </Paragraph>
            </div>
          )}
        </Space>
      </Card>

      <Card
        size="small"
        title={`可用模型 (${models.length})`}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadModels} loading={modelsLoading}>刷新</Button>}
      >
        <Table
          dataSource={models}
          columns={modelColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 个模型` }}
          loading={modelsLoading}
        />
      </Card>
    </Space>
  );
}
