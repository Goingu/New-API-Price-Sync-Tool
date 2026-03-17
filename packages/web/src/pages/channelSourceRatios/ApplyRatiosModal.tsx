import { Alert, InputNumber, Modal, Space, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { ComparisonRow, SourceRatioData } from './types';

const { Text } = Typography;

interface Props {
  visible: boolean;
  onCancel: () => void;
  onOk: () => void;
  confirming: boolean;
  selectedModels: Set<string>;
  comparisonRows: ComparisonRow[];
  ratioData: SourceRatioData[];
  markupPercent: number;
  onMarkupChange: (v: number) => void;
}

export default function ApplyRatiosModal({
  visible,
  onCancel,
  onOk,
  confirming,
  selectedModels,
  comparisonRows,
  ratioData,
  markupPercent,
  onMarkupChange,
}: Props) {
  return (
    <Modal
      title="应用倍率到您的实例"
      open={visible}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirming}
      okText="确认应用"
      cancelText="取消"
      width={600}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert
          type="info"
          showIcon
          message="操作说明"
          description="系统将使用每个模型的最低成本配置（按 token 使用倍率，按次计费使用单次价格），并加上您设置的加价比例，更新到您的 New API 实例。"
        />
        <Space>
          <Text>加价比例:</Text>
          <Tooltip title="在渠道源最低倍率基础上加价的百分比，用于覆盖运营成本和利润">
            <InfoCircleOutlined style={{ color: '#a1a1aa', cursor: 'help' }} />
          </Tooltip>
          <InputNumber
            value={markupPercent}
            onChange={(v) => onMarkupChange(v ?? 20)}
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
              const isPerRequest = lowestRatios.modelPrice !== undefined && lowestRatios.modelPrice > 0;
              const finalRatio = lowestRatios.modelRatio * (1 + markupPercent / 100);
              const finalPrice = (lowestRatios.modelPrice ?? 0) * (1 + markupPercent / 100);
              return (
                <div key={modelId} style={{ padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <Text>{modelId}</Text>
                  <br />
                  {isPerRequest ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      来源: {sourceName} | 原价格: {lowestRatios.modelPrice!.toFixed(4)}/次 → 最终价格: {finalPrice.toFixed(4)}/次
                    </Text>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      来源: {sourceName} | 原倍率: {lowestRatios.modelRatio.toFixed(4)} → 最终倍率: {finalRatio.toFixed(4)}
                    </Text>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Space>
    </Modal>
  );
}
