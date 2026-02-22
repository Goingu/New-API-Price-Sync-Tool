import { useCallback, useState, useEffect, useMemo } from 'react';
import { Alert, Button, Card, Col, Row, Spin, Tag, Typography, Space, Descriptions, Table, Modal, Input } from 'antd';
import {
  CloudDownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DatabaseOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '../context/AppContext';
import { fetchPrices } from '../api/client';
import type { ProviderPriceResult, ModelPrice } from '@newapi-sync/shared';

const { Title, Text } = Typography;

export default function FetchPrices() {
  const { state, dispatch } = useAppContext();
  const { results, loading, lastFetchedAt, fromCache } = state.upstreamPrices;
  const [error, setError] = useState<string>();
  const [cachedAt, setCachedAt] = useState<string>();

  const doFetch = useCallback(
    async (forceRefresh: boolean) => {
      setError(undefined);
      dispatch({
        type: 'SET_PRICES',
        payload: { results: [], loading: true, fromCache: false },
      });
      try {
        const resp = await fetchPrices(forceRefresh);
        dispatch({
          type: 'SET_PRICES',
          payload: {
            results: resp.results,
            loading: false,
            lastFetchedAt: new Date().toISOString(),
            fromCache: resp.fromCache,
          },
        });
        if (resp.cachedAt) setCachedAt(resp.cachedAt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        dispatch({
          type: 'SET_PRICES',
          payload: { results: [], loading: false, fromCache: false },
        });
      }
    },
    [dispatch],
  );

  // Auto-load cached prices on mount if no data exists
  useEffect(() => {
    if (results.length === 0 && !loading && !error) {
      doFetch(false);
    }
  }, []); // Only run once on mount

  const totalModels = results.reduce((sum, r) => sum + (r.success ? r.models.length : 0), 0);
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        抓取上游价格
      </Title>

      {/* Action buttons */}
      <Space style={{ marginBottom: 24 }}>
        <Button
          type="primary"
          icon={<CloudDownloadOutlined />}
          size="large"
          loading={loading}
          onClick={() => doFetch(false)}
        >
          抓取价格
        </Button>
        <Button
          icon={<ReloadOutlined />}
          size="large"
          loading={loading}
          onClick={() => doFetch(true)}
        >
          强制刷新
        </Button>
      </Space>

      {/* Loading indicator */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="正在从各厂商获取最新价格数据..." />
        </div>
      )}

      {/* Error */}
      {error && (
        <Alert
          type="error"
          showIcon
          message="价格获取失败"
          description={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(undefined)}
        />
      )}

      {/* Cache status & summary */}
      {!loading && results.length > 0 && (
        <>
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, md: 3 }}
            style={{ marginBottom: 24 }}
          >
            <Descriptions.Item label="数据来源">
              {fromCache ? (
                <Tag icon={<DatabaseOutlined />} color="blue">
                  缓存
                </Tag>
              ) : (
                <Tag color="green">实时获取</Tag>
              )}
            </Descriptions.Item>
            {fromCache && cachedAt && (
              <Descriptions.Item label="缓存时间">
                {new Date(cachedAt).toLocaleString()}
              </Descriptions.Item>
            )}
            {lastFetchedAt && (
              <Descriptions.Item label="获取时间">
                {new Date(lastFetchedAt).toLocaleString()}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="厂商成功/失败">
              <Text type="success">{successCount} 成功</Text>
              {failCount > 0 && (
                <>
                  {' / '}
                  <Text type="danger">{failCount} 失败</Text>
                </>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="模型总数">{totalModels}</Descriptions.Item>
          </Descriptions>

          {/* Provider result cards */}
          <Row gutter={[16, 16]}>
            {results.map((r) => (
              <Col xs={24} sm={12} md={8} lg={6} key={r.provider}>
                <ProviderCard result={r} />
              </Col>
            ))}
          </Row>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: provider result card
// ---------------------------------------------------------------------------

function ProviderCard({ result }: { result: ProviderPriceResult }) {
  const { provider, success, models, error, fetchedAt } = result;
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');

  const filteredModels = useMemo(() => {
    if (!searchText.trim()) return models;
    const q = searchText.toLowerCase();
    return models.filter((m) => m.modelId.toLowerCase().includes(q));
  }, [models, searchText]);

  const columns: ColumnsType<ModelPrice> = [
    {
      title: '模型名称',
      dataIndex: 'modelId',
      key: 'modelId',
      width: 300,
      ellipsis: true,
    },
    {
      title: '输入价格 (USD/1M tokens)',
      dataIndex: 'inputPricePerMillion',
      key: 'inputPricePerMillion',
      align: 'right',
      render: (price: number) => `$${price.toFixed(4)}`,
    },
    {
      title: '输出价格 (USD/1M tokens)',
      dataIndex: 'outputPricePerMillion',
      key: 'outputPricePerMillion',
      align: 'right',
      render: (price: number) => `$${price.toFixed(4)}`,
    },
  ];

  return (
    <>
      <Card
        title={provider}
        size="small"
        extra={
          success ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              成功
            </Tag>
          ) : (
            <Tag icon={<CloseCircleOutlined />} color="error">
              失败
            </Tag>
          )
        }
      >
        {success ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text>
              模型数量: <Text strong>{models.length}</Text>
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              获取时间: {new Date(fetchedAt).toLocaleString()}
            </Text>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setModalVisible(true)}
              style={{ padding: 0, marginTop: 8 }}
            >
              查看价格详情
            </Button>
          </Space>
        ) : (
          <Text type="danger">{error ?? '未知错误'}</Text>
        )}
      </Card>

      <Modal
        title={`${provider} 价格详情`}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSearchText('');
        }}
        footer={null}
        width={800}
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="搜索模型名称..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {filteredModels.length === models.length
              ? `共 ${models.length} 个模型`
              : `找到 ${filteredModels.length} 个模型（共 ${models.length} 个）`}
          </Text>
        </Space>
        <Table<ModelPrice>
          columns={columns}
          dataSource={filteredModels}
          rowKey="modelId"
          size="small"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个模型`,
          }}
          scroll={{ y: 400 }}
        />
      </Modal>
    </>
  );
}
