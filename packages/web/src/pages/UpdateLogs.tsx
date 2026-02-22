import { useCallback, useEffect } from 'react';
import { Alert, Button, Table, Typography } from 'antd';
import { ReloadOutlined, FileTextOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAppContext } from '../context/AppContext';
import { fetchUpdateLogs } from '../api/client';
import type { UpdateLogEntry, UpdateLogModelDetail } from '@newapi-sync/shared';

const { Title } = Typography;

// ---------------------------------------------------------------------------
// Nested table columns (expanded row)
// ---------------------------------------------------------------------------

const detailColumns: ColumnsType<UpdateLogModelDetail> = [
  {
    title: '模型名',
    dataIndex: 'modelId',
    key: 'modelId',
  },
  {
    title: '旧模型倍率',
    dataIndex: 'oldModelRatio',
    key: 'oldModelRatio',
    render: (v: number) => v.toFixed(4),
  },
  {
    title: '新模型倍率',
    dataIndex: 'newModelRatio',
    key: 'newModelRatio',
    render: (v: number) => v.toFixed(4),
  },
  {
    title: '旧补全倍率',
    dataIndex: 'oldCompletionRatio',
    key: 'oldCompletionRatio',
    render: (v: number) => v.toFixed(4),
  },
  {
    title: '新补全倍率',
    dataIndex: 'newCompletionRatio',
    key: 'newCompletionRatio',
    render: (v: number) => v.toFixed(4),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UpdateLogs() {
  const { state, dispatch } = useAppContext();
  const { logs, loading, error } = state.updateLogs;

  const loadLogs = useCallback(async () => {
    dispatch({ type: 'SET_UPDATE_LOGS', payload: { logs: [], loading: true } });
    try {
      const resp = await fetchUpdateLogs();
      dispatch({
        type: 'SET_UPDATE_LOGS',
        payload: { logs: resp.logs, loading: false },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({
        type: 'SET_UPDATE_LOGS',
        payload: { logs: [], loading: false, error: msg },
      });
    }
  }, [dispatch]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // --- Main table columns ---
  const columns: ColumnsType<UpdateLogEntry> = [
    {
      title: '时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      sorter: (a, b) => dayjs(a.updatedAt).unix() - dayjs(b.updatedAt).unix(),
      defaultSortOrder: 'descend',
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
      width: 200,
    },
    {
      title: '影响模型数量',
      key: 'modelCount',
      width: 150,
      render: (_: unknown, record: UpdateLogEntry) => record.modelsUpdated.length,
      sorter: (a, b) => a.modelsUpdated.length - b.modelsUpdated.length,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        <FileTextOutlined style={{ marginRight: 8 }} />
        更新日志
      </Title>

      <div style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={loadLogs} loading={loading}>
          刷新
        </Button>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="加载更新日志失败"
          description={error}
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      <Table<UpdateLogEntry>
        columns={columns}
        dataSource={logs}
        rowKey={(r) => String(r.id ?? r.updatedAt)}
        loading={loading}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }}
        size="middle"
        expandable={{
          expandedRowRender: (record) => (
            <Table<UpdateLogModelDetail>
              columns={detailColumns}
              dataSource={record.modelsUpdated}
              rowKey={(m) => m.modelId}
              pagination={false}
              size="small"
            />
          ),
        }}
      />
    </div>
  );
}
