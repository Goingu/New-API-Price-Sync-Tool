import React, { useEffect, useState, useMemo } from 'react';
import { Row, Col, Card, Statistic, Button, Typography, Space, Divider, Alert, Badge } from 'antd';
import {
    CloudDownloadOutlined,
    SwapOutlined,
    PercentageOutlined,
    CheckCircleOutlined,
    BranchesOutlined,
    FileTextOutlined,
    WarningOutlined,
    ThunderboltOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { fetchUpdateLogs, getCheckinRecords } from '../api/client';
import { compareRatios } from '../utils/comparison';
import type { UpdateLogEntry, CheckinRecord } from '@newapi-sync/shared';

const { Title, Text } = Typography;

export default function Dashboard() {
    const navigate = useNavigate();
    const { state } = useAppContext();

    const [lastUpdateTime, setLastUpdateTime] = useState<string>('从未更新');
    const [checkinStats, setCheckinStats] = useState({ total: 0, success: 0, failed: 0 });
    const [loading, setLoading] = useState(false);

    const isConnected = state.connection.status === 'connected';
    const hasRatios = state.currentRatios.data !== null;
    const numCurrentModels = state.currentRatios.data ? Object.keys(state.currentRatios.data.modelRatio).length : 0;

    const lastFetched = state.upstreamPrices.lastFetchedAt
        ? new Date(state.upstreamPrices.lastFetchedAt).toLocaleString()
        : '从未获取';

    // Calculate models that need adjustment
    const modelsNeedingAdjustment = useMemo(() => {
        if (!state.currentRatios.data || state.upstreamPrices.results.length === 0) {
            return { total: 0, increased: 0, decreased: 0, new: 0 };
        }

        const allRatios = state.upstreamPrices.results
            .filter((r) => r.success)
            .flatMap((r) =>
                r.models.map((m) => ({
                    modelId: m.modelId,
                    provider: m.provider,
                    modelRatio: m.inputPricePerMillion / 0.75,
                    completionRatio:
                        m.inputPricePerMillion > 0
                            ? m.outputPricePerMillion / m.inputPricePerMillion
                            : 1,
                })),
            );

        const rows = compareRatios(state.currentRatios.data, allRatios);

        const increased = rows.filter((r) => r.status === 'increased').length;
        const decreased = rows.filter((r) => r.status === 'decreased').length;
        const newModels = rows.filter((r) => r.status === 'new').length;
        const total = increased + decreased + newModels;

        return { total, increased, decreased, new: newModels };
    }, [state.currentRatios.data, state.upstreamPrices.results]);

    // Fetch last update time
    useEffect(() => {
        const fetchLastUpdate = async () => {
            try {
                const resp = await fetchUpdateLogs(1);
                if (resp.success && resp.logs.length > 0) {
                    const latest = resp.logs[0];
                    setLastUpdateTime(new Date(latest.updatedAt).toLocaleString());
                }
            } catch (err) {
                console.error('Failed to fetch update logs:', err);
            }
        };

        fetchLastUpdate();
    }, []);

    // Fetch checkin statistics
    useEffect(() => {
        const fetchCheckinStats = async () => {
            try {
                const resp = await getCheckinRecords(undefined, 100);
                if (resp.success && resp.records) {
                    const total = resp.records.length;
                    const success = resp.records.filter((r) => r.success).length;
                    const failed = total - success;
                    setCheckinStats({ total, success, failed });
                }
            } catch (err) {
                console.error('Failed to fetch checkin records:', err);
            }
        };

        fetchCheckinStats();
    }, []);

    // Handle quick update
    const handleQuickUpdate = () => {
        navigate('/comparison', { state: { autoSelectNeedsAdjustment: true } });
    };

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ marginBottom: 32 }}>
                <Title level={2} style={{ marginBottom: 8, color: '#1f1f1f' }}>
                    欢迎回来
                </Title>
                <Text type="secondary" style={{ fontSize: 16 }}>
                    您的 New API 价格同步中心。管理倍率、对比价格、维持最新。
                </Text>
            </div>

            {/* Usage Guide */}
            <Alert
                type="info"
                showIcon
                message="快速开始指南"
                description={
                    <div>
                        <p style={{ marginBottom: 12, fontWeight: 600 }}>首次使用流程：</p>
                        <ol style={{ marginBottom: 12, paddingLeft: 20 }}>
                            <li style={{ marginBottom: 8 }}>
                                <strong>配置连接</strong> - 在"设置"页面配置您的 New API 实例连接信息
                            </li>
                            <li style={{ marginBottom: 8 }}>
                                <strong>添加渠道源</strong> - 在"渠道源管理"页面添加您找到的中转商（渠道商）
                            </li>
                            <li style={{ marginBottom: 8 }}>
                                <strong>启用模型</strong> - 在您的 New API 后台启用渠道商的新模型
                            </li>
                            <li style={{ marginBottom: 8 }}>
                                <strong>同步倍率</strong> - 在"渠道源倍率对比"页面，开启"只看未设置倍率的模型"，一键同步倍率
                            </li>
                        </ol>
                        <p style={{ marginBottom: 12, fontWeight: 600 }}>日常使用：</p>
                        <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                            <li style={{ marginBottom: 8 }}>
                                <strong>查看倍率</strong> - "当前倍率"页面查看所有已配置的模型倍率
                            </li>
                            <li style={{ marginBottom: 8 }}>
                                <strong>更新价格</strong> - "抓取价格"获取上游最新价格，"对比更新"调整倍率
                            </li>
                            <li style={{ marginBottom: 8 }}>
                                <strong>对比渠道</strong> - "渠道源倍率对比"找出最便宜的渠道商
                            </li>
                        </ul>
                    </div>
                }
                closable
                style={{ marginBottom: 24 }}
            />

            {/* Quick Stats Grid */}
            <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} hoverable>
                        <Statistic
                            title="连接状态"
                            value={isConnected ? '已连接' : '未连接'}
                            valueStyle={{ color: isConnected ? '#34a853' : '#ea4335', fontWeight: 600 }}
                            prefix={<CheckCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} hoverable>
                        <Statistic
                            title="当前倍率模型总数"
                            value={hasRatios ? numCurrentModels : '未知'}
                            valueStyle={{ color: '#1a73e8', fontWeight: 600 }}
                            prefix={<PercentageOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} hoverable>
                        <Statistic
                            title="最新上游拉取"
                            value={state.upstreamPrices.loading ? '获取中...' : (state.upstreamPrices.results.length > 0 ? state.upstreamPrices.results.length + ' 渠道' : '0')}
                            valueStyle={{ color: '#1a73e8', fontWeight: 600 }}
                            prefix={<CloudDownloadOutlined />}
                        />
                        {!state.upstreamPrices.loading && (
                            <Text type="secondary" style={{ fontSize: 12 }}>{lastFetched}</Text>
                        )}
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card bordered={false} hoverable onClick={() => navigate('/comparison')}>
                        <Badge count={modelsNeedingAdjustment.total} offset={[10, 0]} overflowCount={999}>
                            <Statistic
                                title="需要调整的模型"
                                value={modelsNeedingAdjustment.total}
                                valueStyle={{
                                    color: modelsNeedingAdjustment.total > 0 ? '#ea4335' : '#34a853',
                                    fontWeight: 600
                                }}
                                prefix={<WarningOutlined />}
                            />
                        </Badge>
                        {modelsNeedingAdjustment.total > 0 && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                涨价 {modelsNeedingAdjustment.increased} | 降价 {modelsNeedingAdjustment.decreased} | 新增 {modelsNeedingAdjustment.new}
                            </Text>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Alert for models needing adjustment */}
            {modelsNeedingAdjustment.total > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={`发现 ${modelsNeedingAdjustment.total} 个模型需要调整倍率`}
                    description={
                        <Space direction="vertical" size={4}>
                            <Text>
                                • {modelsNeedingAdjustment.increased} 个模型需要涨价（上游价格提高）
                            </Text>
                            <Text>
                                • {modelsNeedingAdjustment.decreased} 个模型可以降价（上游价格降低）
                            </Text>
                            <Text>
                                • {modelsNeedingAdjustment.new} 个新模型需要配置
                            </Text>
                        </Space>
                    }
                    action={
                        <Button type="primary" size="small" icon={<ThunderboltOutlined />} onClick={handleQuickUpdate}>
                            一键更新
                        </Button>
                    }
                    style={{ marginBottom: 24 }}
                />
            )}

            {/* Additional Stats Row */}
            <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
                <Col xs={24} sm={12}>
                    <Card bordered={false} hoverable onClick={() => navigate('/update-logs')}>
                        <Space direction="vertical" size={0} style={{ width: '100%' }}>
                            <Space>
                                <ClockCircleOutlined style={{ fontSize: 20, color: '#1a73e8' }} />
                                <Text strong>最近一次倍率更新</Text>
                            </Space>
                            <Text style={{ fontSize: 16, color: '#1a73e8', fontWeight: 600 }}>
                                {lastUpdateTime}
                            </Text>
                        </Space>
                    </Card>
                </Col>
                <Col xs={24} sm={12}>
                    <Card bordered={false} hoverable onClick={() => navigate('/checkin')}>
                        <Space direction="vertical" size={0} style={{ width: '100%' }}>
                            <Space>
                                <CheckCircleOutlined style={{ fontSize: 20, color: '#1a73e8' }} />
                                <Text strong>签到统计（最近100次）</Text>
                            </Space>
                            <Space size="large">
                                <Text style={{ fontSize: 16 }}>
                                    总计: <Text strong style={{ color: '#1a73e8' }}>{checkinStats.total}</Text>
                                </Text>
                                <Text style={{ fontSize: 16 }}>
                                    成功: <Text strong style={{ color: '#34a853' }}>{checkinStats.success}</Text>
                                </Text>
                                <Text style={{ fontSize: 16 }}>
                                    失败: <Text strong style={{ color: '#ea4335' }}>{checkinStats.failed}</Text>
                                </Text>
                            </Space>
                        </Space>
                    </Card>
                </Col>
            </Row>

            <Divider style={{ borderColor: '#e1e3e1' }} />

            {/* Quick Actions */}
            <div style={{ marginBottom: 16 }}>
                <Title level={4} style={{ marginBottom: 16, color: '#1f1f1f' }}>快速操作</Title>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={8}>
                        <Card
                            hoverable
                            bordered={false}
                            style={{ textAlign: 'center', background: '#e8f0fe', cursor: 'pointer' }}
                            onClick={() => navigate('/current-ratios')}
                        >
                            <PercentageOutlined style={{ fontSize: 32, color: '#1a73e8', marginBottom: 16 }} />
                            <Title level={5} style={{ margin: 0, color: '#1a73e8' }}>查看当前倍率</Title>
                            <Text type="secondary">检查平台现有的倍率配置</Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Card
                            hoverable
                            bordered={false}
                            style={{ textAlign: 'center', background: '#e8f0fe', cursor: 'pointer' }}
                            onClick={() => navigate('/fetch-prices')}
                        >
                            <CloudDownloadOutlined style={{ fontSize: 32, color: '#1a73e8', marginBottom: 16 }} />
                            <Title level={5} style={{ margin: 0, color: '#1a73e8' }}>抓取上游价格</Title>
                            <Text type="secondary">从各大提供商同步最新的价格数据</Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Card
                            hoverable
                            bordered={false}
                            style={{ textAlign: 'center', background: '#e8f0fe', cursor: 'pointer' }}
                            onClick={() => navigate('/comparison')}
                        >
                            <SwapOutlined style={{ fontSize: 32, color: '#1a73e8', marginBottom: 16 }} />
                            <Title level={5} style={{ margin: 0, color: '#1a73e8' }}>对比与更新配置</Title>
                            <Text type="secondary">分析差值并决定是否更新售价</Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Card
                            hoverable
                            bordered={false}
                            style={{ textAlign: 'center', background: '#e8f0fe', cursor: 'pointer' }}
                            onClick={() => navigate('/channel-source-ratios')}
                        >
                            <BranchesOutlined style={{ fontSize: 32, color: '#1a73e8', marginBottom: 16 }} />
                            <Title level={5} style={{ margin: 0, color: '#1a73e8' }}>渠道源倍率对比</Title>
                            <Text type="secondary">对比多个中转商的倍率，找出最优价格</Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Card
                            hoverable
                            bordered={false}
                            style={{ textAlign: 'center', background: '#e8f0fe', cursor: 'pointer' }}
                            onClick={() => navigate('/checkin')}
                        >
                            <CheckCircleOutlined style={{ fontSize: 32, color: '#1a73e8', marginBottom: 16 }} />
                            <Title level={5} style={{ margin: 0, color: '#1a73e8' }}>签到管理</Title>
                            <Text type="secondary">管理渠道源的自动签到任务</Text>
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Card
                            hoverable
                            bordered={false}
                            style={{ textAlign: 'center', background: '#e8f0fe', cursor: 'pointer' }}
                            onClick={() => navigate('/liveness')}
                        >
                            <FileTextOutlined style={{ fontSize: 32, color: '#1a73e8', marginBottom: 16 }} />
                            <Title level={5} style={{ margin: 0, color: '#1a73e8' }}>活性检测</Title>
                            <Text type="secondary">检测模型的可用性和响应状态</Text>
                        </Card>
                    </Col>
                </Row>
            </div>

            {/* System Health / Recent logs Section (Optional) */}
            <div style={{ marginTop: 32 }}>
                <Card bordered={false} style={{ background: '#ffffff' }}>
                    <Space align="center" style={{ marginBottom: 16 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: '#1a73e8' }} />
                        <Title level={5} style={{ margin: 0 }}>系统概况</Title>
                    </Space>
                    <p style={{ color: '#5f6368', margin: 0 }}>
                        如果需要查看过去的倍率更新记录或者健康度检测，可以在侧边栏找到最新的 <strong> 更新日志 </strong> 和 <strong> 活性检测 </strong> 面板。
                    </p>
                </Card>
            </div>
        </div>
    );
}
