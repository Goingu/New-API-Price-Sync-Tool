import { useMemo } from 'react';
import { Button, Select, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ChannelSource } from '@newapi-sync/shared';

const { Text } = Typography;

interface Props {
  sources: ChannelSource[];
  selectedGroups: Map<string, Set<number>>;
  onGroupsChange: (groups: Map<string, Set<number>>) => void;
  onFetch: () => void;
  loading: boolean;
  selectedCount: number;
}

export default function SourceGroupSelector({
  sources,
  selectedGroups,
  onGroupsChange,
  onFetch,
  loading,
  selectedCount,
}: Props) {
  const groupedSources = useMemo(() => {
    const map = new Map<string, ChannelSource[]>();
    sources.forEach((source) => {
      const baseName = source.name;
      if (!map.has(baseName)) map.set(baseName, []);
      map.get(baseName)!.push(source);
    });
    return map;
  }, [sources]);

  const selectedIds = useMemo(() => {
    const ids: number[] = [];
    selectedGroups.forEach((sourceIds) => ids.push(...Array.from(sourceIds)));
    return ids;
  }, [selectedGroups]);

  const handleChange = (newIds: number[]) => {
    const newGroups = new Map<string, Set<number>>();
    const sourceMap = new Map(sources.map((s) => [s.id!, s]));
    newIds.forEach((id) => {
      const source = sourceMap.get(id);
      if (source) {
        const name = source.name;
        if (!newGroups.has(name)) newGroups.set(name, new Set());
        newGroups.get(name)!.add(id);
      }
    });
    onGroupsChange(newGroups);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div>
        <Text strong style={{ marginBottom: 8, display: 'block' }}>选择渠道源分组:</Text>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="请选择渠道源分组"
          value={selectedIds}
          onChange={handleChange}
          maxTagCount="responsive"
        >
          {Array.from(groupedSources).map(([channelName, channelSources]) => (
            <Select.OptGroup key={channelName} label={channelName}>
              {channelSources.map((source) => (
                <Select.Option key={source.id} value={source.id!}>
                  {source.groupName || source.name}
                </Select.Option>
              ))}
            </Select.OptGroup>
          ))}
        </Select>
      </div>
      <Space wrap>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={onFetch}
          loading={loading}
          disabled={selectedCount === 0}
        >
          获取倍率 ({selectedCount})
        </Button>
      </Space>
    </Space>
  );
}
