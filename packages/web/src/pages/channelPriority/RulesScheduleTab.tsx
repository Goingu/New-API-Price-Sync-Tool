import { useState, useEffect, useCallback } from 'react';
import { Card, InputNumber, Button, Space, message, Switch, Select, Descriptions, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { getRule, setRule, getScheduleConfig, setScheduleConfig, getScheduleStatus } from '../../api/client';
import type { PriorityRule, PriorityScheduleConfig, SchedulerStatus } from '@newapi-sync/shared';

const { Text } = Typography;

const frequencyOptions = [
  { value: '1h', label: '每小时' },
  { value: '6h', label: '每6小时' },
  { value: '12h', label: '每12小时' },
  { value: '24h', label: '每天' },
];

export default function RulesScheduleTab() {
  const [rule, setRuleState] = useState<PriorityRule>({ startValue: 100, step: 10 });
  const [scheduleConfig, setScheduleConfigState] = useState<PriorityScheduleConfig>({ enabled: false, frequency: '1h' });
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loadingRule, setLoadingRule] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadingRule(true);
    setLoadingSchedule(true);
    setLoadingStatus(true);
    try {
      const [ruleRes, schedRes, statusRes] = await Promise.all([
        getRule(), getScheduleConfig(), getScheduleStatus(),
      ]);
      if (ruleRes.data) setRuleState(ruleRes.data);
      if (schedRes.data) setScheduleConfigState(schedRes.data);
      if (statusRes.data) setStatus(statusRes.data);
    } catch {
      message.error('加载规则与调度配置失败');
    } finally {
      setLoadingRule(false);
      setLoadingSchedule(false);
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSaveRule = async () => {
    setSavingRule(true);
    try {
      await setRule(rule);
      message.success('优先级规则已保存');
    } catch {
      message.error('保存优先级规则失败');
    } finally {
      setSavingRule(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      await setScheduleConfig(scheduleConfig);
      message.success('定时调度配置已保存');
      try {
        const statusRes = await getScheduleStatus();
        if (statusRes.data) setStatus(statusRes.data);
      } catch { /* ignore */ }
    } catch {
      message.error('保存定时调度配置失败');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleRefreshStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await getScheduleStatus();
      if (res.data) setStatus(res.data);
    } catch {
      message.error('刷新调度状态失败');
    } finally {
      setLoadingStatus(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="优先级规则" size="small" loading={loadingRule}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Text>起始值：</Text>
            <InputNumber min={1} value={rule.startValue} onChange={(v) => v != null && setRuleState((prev) => ({ ...prev, startValue: v }))} />
          </Space>
          <Space>
            <Text>步长：</Text>
            <InputNumber min={1} value={rule.step} onChange={(v) => v != null && setRuleState((prev) => ({ ...prev, step: v }))} />
          </Space>
          <Text type="secondary">
            排序第一的渠道优先级为 {rule.startValue}，第二为 {Math.max(rule.startValue - rule.step, 1)}，依次递减（最小值为 1）
          </Text>
          <Button type="primary" onClick={handleSaveRule} loading={savingRule}>保存规则</Button>
        </Space>
      </Card>

      <Card title="定时调度" size="small" loading={loadingSchedule}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Text>启用定时调度：</Text>
            <Switch checked={scheduleConfig.enabled} onChange={(checked) => setScheduleConfigState((prev) => ({ ...prev, enabled: checked }))} />
          </Space>
          <Space>
            <Text>调度频率：</Text>
            <Select value={scheduleConfig.frequency} onChange={(v) => setScheduleConfigState((prev) => ({ ...prev, frequency: v }))} options={frequencyOptions} style={{ width: 140 }} disabled={!scheduleConfig.enabled} />
          </Space>
          <Button type="primary" onClick={handleSaveSchedule} loading={savingSchedule}>保存配置</Button>
          <Descriptions
            title={<Space><Text strong>调度状态</Text><Button size="small" icon={<ReloadOutlined />} onClick={handleRefreshStatus} loading={loadingStatus} /></Space>}
            bordered size="small" column={1}
          >
            <Descriptions.Item label="上次执行时间">{status?.lastRunAt ?? '暂无'}</Descriptions.Item>
            <Descriptions.Item label="执行结果">{status?.lastRunResult ?? '暂无'}</Descriptions.Item>
            <Descriptions.Item label="下次计划时间">{status?.nextRunAt ?? '暂无'}</Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>
    </div>
  );
}
