import React, { useState, useMemo } from 'react';
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
  ExportOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
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
        <span style={{ fontSize: 10, color: '#a1a1aa', marginLeft: 4 }}>模型防御机制</span>
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
  { key: '/openclaw-config', icon: <ExportOutlined />, label: '龙虾配置生成' },
  { key: '/gateway', icon: <CloudServerOutlined />, label: 'API 网关' },
];

const STATUS_MAP = {
  connected: { color: 'green', text: '已连接' },
  connecting: { color: 'orange', text: '连接中' },
  error: { color: 'red', text: '未连接' },
  idle: { color: 'red', text: '未连接' },
} as const;

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useAppContext();

  const { status } = state.connection;
  const lastFetchedAt = state.upstreamPrices.lastFetchedAt;

  const statusInfo = STATUS_MAP[status as keyof typeof STATUS_MAP] ?? STATUS_MAP.idle;

  const selectedKeys = useMemo(() => [location.pathname], [location.pathname]);

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
        <div style={{ height: 32, margin: 16, textAlign: 'center', color: '#18181b', fontWeight: 'bold', fontSize: collapsed ? 14 : 16, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {collapsed ? '中转' : '中转管理控制台'}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={selectedKeys}
          items={NAV_ITEMS}
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
            <Badge color={statusInfo.color} text={statusInfo.text} />
          </div>
        </Header>
        <Content style={{ margin: '0 24px 24px 24px', padding: 24, background: '#ffffff', borderRadius: 12, minHeight: 280, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
