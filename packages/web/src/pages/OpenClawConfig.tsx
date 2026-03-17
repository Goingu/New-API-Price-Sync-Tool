import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Table,
  Card,
  Space,
  Typography,
  message,
  Alert,
  InputNumber,
  Row,
  Col,
  Tooltip,
  Tag,
  Select,
  Segmented,
} from 'antd';
import {
  CloudDownloadOutlined,
  CloudServerOutlined,
  CopyOutlined,
  DownloadOutlined,
  SearchOutlined,
  CheckOutlined,
  StarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../context/AppContext';
import { fetchNewApiModels, getGatewaySettings, getGatewayModels } from '../api/client';

const { Title, Text } = Typography;

type SourceMode = 'gateway' | 'instance';

interface ModelItem {
  id: string;
  owned_by?: string;
}

/** Extract a human-friendly prefix group from a model id, e.g. "gpt-4o-mini-..." → "gpt-4o" */
function getModelPrefix(id: string): string {
  // Common patterns: provider/model, model-version-variant
  const bare = id.includes('/') ? id.split('/').pop()! : id;
  // Take up to the second hyphen-separated segment: gpt-4o, claude-3, gemini-1.5, etc.
  const parts = bare.split('-');
  if (parts.length <= 2) return bare;
  return parts.slice(0, 2).join('-');
}

export default function OpenClawConfig() {
  const { state } = useAppContext();
  const settings = state.connection.settings;

  const [mode, setMode] = useState<SourceMode>('gateway');
  const [providerName, setProviderName] = useState('newapi');
  const [apiKeyEnv, setApiKeyEnv] = useState('NEWAPI_API_KEY');
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [primaryModel, setPrimaryModel] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  const [maxTokens, setMaxTokens] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Gateway-specific state
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [gatewayApiKey, setGatewayApiKey] = useState<string | null>(null);
  const [gatewayChecked, setGatewayChecked] = useState(false);

  // Check gateway status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await getGatewaySettings();
        if (res.success && res.data) {
          setGatewayEnabled(res.data.enabled);
          setGatewayApiKey(res.data.apiKey);
        }
      } catch { /* ignore */ }
      setGatewayChecked(true);
    })();
  }, []);

  // --- Derived data ---

  const ownerFilters = useMemo(() => {
    const owners = [...new Set(models.map((m) => m.owned_by).filter(Boolean))] as string[];
    return owners.sort().map((o) => ({ text: o, value: o }));
  }, [models]);

  const prefixGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    models.forEach((m) => {
      const p = getModelPrefix(m.id);
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(m.id);
    });
    // Only show groups with 2+ models, sorted by count desc
    return [...map.entries()]
      .filter(([, ids]) => ids.length >= 2)
      .sort((a, b) => b[1].length - a[1].length);
  }, [models]);

  const filteredModels = useMemo(() => {
    if (!search) return models;
    const q = search.toLowerCase();
    return models.filter((m) => m.id.toLowerCase().includes(q));
  }, [models, search]);

  const selectedModels = useMemo(
    () => models.filter((m) => selectedKeys.includes(m.id)),
    [models, selectedKeys],
  );

  // Keep primaryModel in sync with selection
  const effectivePrimary = useMemo(() => {
    if (selectedKeys.length === 0) return '';
    if (primaryModel && selectedKeys.includes(primaryModel)) return primaryModel;
    return selectedKeys[0];
  }, [selectedKeys, primaryModel]);

  // --- Config generation ---

  const gatewayUrl = `${window.location.protocol}//${window.location.host}/v1`;

  const configText = useMemo(() => {
    if (selectedModels.length === 0) return '';
    let baseUrl: string;
    let apiKeyValue: string;

    if (mode === 'gateway') {
      baseUrl = gatewayUrl;
      apiKeyValue = gatewayApiKey || `\${${apiKeyEnv}}`;
    } else {
      baseUrl = settings ? settings.baseUrl.replace(/\/+$/, '') + '/v1' : 'https://your-newapi.example.com/v1';
      apiKeyValue = `\${${apiKeyEnv}}`;
    }

    const modelsStr = selectedModels
      .map((m) => {
        const parts = [`id: "${m.id}"`, `name: "${m.id}"`];
        if (contextWindow) parts.push(`contextWindow: ${contextWindow}`);
        if (maxTokens) parts.push(`maxTokens: ${maxTokens}`);
        return `        { ${parts.join(', ')} }`;
      })
      .join(',\n');

    return `{
  agents: {
    defaults: {
      model: { primary: "${providerName}/${effectivePrimary}" },
    },
  },
  models: {
    mode: "merge",
    providers: {
      "${providerName}": {
        baseUrl: "${baseUrl}",
        apiKey: "${apiKeyValue}",
        api: "openai-completions",
        models: [
${modelsStr},
        ],
      },
    },
  },
}`;
  }, [selectedModels, providerName, settings, contextWindow, maxTokens, effectivePrimary, apiKeyEnv, mode, gatewayUrl, gatewayApiKey]);

  // --- Handlers ---

  const handleFetchModels = useCallback(async () => {
    if (mode === 'instance' && !settings) {
      message.error('请先在设置页面配置连接信息');
      return;
    }
    setLoading(true);
    try {
      let list: ModelItem[];
      if (mode === 'gateway') {
        const res = await getGatewayModels();
        if (!res.success || !res.data) throw new Error('获取网关模型失败');
        list = res.data.map((m) => ({ id: m.id })).sort((a, b) => a.id.localeCompare(b.id));
      } else {
        list = (await fetchNewApiModels(settings!))
          .map((m) => ({ id: m.id, owned_by: m.owned_by }))
          .sort((a, b) => a.id.localeCompare(b.id));
      }
      setModels(list);
      message.success(`获取到 ${list.length} 个模型`);
    } catch (e: unknown) {
      message.error('获取模型列表失败: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [settings, mode]);

  // Reset models when switching mode
  useEffect(() => {
    setModels([]);
    setSelectedKeys([]);
  }, [mode]);

  // Auto-fetch on mount when ready
  useEffect(() => {
    if (!gatewayChecked) return;
    if (mode === 'gateway' && gatewayEnabled && models.length === 0) {
      handleFetchModels();
    } else if (mode === 'instance' && settings && models.length === 0) {
      handleFetchModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayChecked]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(configText);
    setCopied(true);
    message.success('已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([configText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openclaw.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePrefixGroup = (prefix: string, ids: string[]) => {
    const allSelected = ids.every((id) => selectedKeys.includes(id));
    if (allSelected) {
      setSelectedKeys((prev) => prev.filter((k) => !ids.includes(k)));
    } else {
      setSelectedKeys((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const columns: ColumnsType<ModelItem> = [
    {
      title: '模型 ID',
      dataIndex: 'id',
      key: 'id',
      ellipsis: true,
      render: (id: string) => (
        <Space size={4}>
          {id}
          {id === effectivePrimary && <StarOutlined style={{ color: '#f59e0b', fontSize: 12 }} />}
        </Space>
      ),
    },
    {
      title: '提供者',
      dataIndex: 'owned_by',
      key: 'owned_by',
      width: 160,
      ellipsis: true,
      filters: ownerFilters,
      onFilter: (value, record) => record.owned_by === value,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>龙虾配置生成</Title>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as SourceMode)}
          options={[
            { label: '网关模式', value: 'gateway', icon: <CloudServerOutlined /> },
            { label: '实例模式', value: 'instance', icon: <CloudDownloadOutlined /> },
          ]}
        />
      </div>

      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
        {mode === 'gateway' ? (
          <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.8 }}>
            <span style={{ fontWeight: 500, color: '#18181b' }}>网关模式使用步骤：</span>
            ① 在「渠道源管理」中确保渠道源已启用、已填写 channelKey、已同步模型倍率
            → ② 在「API 网关」页面启用网关并生成 API Key
            → ③ 回到本页面，获取模型列表并选择需要的模型
            → ④ 复制右侧配置到龙虾配置文件，Base URL 和 API Key 已自动填入，即可使用。
            网关会自动选择成本最低的渠道源转发请求，某个源不可用时自动切换下一个。
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.8 }}>
            <span style={{ fontWeight: 500, color: '#18181b' }}>实例模式使用步骤：</span>
            ① 在「设置」页面配置 New API 实例连接信息
            → ② 获取模型列表并选择需要的模型
            → ③ 复制配置到龙虾配置文件，将 API Key 环境变量设置到系统中即可使用。
            此模式直连单个 New API 实例，不经过网关。
          </Text>
        )}
      </Card>

      {mode === 'gateway' && !gatewayEnabled && gatewayChecked && (
        <Alert
          type="warning"
          message="API 网关未启用，请先到「API 网关」页面启用并配置 API Key"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {mode === 'gateway' && gatewayEnabled && gatewayApiKey && (
        <Alert
          type="success"
          message="网关已就绪 — 龙虾只需配置 Base URL 和 API Key，模型路由和成本优化全自动"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {mode === 'instance' && !settings && (
        <Alert
          type="warning"
          message="请先在设置页面配置 New API 连接信息"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Card size="small" title="模型选择" style={{ marginBottom: 16 }}>
            <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
              <Space>
                <Button
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  loading={loading}
                  onClick={handleFetchModels}
                  disabled={mode === 'instance' ? !settings : !gatewayEnabled}
                >
                  获取模型列表
                </Button>
                <Input
                  placeholder="搜索模型..."
                  prefix={<SearchOutlined />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: 200 }}
                  allowClear
                />
              </Space>
              <Text type="secondary">
                已选 {selectedKeys.length} / {models.length} 个模型
              </Text>
            </Space>

            {/* Quick prefix group selection */}
            {prefixGroups.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>快速选组:</Text>
                <Space size={[4, 4]} wrap>
                  {prefixGroups.slice(0, 20).map(([prefix, ids]) => {
                    const allSelected = ids.every((id) => selectedKeys.includes(id));
                    return (
                      <Tag
                        key={prefix}
                        color={allSelected ? 'blue' : undefined}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => togglePrefixGroup(prefix, ids)}
                      >
                        {prefix} ({ids.length})
                      </Tag>
                    );
                  })}
                </Space>
              </div>
            )}

            <Table
              size="small"
              dataSource={filteredModels}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `共 ${t} 个` }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: (keys) => setSelectedKeys(keys as string[]),
                selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE],
              }}
              scroll={{ y: 480 }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card size="small" title="配置选项" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Provider 名称</Text>
                <Input
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="newapi"
                  style={{ width: '100%' }}
                />
              </div>
              {mode === 'instance' && (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>API Key 环境变量名</Text>
                  <Input
                    value={apiKeyEnv}
                    onChange={(e) => setApiKeyEnv(e.target.value)}
                    placeholder="NEWAPI_API_KEY"
                    addonBefore="${"
                    addonAfter="}"
                    style={{ width: '100%' }}
                  />
                </div>
              )}
              {mode === 'gateway' && gatewayApiKey && (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>网关 API Key（已自动填入配置）</Text>
                  <Input value={gatewayApiKey} readOnly style={{ width: '100%' }} />
                </div>
              )}
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                  主模型 <StarOutlined style={{ color: '#f59e0b', fontSize: 11 }} />
                </Text>
                <Select
                  value={effectivePrimary || undefined}
                  onChange={(v) => setPrimaryModel(v)}
                  placeholder="默认使用第一个选中的模型"
                  style={{ width: '100%' }}
                  allowClear
                  showSearch
                  options={selectedModels.map((m) => ({ label: m.id, value: m.id }))}
                  disabled={selectedModels.length === 0}
                />
              </div>
              <Row gutter={12}>
                <Col span={12}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>contextWindow</Text>
                  <InputNumber
                    value={contextWindow}
                    onChange={(v) => setContextWindow(v)}
                    placeholder="可选"
                    style={{ width: '100%' }}
                    min={1}
                  />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>maxTokens</Text>
                  <InputNumber
                    value={maxTokens}
                    onChange={(v) => setMaxTokens(v)}
                    placeholder="可选"
                    style={{ width: '100%' }}
                    min={1}
                  />
                </Col>
              </Row>
            </Space>
          </Card>

          <Card
            size="small"
            title="配置预览"
            extra={
              <Space>
                <Tooltip title="复制到剪贴板">
                  <Button
                    size="small"
                    icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={handleCopy}
                    disabled={!configText}
                  >
                    复制
                  </Button>
                </Tooltip>
                <Tooltip title="下载 openclaw.json">
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={handleDownload}
                    disabled={!configText}
                  >
                    下载
                  </Button>
                </Tooltip>
              </Space>
            }
          >
            {configText ? (
              <pre
                style={{
                  background: '#fafafa',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 12,
                  lineHeight: 1.6,
                  maxHeight: 520,
                  overflow: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {configText}
              </pre>
            ) : (
              <Text type="secondary">请先获取模型列表并选择模型</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}