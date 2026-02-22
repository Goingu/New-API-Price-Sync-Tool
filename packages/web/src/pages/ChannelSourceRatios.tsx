import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
  CheckOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ChannelSource, RatioConfig } from '@newapi-sync/shared';
import { useAppContext } from '../context/AppContext';
import {
  getChannelSources,
  compareChannelSourceRatios,
  proxyForward,
} from '../api/client';

const { Title, Text } = Typography;

interface SourceRatioData {
  sourceId: number;
  sourceName: string;
  success: boolean;
  ratioConfig?: RatioConfig;
  error?: string;
}

interface ComparisonRow {
  modelId: string;
  sources: Record<number, { modelRatio: number; completionRatio: number }>;
  lowestSourceId?: number;
  lowestRatio?: number;
}

export default function ChannelSourceRatios() {
  const { state } = useAppContext();
  const { settings } = state.connection;

  const [sources, setSources] = useState<ChannelSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const [ratioData, setRatioData] = useState<SourceRatioData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState('');
  const [markupPercent, setMarkupPercent] = useState(20); // Default 20% markup
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [showUnsetOnly, setShowUnsetOnly] = useState(false);
  const [ownedModels, setOwnedModels] = useState<Set<string>>(new Set());
  const [loadingOwned, setLoadingOwned] = useState(false);

  // Fetch channel sources
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const resp = await getChannelSources();
        if (resp.success) {
          setSources(resp.sources.filter((s) => s.enabled));
        }
      } catch (err) {
        console.error('Failed to fetch channel sources:', err);
      }
    };
    fetchSources();
  }, []);

  // Fetch and compare ratios
  const fetchRatios = useCallback(async () => {
    if (selectedSourceIds.length === 0) {
      message.warning('请至少选择一个渠道源');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const resp = await compareChannelSourceRatios(selectedSourceIds);
      console.log('Compare ratios response:', resp);

      if (resp.success) {
        console.log('Ratio data:', resp.results);
        setRatioData(resp.results);

        const failedCount = resp.results.filter((r) => !r.success).length;
        const successCount = resp.results.filter((r) => r.success).length;

        console.log(`Success: ${successCount}, Failed: ${failedCount}`);

        if (failedCount > 0) {
          message.warning(`${successCount} 个成功，${failedCount} 个失败`);
        } else {
          message.success('获取成功');
        }

        // Auto-fetch owned models when showing unset only
        if (showUnsetOnly && ownedModels.size === 0) {
          fetchOwnedModels();
        }
      } else {
        setError('获取倍率失败');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Fetch ratios error:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedSourceIds, showUnsetOnly, ownedModels.size]);

  // Fetch owned models from user's instance
  const fetchOwnedModels = useCallback(async () => {
    if (!settings) return;
    setLoadingOwned(true);
    try {
      const resp = await proxyForward<{ success: boolean; data: Array<{ model_name: string }> }>(
        settings,
        'GET',
        '/api/pricing'
      );
      if (resp.success && resp.data?.data) {
        const models = new Set<string>();
        resp.data.data.forEach((item) => {
          if (item.model_name) {
            models.add(item.model_name);
          }
        });
        setOwnedModels(models);
      }
    } catch (err) {
      console.error('Failed to fetch owned models:', err);
    } finally {
      setLoadingOwned(false);
    }
  }, [settings]);

  // Build comparison rows
  const comparisonRows = useMemo(() => {
    console.log('Building comparison rows from ratioData:', ratioData);

    const modelMap = new Map<string, ComparisonRow>();

    for (const data of ratioData) {
      console.log(`Processing source ${data.sourceName}:`, data);

      if (!data.success || !data.ratioConfig) {
        console.log(`Skipping ${data.sourceName}: success=${data.success}, hasConfig=${!!data.ratioConfig}`);
        continue;
      }

      console.log(`${data.sourceName} has ${Object.keys(data.ratioConfig.modelRatio).length} models`);

      for (const [modelId, modelRatio] of Object.entries(data.ratioConfig.modelRatio)) {
        if (!modelMap.has(modelId)) {
          modelMap.set(modelId, {
            modelId,
            sources: {},
          });
        }

        const row = modelMap.get(modelId)!;
        row.sources[data.sourceId] = {
          modelRatio,
          completionRatio: data.ratioConfig.completionRatio[modelId] ?? 1,
        };
      }
    }

    console.log(`Total unique models: ${modelMap.size}`);

    // Find lowest ratio for each model
    const rows = Array.from(modelMap.values());
    for (const row of rows) {
      let lowestRatio = Infinity;
      let lowestSourceId: number | undefined;

      for (const [sourceId, ratios] of Object.entries(row.sources)) {
        if (ratios.modelRatio < lowestRatio) {
          lowestRatio = ratios.modelRatio;
          lowestSourceId = parseInt(sourceId, 10);
        }
      }

      row.lowestSourceId = lowestSourceId;
      row.lowestRatio = lowestRatio;
    }

    console.log('Final comparison rows:', rows.slice(0, 3));

    return rows;
  }, [ratioData]);

  // Filter by search
  const filteredRows = useMemo(() => {
    if (!search.trim() && !showUnsetOnly) return comparisonRows;

    let filtered = comparisonRows;

    // Filter by search text
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) => r.modelId.toLowerCase().includes(q));
    }

    // Filter by unset ratios (owned but not configured)
    if (showUnsetOnly && ownedModels.size > 0 && state.currentRatios.data) {
      const configuredModels = new Set(Object.keys(state.currentRatios.data.modelRatio));
      filtered = filtered.filter((r) =>
        ownedModels.has(r.modelId) && !configuredModels.has(r.modelId)
      );
    }

    return filtered;
  }, [comparisonRows, search, showUnsetOnly, ownedModels, state.currentRatios.data]);

  // Apply ratios to own instance
  const handleApplyRatios = useCallback(async () => {
    if (!settings) {
      message.error('请先配置 New API 连接');
      return;
    }

    if (selectedModels.size === 0) {
      message.warning('请至少选择一个模型');
      return;
    }

    setApplying(true);
    try {
      // Get current ratios
      const currentResp = await proxyForward<{ data: any }>(settings, 'GET', '/api/ratio_config');
      if (!currentResp.success || !currentResp.data) {
        throw new Error('获取当前倍率失败');
      }

      const apiData = currentResp.data.data || currentResp.data;
      const currentConfig: RatioConfig = {
        modelRatio: apiData.model_ratio || apiData.modelRatio || {},
        completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
      };

      // Apply selected models' ratios with markup
      const markup = 1 + markupPercent / 100;
      let updateCount = 0;

      for (const modelId of selectedModels) {
        const row = comparisonRows.find((r) => r.modelId === modelId);
        if (!row || !row.lowestSourceId) continue;

        const lowestRatios = row.sources[row.lowestSourceId];

        // Validate ratios before applying
        if (lowestRatios.modelRatio <= 0) {
          console.warn(`Skipping ${modelId}: invalid modelRatio ${lowestRatios.modelRatio}`);
          continue;
        }

        currentConfig.modelRatio[modelId] = lowestRatios.modelRatio * markup;
        // Use 1 as default if completionRatio is 0 or invalid
        currentConfig.completionRatio[modelId] = lowestRatios.completionRatio > 0
          ? lowestRatios.completionRatio
          : 1;
        updateCount++;
      }

      if (updateCount === 0) {
        message.warning('没有可更新的模型');
        return;
      }

      // Update ratios - send complete config
      const modelRatioStr = JSON.stringify(currentConfig.modelRatio);
      const completionRatioStr = JSON.stringify(currentConfig.completionRatio);

      const totalSize = modelRatioStr.length + completionRatioStr.length;
      console.log(`Updating ${updateCount} models, payload size: ${Math.round(totalSize / 1024)}KB`);

      // Check if payload is too large
      if (totalSize > 100000) {
        throw new Error(`配置数据过大（${Math.round(totalSize / 1024)}KB），请联系管理员`);
      }

      // Send each option separately (New API expects individual objects, not an array)
      const updatePayloads = [
        { key: 'ModelRatio', value: modelRatioStr },
        { key: 'CompletionRatio', value: completionRatioStr },
      ];

      console.log('Sending payloads:', updatePayloads.map(p => ({ key: p.key, valueLength: p.value.length })));

      // Send each payload separately
      for (const payload of updatePayloads) {
        const resp = await proxyForward(settings, 'PUT', '/api/option/', payload);
        console.log(`Update response for ${payload.key}:`, resp);

        if (!resp.success) {
          throw new Error(`更新 ${payload.key} 失败: ${resp.error ?? '未知错误'}`);
        }
      }

      message.success(`成功更新 ${updateCount} 个模型的倍率`);
      setApplyModalVisible(false);
      setSelectedModels(new Set());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`更新失败: ${msg}`);
    } finally {
      setApplying(false);
    }
  }, [settings, selectedModels, comparisonRows, markupPercent]);

  // Table columns
  const columns: ColumnsType<ComparisonRow> = [
    {
      title: '模型名称',
      dataIndex: 'modelId',
      fixed: 'left',
      width: 250,
      sorter: (a, b) => a.modelId.localeCompare(b.modelId),
    },
    ...ratioData
      .filter((d) => d.success)
      .map((data) => ({
        title: data.sourceName,
        key: `source-${data.sourceId}`,
        width: 180,
        render: (_: unknown, row: ComparisonRow) => {
          const ratios = row.sources[data.sourceId];
          if (!ratios) return <Text type="secondary">-</Text>;

          const isLowest = row.lowestSourceId === data.sourceId;
          const inputPrice = ratios.modelRatio * 0.75;
          const outputPrice = inputPrice * ratios.completionRatio;

          return (
            <Space direction="vertical" size={0}>
              <Text strong={isLowest} style={{ color: isLowest ? '#52c41a' : undefined }}>
                倍率: {ratios.modelRatio.toFixed(4)}
                {isLowest && <Tag color="success" style={{ marginLeft: 4 }}>最低</Tag>}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                输入: ${inputPrice.toFixed(4)}/M
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                输出: ${outputPrice.toFixed(4)}/M
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                补全倍率: {ratios.completionRatio.toFixed(2)}
              </Text>
            </Space>
          );
        },
      })),
  ];

  const rowSelection = {
    selectedRowKeys: Array.from(selectedModels),
    onChange: (keys: React.Key[]) => {
      setSelectedModels(new Set(keys as string[]));
    },
  };

  if (!settings) {
    return <Alert type="warning" showIcon message="请先配置 New API 连接" />;
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        渠道源倍率对比
      </Title>

      <Alert
        type="info"
        showIcon
        message="功能说明"
        description="对比多个渠道源（中转商）的倍率配置，找出最便宜的渠道源，并可以一键应用到您的实例。"
        style={{ marginBottom: 16 }}
        closable
      />

      {/* Controls */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
            <Text>选择渠道源:</Text>
            <Select
              mode="multiple"
              placeholder="选择要对比的渠道源"
              style={{ minWidth: 300 }}
              value={selectedSourceIds}
              onChange={setSelectedSourceIds}
              options={sources.map((s) => ({ label: s.name, value: s.id! }))}
            />
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={fetchRatios}
              loading={loading}
              disabled={selectedSourceIds.length === 0}
            >
              获取倍率
            </Button>
          </Space>

          {ratioData.length > 0 && (
            <Space wrap>
              <Input
                placeholder="搜索模型名称"
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                style={{ width: 250 }}
              />
              <Space>
                <Switch
                  checked={showUnsetOnly}
                  onChange={(checked) => {
                    setShowUnsetOnly(checked);
                    if (checked && ownedModels.size === 0) {
                      fetchOwnedModels();
                    }
                  }}
                  loading={loadingOwned}
                />
                <span style={{ fontSize: 14 }}>只看未设置倍率的模型</span>
                <Tooltip title="只显示在您的实例中已启用但还没有配置倍率的模型">
                  <InfoCircleOutlined style={{ color: '#999', cursor: 'help' }} />
                </Tooltip>
              </Space>
              <Button
                type="default"
                icon={<SyncOutlined />}
                disabled={selectedModels.size === 0}
                onClick={() => setApplyModalVisible(true)}
              >
                应用选中的倍率 ({selectedModels.size})
              </Button>
              <Text type="secondary">
                共 {filteredRows.length} 个模型
                {showUnsetOnly && ownedModels.size > 0 && ` (实例中已启用 ${ownedModels.size} 个)`}
              </Text>
            </Space>
          )}
        </Space>
      </Card>

      {/* Error */}
      {error && (
        <Alert
          type="error"
          showIcon
          message="获取失败"
          description={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(undefined)}
        />
      )}

      {/* Failed sources details */}
      {ratioData.length > 0 && ratioData.some((d) => !d.success) && (
        <Alert
          type="warning"
          showIcon
          message="部分渠道源获取失败"
          description={
            <div>
              {ratioData
                .filter((d) => !d.success)
                .map((d) => (
                  <div key={d.sourceId} style={{ marginBottom: 4 }}>
                    <Text strong>{d.sourceName}</Text>: {d.error || '未知错误'}
                  </div>
                ))}
            </div>
          }
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="正在获取倍率数据..." />
        </div>
      )}

      {/* Table */}
      {!loading && ratioData.length > 0 && (
        <Table<ComparisonRow>
          rowKey="modelId"
          columns={columns}
          dataSource={filteredRows}
          rowSelection={rowSelection}
          size="small"
          scroll={{ x: 800 }}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个模型`,
          }}
        />
      )}

      {/* Apply Modal */}
      <Modal
        title="应用倍率到您的实例"
        open={applyModalVisible}
        onCancel={() => setApplyModalVisible(false)}
        onOk={handleApplyRatios}
        confirmLoading={applying}
        okText="确认应用"
        cancelText="取消"
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="info"
            showIcon
            message="操作说明"
            description="系统将使用每个模型的最低倍率（来自最便宜的渠道源），并加上您设置的加价比例，更新到您的 New API 实例。"
          />

          <Space>
            <Text>加价比例:</Text>
            <InputNumber
              value={markupPercent}
              onChange={(v) => setMarkupPercent(v ?? 20)}
              min={0}
              max={200}
              step={5}
              formatter={(value) => `${value}%`}
              parser={(value) => value?.replace('%', '') as unknown as number}
              style={{ width: 120 }}
            />
            <Text type="secondary">
              (在最低倍率基础上加价，例如 20% 表示最终倍率 = 最低倍率 × 1.2)
            </Text>
          </Space>

          <div>
            <Text strong>将要更新 {selectedModels.size} 个模型:</Text>
            <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
              {Array.from(selectedModels).map((modelId) => {
                const row = comparisonRows.find((r) => r.modelId === modelId);
                if (!row || !row.lowestSourceId) return null;

                const lowestRatios = row.sources[row.lowestSourceId];
                const sourceName = ratioData.find((d) => d.sourceId === row.lowestSourceId)?.sourceName;
                const finalRatio = lowestRatios.modelRatio * (1 + markupPercent / 100);

                return (
                  <div key={modelId} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Text>{modelId}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      来源: {sourceName} | 原倍率: {lowestRatios.modelRatio.toFixed(4)} → 最终倍率: {finalRatio.toFixed(4)}
                    </Text>
                  </div>
                );
              })}
            </div>
          </div>
        </Space>
      </Modal>
    </div>
  );
}
