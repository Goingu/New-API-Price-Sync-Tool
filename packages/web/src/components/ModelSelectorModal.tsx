import { useState, useEffect, useCallback } from 'react';
import { Modal, message, Spin, Alert, Typography } from 'antd';
import type { ConnectionSettings } from '@newapi-sync/shared';
import ModelSelectionList from './ModelSelectionList';

const { Text } = Typography;

export interface ModelInfo {
  modelId: string;
  modelName: string;
  provider: string;
  description?: string;
}

export interface ModelSelectorModalProps {
  visible: boolean;
  channelId: number;
  channelName: string;
  currentModels: string[];
  connection: ConnectionSettings;
  onClose: () => void;
  onSuccess: () => void;
}

/** Map backend error responses to user-friendly messages */
function getErrorMessage(response: Response, errorData: { error?: string }): string {
  const errorText = errorData.error || '';
  const status = response.status;

  if (status === 404 || errorText.toLowerCase().includes('channel not found')) {
    return '所选渠道不再存在。请刷新后重试。';
  }
  if (errorText.toLowerCase().includes('invalid models') || errorText.toLowerCase().includes('model not found')) {
    const modelMatch = errorText.match(/invalid models?:?\s*(.+)/i);
    return modelMatch?.[1] ? `某些选定的模型不再可用: ${modelMatch[1]}` : '某些选定的模型不再可用。';
  }
  if (status === 409 || errorText.toLowerCase().includes('duplicate')) {
    const modelMatch = errorText.match(/duplicate models?:?\s*(.+)/i);
    return modelMatch?.[1] ? `以下模型已在此渠道中: ${modelMatch[1]}` : '某些模型已在此渠道中。';
  }
  if (errorText.toLowerCase().includes('no models selected')) {
    return '请至少选择一个模型添加。';
  }
  if (status === 504 || errorText.toLowerCase().includes('timeout')) {
    return '连接超时。请检查您的网络并重试。';
  }
  if (status === 502) {
    return errorText || 'API 服务暂时不可用。请稍后重试。';
  }
  if (errorText.toLowerCase().includes('modified by another') || errorText.toLowerCase().includes('concurrent')) {
    return '此渠道已被其他用户修改。请刷新后重试。';
  }
  if (status === 500 || errorText.toLowerCase().includes('transaction failed')) {
    const reasonMatch = errorText.match(/transaction failed:?\s*(.+)/i);
    return reasonMatch?.[1] ? `添加模型失败。错误: ${reasonMatch[1]}` : '添加模型失败。未进行任何更改。';
  }
  return errorText || '添加模型失败。请重试。';
}

export default function ModelSelectorModal({
  visible,
  channelId,
  channelName,
  currentModels,
  connection,
  onClose,
  onSuccess,
}: ModelSelectorModalProps) {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Fetch available models when modal opens
  const fetchAvailableModels = useCallback(async () => {
    if (!visible) return;

    setLoading(true);
    setError(undefined);

    try {
      const params = new URLSearchParams({
        targetUrl: connection.baseUrl,
        apiKey: connection.apiKey,
      });
      if (connection.userId) {
        params.append('userId', connection.userId);
      }

      const response = await fetch(
        `/api/channels/${channelId}/available-models?${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = getErrorMessage(response, errorData);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.success) {
        setAvailableModels(data.models || []);
      } else {
        const errorMessage = getErrorMessage(response, data);
        throw new Error(errorMessage);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      message.error(`加载可用模型失败: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [visible, channelId, connection]);

  useEffect(() => {
    if (visible) {
      fetchAvailableModels();
      setSelectedModelIds(new Set());
    }
  }, [visible, fetchAvailableModels]);

  const handleClose = () => {
    setSelectedModelIds(new Set());
    setError(undefined);
    onClose();
  };

  const handleSubmit = async () => {
    if (selectedModelIds.size === 0) {
      message.warning('请至少选择一个模型');
      return;
    }

    setSubmitting(true);

    // Show progress indication for large bulk operations (>10 models)
    const isBulkOperation = selectedModelIds.size > 10;
    let progressMessage: ReturnType<typeof message.loading> | undefined;
    
    if (isBulkOperation) {
      progressMessage = message.loading(
        `正在添加 ${selectedModelIds.size} 个模型，请稍候...`,
        0 // Duration 0 means it won't auto-close
      );
    }

    try {
      const response = await fetch(`/api/channels/${channelId}/models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelIds: Array.from(selectedModelIds),
          connection: {
            targetUrl: connection.baseUrl,
            apiKey: connection.apiKey,
            userId: connection.userId,
          },
        }),
      });

      const data = await response.json();

      // Close progress message if it was shown
      if (progressMessage) {
        progressMessage();
      }

      if (data.success) {
        message.success(data.message || `成功添加 ${data.addedCount} 个模型`);
        handleClose();
        onSuccess();
      } else {
        const errorMessage = getErrorMessage(response, data);
        message.error(errorMessage);
      }
    } catch (err: unknown) {
      // Close progress message if it was shown
      if (progressMessage) {
        progressMessage();
      }
      
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(`添加模型失败: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleModelToggle = (modelId: string) => {
    setSelectedModelIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(modelId)) {
        newSet.delete(modelId);
      } else {
        newSet.add(modelId);
      }
      return newSet;
    });
  };

  return (
    <Modal
      title={`为渠道 "${channelName}" 添加模型`}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleClose}
      confirmLoading={submitting}
      okText="添加"
      cancelText="取消"
      width={700}
      okButtonProps={{ disabled: selectedModelIds.size === 0 }}
    >
      <Spin spinning={loading}>
        {error && (
          <Alert
            message="加载失败"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {!loading && !error && availableModels.length === 0 && (
          <Alert
            message="没有可添加的模型"
            description="所有模型都已添加到此渠道"
            type="info"
            showIcon
          />
        )}

        {!loading && !error && availableModels.length > 0 && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              已选择 {selectedModelIds.size} 个模型
              {selectedModelIds.size > 10 && (
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  (批量操作将显示进度提示)
                </Text>
              )}
            </Text>
            <ModelSelectionList
              models={availableModels}
              selectedModelIds={selectedModelIds}
              onToggle={handleModelToggle}
              loading={false}
            />
          </div>
        )}
      </Spin>
    </Modal>
  );
}
