import { useState, useMemo } from 'react';
import { Checkbox, List, Input, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ModelInfo } from './ModelSelectorModal';

const { Text } = Typography;

export interface ModelSelectionListProps {
  models: ModelInfo[];
  selectedModelIds: Set<string>;
  onToggle: (modelId: string) => void;
  loading: boolean;
}

export default function ModelSelectionList({
  models,
  selectedModelIds,
  onToggle,
  loading,
}: ModelSelectionListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter((m) => m.modelId.toLowerCase().includes(q));
  }, [models, search]);

  return (
    <div>
      <Input
        placeholder="搜索模型名称"
        prefix={<SearchOutlined />}
        allowClear
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <List
        loading={loading}
        dataSource={filtered}
        style={{ maxHeight: 400, overflowY: 'auto' }}
        renderItem={(model) => (
          <List.Item
            key={model.modelId}
            style={{
              padding: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              marginBottom: 8,
              cursor: 'pointer',
              backgroundColor: selectedModelIds.has(model.modelId) ? '#f0f9ff' : '#ffffff',
            }}
            onClick={() => onToggle(model.modelId)}
          >
            <List.Item.Meta
              avatar={
                <Checkbox
                  checked={selectedModelIds.has(model.modelId)}
                  onChange={() => onToggle(model.modelId)}
                />
              }
              title={<Text strong>{model.modelName}</Text>}
              description={
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    ID: {model.modelId} | Provider: {model.provider}
                  </Text>
                  {model.description && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {model.description}
                      </Text>
                    </div>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}
