import React, { useState } from 'react';
import { Layout, Menu, Badge, Typography } from 'antd';
import {
  DashboardOutlined,
  PercentageOutlined,
  CloudDownloadOutlined,
  SwapOutlined,
  BranchesOutlined,
  HistoryOutlined,
  FileTextOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CheckCircleOutlined,
  HeartOutlined,
  ApiOutlined,
  OrderedListOutlined,
  EyeOutlined,
  SplitCellsOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const navItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
  { key: '/channel-sources', icon: <ApiOutlined />, label: '渠道源管理' },
  { key: '/instance-ratio-viewer', icon: <EyeOutlined />, label: '实例模型倍率查看器' },
  { key: '/channel-priority', icon: <OrderedListOutlined />, label: '渠道优先级' },
  {
    key: '/channel-split',
    icon: <SplitCellsOutlined />,
    label: (
      <span>
        渠道拆分
        <span style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>模型防御机制</span>
      </span>
    )
  },
  { key: '/model-groups', icon: <AppstoreOutlined />, label: '模型分组管理' },
  { key: '/channel-source-ratios', icon: <SwapOutlined />, label: '实例站倍率同步' },
  { key: '/fetch-prices', icon: <CloudDownloadOutlined />, label: '抓取官方价格' },
  { key: '/comparison', icon: <SwapOutlined />, label: '对比更新' },
  { key: '/channel-comparison', icon: <BranchesOutlined />, label: '渠道对比' },
  { key: '/price-history', icon: <HistoryOutlined />, label: '价格历史' },
  { key: '/update-logs', icon: <FileTextOutlined />, label: '更新日志' },
  { key: '/checkin', icon: <CheckCircleOutlined />, label: '签到管理' },
  { key: '/liveness', icon: <HeartOutlined />, label: '活性检测' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useAppContext();

  const { status } = state.connection;
  const lastFetchedAt = state.upstreamPrices.lastFetchedAt;

  const statusColor = status === 'connected' ? 'green' : status === 'connecting' ? 'orange' : 'red';
  const statusText = status === 'connected' ? '已连接' : status === 'connecting' ? '连接中' : '未连接';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="light"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        breakpoint="lg"
        collapsedWidth={80}
        style={{ background: 'transparent', borderRight: 'none' }}
      >
        <div style={{ height: 32, margin: 16, textAlign: 'center', color: '#1a73e8', fontWeight: 'bold', fontSize: collapsed ? 14 : 16, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {collapsed ? '中转' : '中转管理控制台'}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={navItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderRight: 'none' }}
        />
      </Sider>
      <Layout style={{ background: 'transparent' }}>
        <Header style={{ background: 'transparent', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 'none' }}>
          <div style={{ cursor: 'pointer', fontSize: 18 }} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {lastFetchedAt && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                上次同步: {new Date(lastFetchedAt).toLocaleString()}
              </Text>
            )}
            <Badge color={statusColor} text={statusText} />
          </div>
        </Header>
        <Content style={{ margin: '0 24px 24px 24px', padding: 24, background: '#ffffff', borderRadius: 24, minHeight: 280, border: '1px solid #e1e3e1', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
