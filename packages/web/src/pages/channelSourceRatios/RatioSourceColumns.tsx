import { Space, Tag, Tooltip, Typography } from 'antd';
import { ClockCircleOutlined, DatabaseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { formatRelativeTime, isDataExpired } from '../../utils/helpers';
import type { ComparisonRow, SourceRatioData } from './types';

const { Text } = Typography;

/**
 * Build dynamic table columns for each successfully-fetched source.
 */
export function buildSourceColumns(
  ratioData: SourceRatioData[],
  fetchedTimes: Map<number, string>,
  sourcePriceRates: Map<number, number>,
  showRealCost: boolean,
): ColumnsType<ComparisonRow> {
  return ratioData
    .filter((d) => d.success)
    .map((data) => {
      const fetchedAt = data.fetchedAt || fetchedTimes.get(data.sourceId);
      const isFromCache = data.isFromCache ?? false;
      const expired = fetchedAt ? isDataExpired(fetchedAt) : false;
      const priceRate = sourcePriceRates.get(data.sourceId);

      return {
        title: (
          <Space direction="vertical" size={0}>
            <Space size={4}>
              <Text>{data.sourceName}</Text>
              {isFromCache ? (
                <Tooltip title="数据来自缓存">
                  <Tag icon={<DatabaseOutlined />} color="blue" style={{ margin: 0 }}>缓存</Tag>
                </Tooltip>
              ) : (
                <Tooltip title="实时获取的数据">
                  <Tag icon={<ThunderboltOutlined />} color="green" style={{ margin: 0 }}>实时</Tag>
                </Tooltip>
              )}
            </Space>
            {priceRate && (
              <Tooltip title={`单位成本: 1美元 = ${(1 / priceRate).toFixed(4)}元人民币`}>
                <Tag color="orange" style={{ margin: 0 }}>单位成本 {(1 / priceRate).toFixed(4)}</Tag>
              </Tooltip>
            )}
            {fetchedAt && (
              <Text type="secondary" style={{ fontSize: 11, color: expired ? '#ef4444' : undefined }}>
                <ClockCircleOutlined style={{ marginRight: 2 }} />
                {formatRelativeTime(fetchedAt)}
                {expired && ' (已过期)'}
              </Text>
            )}
          </Space>
        ),
        key: `source-${data.sourceId}`,
        width: showRealCost ? 250 : 200,
        render: (_: unknown, row: ComparisonRow) =>
          renderSourceCell(row, data, priceRate, showRealCost),
      };
    });
}

function renderSourceCell(
  row: ComparisonRow,
  data: SourceRatioData,
  priceRate: number | undefined,
  showRealCost: boolean,
) {
  const ratios = row.sources[data.sourceId];
  if (!ratios) return <Text type="secondary">-</Text>;

  const isPerRequest = ratios.modelPrice !== undefined && ratios.modelPrice > 0;
  const isLowest = row.lowestSourceId === data.sourceId;

  if (isPerRequest) {
    return renderPerRequestCell(ratios, isLowest, showRealCost, priceRate);
  }
  return renderTokenCell(ratios, isLowest, showRealCost, priceRate, data.detectedBasePrice);
}

function renderPerRequestCell(
  ratios: { modelPrice?: number },
  isLowest: boolean,
  showRealCost: boolean,
  priceRate?: number,
) {
  let realCost: number | undefined;
  if (showRealCost && priceRate && priceRate > 0) {
    realCost = ratios.modelPrice! * (1 / priceRate);
  }

  return (
    <Space direction="vertical" size={0}>
      <Text strong={isLowest} style={{ color: isLowest ? '#22c55e' : undefined }}>
        按次计费
        {isLowest && <Tag color="success" style={{ marginLeft: 4 }}>最低</Tag>}
      </Text>
      {!showRealCost ? (
        <Text type="secondary" style={{ fontSize: 12 }}>${ratios.modelPrice!.toFixed(4)}/次</Text>
      ) : realCost !== undefined ? (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>¥{realCost.toFixed(4)}/次</Text>
          <Text type="secondary" style={{ fontSize: 11, color: '#a1a1aa' }}>(${ratios.modelPrice!.toFixed(4)}/次)</Text>
        </>
      ) : (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>${ratios.modelPrice!.toFixed(4)}/次</Text>
          <Text type="warning" style={{ fontSize: 11 }}>(未配置汇率)</Text>
        </>
      )}
    </Space>
  );
}

function renderTokenCell(
  ratios: { modelRatio: number; completionRatio: number },
  isLowest: boolean,
  showRealCost: boolean,
  priceRate?: number,
  detectedBasePrice?: number,
) {
  const basePrice = detectedBasePrice || 0.75;
  const inputPrice = ratios.modelRatio * basePrice;
  const outputPrice = inputPrice * ratios.completionRatio;

  let realInputCost: number | undefined;
  let realOutputCost: number | undefined;
  if (showRealCost && priceRate && priceRate > 0) {
    const unitCost = 1 / priceRate;
    realInputCost = inputPrice * unitCost;
    realOutputCost = outputPrice * unitCost;
  }

  return (
    <Space direction="vertical" size={0}>
      <Text strong={isLowest} style={{ color: isLowest ? '#22c55e' : undefined }}>
        倍率: {ratios.modelRatio.toFixed(4)}
        {isLowest && <Tag color="success" style={{ marginLeft: 4 }}>最低</Tag>}
      </Text>
      {!showRealCost ? (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>输入: ${inputPrice.toFixed(4)}/M</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>输出: ${outputPrice.toFixed(4)}/M</Text>
        </>
      ) : realInputCost !== undefined && realOutputCost !== undefined ? (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>输入: ¥{realInputCost.toFixed(4)}/M</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>输出: ¥{realOutputCost.toFixed(4)}/M</Text>
          <Text type="secondary" style={{ fontSize: 11, color: '#a1a1aa' }}>(${inputPrice.toFixed(4)}/M)</Text>
        </>
      ) : (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>输入: ${inputPrice.toFixed(4)}/M</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>输出: ${outputPrice.toFixed(4)}/M</Text>
          <Text type="warning" style={{ fontSize: 11 }}>(未配置汇率)</Text>
        </>
      )}
      <Text type="secondary" style={{ fontSize: 12 }}>补全倍率: {ratios.completionRatio.toFixed(2)}</Text>
      {detectedBasePrice && (
        <Text type="secondary" style={{ fontSize: 11, color: '#a1a1aa' }}>(基础价 ${basePrice.toFixed(2)})</Text>
      )}
    </Space>
  );
}
