import { Button, Modal, Table, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ComparisonRow, UpdateResult } from '@newapi-sync/shared';

const { Text } = Typography;

interface PreviewModalProps {
  visible: boolean;
  onCancel: () => void;
  onOk: () => void;
  updating: boolean;
  selectedRows: ComparisonRow[];
}

export function UpdatePreviewModal({ visible, onCancel, onOk, updating, selectedRows }: PreviewModalProps) {
  return (
    <Modal title="更新预览" open={visible} onCancel={onCancel} onOk={onOk} okText="确认执行" cancelText="取消" confirmLoading={updating} width={700}>
      <p>即将更新 <Text strong>{selectedRows.length}</Text> 个模型的倍率/价格：</p>
      <Table<ComparisonRow>
        rowKey="modelId" dataSource={selectedRows} size="small" pagination={false} scroll={{ y: 400 }}
        columns={[
          { title: '模型', dataIndex: 'modelId', ellipsis: true },
          { title: '计费类型', width: 80, render: (_: unknown, r: ComparisonRow) => r.pricingType === 'per_request' ? <Tag color="orange">按次</Tag> : <Tag color="blue">按 Token</Tag> },
          { title: '变更详情', render: (_: unknown, r: ComparisonRow) => r.pricingType === 'per_request' ? `$${r.currentPrice?.toFixed(4) ?? 'N/A'}/次 → $${r.newPrice?.toFixed(4) ?? 'N/A'}/次` : `${r.currentRatio?.toFixed(4) ?? 'N/A'} → ${r.newRatio?.toFixed(4) ?? 'N/A'}` },
          { title: '补全倍率', render: (_: unknown, r: ComparisonRow) => r.pricingType === 'per_request' ? <span style={{ color: '#a1a1aa' }}>不适用</span> : `${r.currentCompletionRatio?.toFixed(4) ?? 'N/A'} → ${r.newCompletionRatio?.toFixed(4) ?? 'N/A'}` },
        ]}
      />
    </Modal>
  );
}

interface ResultModalProps {
  visible: boolean;
  onClose: () => void;
  results: UpdateResult[] | null;
}

export function UpdateResultModal({ visible, onClose, results }: ResultModalProps) {
  return (
    <Modal title="更新结果" open={visible} onCancel={onClose} footer={[<Button key="close" onClick={onClose}>关闭</Button>]} width={600}>
      {results && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Tag icon={<CheckOutlined />} color="success">成功: {results.filter((r) => r.success).length}</Tag>
            <Tag icon={<CloseOutlined />} color="error">失败: {results.filter((r) => !r.success).length}</Tag>
          </div>
          <Table<UpdateResult>
            rowKey="modelId" dataSource={results} size="small" pagination={false} scroll={{ y: 400 }}
            columns={[
              { title: '模型', dataIndex: 'modelId', ellipsis: true },
              { title: '状态', dataIndex: 'success', width: 80, render: (ok: boolean) => ok ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag> },
              { title: '错误信息', dataIndex: 'error', ellipsis: true, render: (v?: string) => v ?? '-' },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
