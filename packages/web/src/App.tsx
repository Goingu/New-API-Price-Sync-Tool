import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppProvider, useAppContext } from './context/AppContext';
import ConnectionConfig from './components/ConnectionConfig';

const AppLayout = lazy(() => import('./components/AppLayout'));
const FetchPrices = lazy(() => import('./pages/FetchPrices'));
const ComparisonUpdate = lazy(() => import('./pages/ComparisonUpdate'));
const ChannelComparison = lazy(() => import('./pages/ChannelComparison'));
const ChannelSources = lazy(() => import('./pages/ChannelSources'));
const ChannelSourceRatios = lazy(() => import('./pages/ChannelSourceRatios'));
const InstanceRatioViewer = lazy(() => import('./pages/InstanceRatioViewer'));
const PriceHistory = lazy(() => import('./pages/PriceHistory'));
const UpdateLogs = lazy(() => import('./pages/UpdateLogs'));
const Settings = lazy(() => import('./pages/Settings'));
const CheckinManagement = lazy(() => import('./pages/CheckinManagement'));
const LivenessManagement = lazy(() => import('./pages/LivenessManagement'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChannelPriority = lazy(() => import('./pages/ChannelPriority'));
const ChannelSplit = lazy(() => import('./pages/ChannelSplit'));
const ModelGroupManagement = lazy(() => import('./pages/ModelGroupManagement'));

function RouteLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
      <Spin size="large" />
    </div>
  );
}

/**
 * Route guard — redirects to /connect when no connection settings exist.
 * Renders child routes via <Outlet /> when connected.
 */
function RequireConnection() {
  const { state } = useAppContext();
  if (!state.connection.settings) {
    return <Navigate to="/connect" replace />;
  }
  return <Outlet />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
      {/* Standalone connect page — no layout wrapper */}
      <Route path="/connect" element={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 480 }}>
            <ConnectionConfig />
          </div>
        </div>
      } />

      {/* All other routes require a connection */}
      <Route element={<RequireConnection />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="fetch-prices" element={<FetchPrices />} />
          <Route path="comparison" element={<ComparisonUpdate />} />
          <Route path="channel-comparison" element={<ChannelComparison />} />
          <Route path="channel-sources" element={<ChannelSources />} />
          <Route path="channel-source-ratios" element={<ChannelSourceRatios />} />
          <Route path="instance-ratio-viewer" element={<InstanceRatioViewer />} />
          <Route path="price-history" element={<PriceHistory />} />
          <Route path="update-logs" element={<UpdateLogs />} />
          <Route path="checkin" element={<CheckinManagement />} />
          <Route path="liveness" element={<LivenessManagement />} />
          <Route path="channel-priority" element={<ChannelPriority />} />
          <Route path="channel-split" element={<ChannelSplit />} />
          <Route path="model-groups" element={<ModelGroupManagement />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      {/* Fallback — redirect unknown paths to root */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1a73e8',
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f0f4f9',
          borderRadius: 16,
          fontFamily: '"Google Sans", "Inter", -apple-system, system-ui, sans-serif',
          boxShadowSecondary: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          controlHeight: 40,
        },
        components: {
          Layout: {
            headerBg: '#f0f4f9',
            siderBg: '#f0f4f9',
            bodyBg: '#f0f4f9',
          },
          Menu: {
            itemBg: 'transparent',
            itemHoverBg: '#e8f0fe',
            itemSelectedBg: '#e8f0fe',
            itemSelectedColor: '#1a73e8',
            itemActiveBg: '#e8f0fe',
            itemBorderRadius: 24,
            itemMarginInline: 12,
          },
        }
      }}
    >
      <AntApp>
        <AppProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AppProvider>
      </AntApp>
    </ConfigProvider>
  );
}
