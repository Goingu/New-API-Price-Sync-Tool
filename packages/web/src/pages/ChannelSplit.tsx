import { useState } from 'react';
import { Card, Tabs, Typography, Alert } from 'antd';
import {
  SplitCellsOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  BulbOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAppContext } from '../context/AppContext';
import type { SplitSelection, SplitExecution } from './channelSplit/types';
import ChannelSelectionTab from './channelSplit/ChannelSelectionTab';
import SplitPreviewTab from './channelSplit/SplitPreviewTab';
import ExecutionResultTab from './channelSplit/ExecutionResultTab';
import SplitHistoryTab from './channelSplit/SplitHistoryTab';
import SmartSuggestionsTab from './channelSplit/SmartSuggestionsTab';
import ConfigManagementTab from './channelSplit/ConfigManagementTab';

const { Title, Text } = Typography;

export default function ChannelSplit() {
  const { state } = useAppContext();
  const connection = state.connection.settings;

  const [activeTab, setActiveTab] = useState('select');
  const [splitSelection, setSplitSelection] = useState<SplitSelection | null>(null);
  const [splitExecution, setSplitExecution] = useState<SplitExecution | null>(null);

  if (!connection) {
    return (
      <Card>
        <Alert message="未配置连接" description="请先在设置页面配置 New API 连接信息" type="warning" showIcon />
      </Card>
    );
  }

  return (
    <Card>
      <Title level={2}><SplitCellsOutlined /> 渠道自动拆分</Title>
      <Text type="secondary">将支持多个模型的渠道拆分为单模型子渠道，实现基于模型的精细化成本优化</Text>
      <Alert
        message="重要提示"
        description={
          <div>
            <div>拆分功能要求渠道必须配置密钥（Key），否则子渠道将无法创建。</div>
            <div style={{ marginTop: 8 }}>
              <strong>配置方式：</strong>在「渠道源管理」页面添加渠道源，并填写「请求 Key」字段。系统会自动从渠道源获取密钥用于创建子渠道。
            </div>
          </div>
        }
        type="warning"
        showIcon
        style={{ marginTop: 16 }}
      />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginTop: 24 }}
        items={[
          { key: 'select', label: <span><SplitCellsOutlined /> 渠道选择</span>, children: <ChannelSelectionTab connection={connection} onNext={(sel) => { setSplitSelection(sel); setActiveTab('preview'); }} /> },
          { key: 'preview', label: <span><EyeOutlined /> 拆分预览</span>, children: <SplitPreviewTab connection={connection} selection={splitSelection} onNext={(exec) => { setSplitExecution(exec); setActiveTab('result'); }} onBack={() => setActiveTab('select')} /> },
          { key: 'result', label: <span><PlayCircleOutlined /> 执行结果</span>, children: <ExecutionResultTab execution={splitExecution} /> },
          { key: 'history', label: <span><HistoryOutlined /> 拆分历史</span>, children: <SplitHistoryTab connection={connection} /> },
          { key: 'suggestions', label: <span><BulbOutlined /> 智能建议</span>, children: <SmartSuggestionsTab connection={connection} /> },
          { key: 'configs', label: <span><SettingOutlined /> 配置管理</span>, children: <ConfigManagementTab /> },
        ]}
      />
    </Card>
  );
}
