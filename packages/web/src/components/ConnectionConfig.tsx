import React, { useState } from 'react';
import { Form, Input, Button, Alert, Card, Space, message } from 'antd';
import { LinkOutlined, CheckCircleOutlined, EditOutlined } from '@ant-design/icons';
import { useAppContext } from '../context/AppContext';
import { proxyForward } from '../api/client';
import type { ConnectionSettings } from '@newapi-sync/shared';

/**
 * ConnectionConfig — 连接配置组件
 *
 * - First visit: shows a form to enter baseUrl + apiKey
 * - On "测试连接": calls proxyForward to GET /api/pricing on the New API instance
 * - Success: saves to context + localStorage, shows success
 * - Failure: shows error details
 * - If already connected: shows current info with "修改" button
 */
export default function ConnectionConfig() {
  const { state, dispatch } = useAppContext();
  const { settings, status } = state.connection;

  const [editing, setEditing] = useState(!settings);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const [form] = Form.useForm<ConnectionSettings>();

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      setTestError(null);

      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { status: 'connecting' } });

      const resp = await proxyForward(values, 'GET', '/api/pricing');

      if (resp.success) {
        dispatch({ type: 'SET_CONNECTION', payload: values });
        message.success('连接成功！');
        setEditing(false);
      } else {
        throw new Error(resp.error ?? '连接失败');
      }
    } catch (err: unknown) {
      const errMsg = extractErrorMessage(err);
      setTestError(errMsg);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { status: 'error', error: errMsg } });
      message.error('连接失败');
    } finally {
      setTesting(false);
    }
  };

  // ---- Connected view ----
  if (settings && !editing) {
    return (
      <Card title="连接配置" style={{ maxWidth: 600 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="已连接"
            description={
              <>
                <div><strong>地址：</strong>{settings.baseUrl}</div>
                <div><strong>API Key：</strong>{maskKey(settings.apiKey)}</div>
                {settings.userId && <div><strong>用户 ID：</strong>{settings.userId}</div>}
              </>
            }
          />
          <Button icon={<EditOutlined />} onClick={() => {
            form.setFieldsValue(settings);
            setEditing(true);
            setTestError(null);
          }}>
            修改
          </Button>
        </Space>
      </Card>
    );
  }

  // ---- Form view ----
  return (
    <Card title="连接到 New API 实例" style={{ maxWidth: 600 }}>
      <Form
        form={form}
        layout="vertical"
        initialValues={settings ?? { baseUrl: '', apiKey: '', userId: '' }}
      >
        <Form.Item
          label="New API 地址"
          name="baseUrl"
          rules={[
            { required: true, message: '请输入 New API 实例地址' },
            { type: 'url', message: '请输入有效的 URL' },
          ]}
        >
          <Input placeholder="https://your-newapi-instance.com" prefix={<LinkOutlined />} />
        </Form.Item>

        <Form.Item
          label="管理员 API Key"
          name="apiKey"
          rules={[{ required: true, message: '请输入 API Key' }]}
        >
          <Input.Password placeholder="sk-..." />
        </Form.Item>

        <Form.Item
          label="用户 ID"
          name="userId"
          tooltip="可选。某些 API 端点需要 New-Api-User 头，如果您的实例需要，请填写用户 ID"
        >
          <Input placeholder="1" />
        </Form.Item>

        {testError && (
          <Form.Item>
            <Alert type="error" showIcon message="连接失败" description={testError} closable onClose={() => setTestError(null)} />
          </Form.Item>
        )}

        <Form.Item>
          <Space>
            <Button type="primary" loading={testing} onClick={handleTest}>
              测试连接
            </Button>
            {settings && (
              <Button onClick={() => { setEditing(false); setTestError(null); }}>
                取消
              </Button>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    // Axios error with response
    const axiosErr = err as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const msg = axiosErr.response.data?.error ?? axiosErr.response.data?.message;
      if (status === 401 || status === 403) {
        return `认证失败 (${status})：请检查 API Key 是否为超级管理员权限`;
      }
      if (msg) return `${msg} (HTTP ${status})`;
      return `请求失败 (HTTP ${status})`;
    }
    if (axiosErr.message) {
      if (axiosErr.message.includes('Network Error') || axiosErr.message.includes('ECONNREFUSED')) {
        return '网络不可达：请检查 New API 实例地址是否正确';
      }
      if (axiosErr.message.includes('timeout')) {
        return '请求超时：请检查网络连接或 New API 实例是否正常运行';
      }
      return axiosErr.message;
    }
  }
  return String(err);
}
