import React, { useState } from 'react';
import { Card, Button, Space, Typography, Modal, message, Divider } from 'antd';
import { DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import ConnectionConfig from '../components/ConnectionConfig';
import { useAppContext } from '../context/AppContext';
import { clearAllData } from '../api/client';

const { Title, Text } = Typography;

export default function Settings() {
  const { dispatch } = useAppContext();
  const [clearing, setClearing] = useState(false);

  const handleClearAll = () => {
    Modal.confirm({
      title: '确认清除所有数据',
      icon: <ExclamationCircleOutlined />,
      content: (
        <Text>
          此操作将清除所有本地数据，包括：
          <ul style={{ marginTop: 8 }}>
            <li>浏览器中保存的连接配置（localStorage）</li>
            <li>后端数据库中的价格历史、更新日志和缓存数据</li>
          </ul>
          此操作不可撤销，确定要继续吗？
        </Text>
      ),
      okText: '确认清除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setClearing(true);
        try {
          await clearAllData();
          dispatch({ type: 'SET_CONNECTION', payload: null });
          message.success('所有数据已清除');
        } catch {
          message.error('清除后端数据失败，请重试');
        } finally {
          setClearing(false);
        }
      },
    });
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Title level={3}>设置</Title>

      <ConnectionConfig />

      <Divider />

      <Card title="数据管理" style={{ maxWidth: 600 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary">
            清除所有本地数据，包括浏览器中保存的连接配置和后端数据库中的历史数据。
          </Text>
          <Button
            danger
            type="primary"
            icon={<DeleteOutlined />}
            loading={clearing}
            onClick={handleClearAll}
          >
            清除所有数据
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
