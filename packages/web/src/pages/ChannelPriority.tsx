import { Card, Tabs, Typography } from 'antd';
import {
  CalculatorOutlined,
  BarChartOutlined,
  SettingOutlined,
  FileTextOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import PriorityCalculationTab from './channelPriority/PriorityCalculationTab';
import ChannelComparisonTab from './channelPriority/ChannelComparisonTab';
import RulesScheduleTab from './channelPriority/RulesScheduleTab';
import AdjustmentLogsTab from './channelPriority/AdjustmentLogsTab';
import ChannelSourceManagementTab from './channelPriority/ChannelSourceManagementTab';

const { Title } = Typography;

const tabItems = [
  { key: 'source-management', label: '渠道商管理', icon: <ShopOutlined />, children: <ChannelSourceManagementTab /> },
  { key: 'priority-calc', label: '优先级计算', icon: <CalculatorOutlined />, children: <PriorityCalculationTab /> },
  { key: 'channel-compare', label: '渠道对比', icon: <BarChartOutlined />, children: <ChannelComparisonTab /> },
  { key: 'rules-schedule', label: '规则与调度', icon: <SettingOutlined />, children: <RulesScheduleTab /> },
  { key: 'adjustment-logs', label: '调整日志', icon: <FileTextOutlined />, children: <AdjustmentLogsTab /> },
];

export default function ChannelPriority() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        渠道优先级管理
      </Title>
      <Card bordered={false}>
        <Tabs
          defaultActiveKey="source-management"
          items={tabItems.map((item) => ({
            ...item,
            label: (
              <span>
                {item.icon} {item.label}
              </span>
            ),
          }))}
        />
      </Card>
    </div>
  );
}
