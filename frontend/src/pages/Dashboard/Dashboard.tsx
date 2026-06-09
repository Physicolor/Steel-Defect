import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography, Space, Spin, Progress } from 'antd';
import {
  ScanOutlined,
  FileTextOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { recordsAPI } from '../../services/api';
import { useAuth } from '../../store/AuthContext';

const { Title, Text } = Typography;

interface Statistics {
  total_records: number;
  total_defects: number;
  source_stats: { [key: string]: number };
  date_stats: { [key: string]: number };
  avg_defects_per_record: number;
  defect_stats: { [key: string]: number };
  confidence_distribution: Array<{ range: string; count: number; percentage: number }>;
  damage_ratio: { [key: string]: { avg_area: number; total_count: number } };
  total_events: number;
}

const Dashboard: React.FC = () => {
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsData, recordsData] = await Promise.all([
        recordsAPI.getStatistics(),
        recordsAPI.getRecords(5, 0),
      ]);
      setStatistics(statsData);
      setRecentRecords(recordsData);
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '批次ID',
      dataIndex: 'batch_id',
      key: 'batch_id',
      ellipsis: true,
    },
    {
      title: '检测时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '来源',
      dataIndex: 'source_type',
      key: 'source_type',
      render: (text: string) => {
        const sourceMap: { [key: string]: { color: string; label: string } } = {
          image: { color: '#0055FF', label: '图片检测' },
          camera: { color: '#059669', label: '摄像头' },
          ip_camera: { color: '#D97706', label: 'IP摄像头' },
        };
        const source = sourceMap[text] || { color: 'default', label: text };
        return <Tag color={source.color}>{source.label}</Tag>;
      },
    },
    {
      title: '缺陷数量',
      dataIndex: 'defect_count',
      key: 'defect_count',
      render: (count: number) => (
        <Tag color={count > 0 ? '#DC2626' : '#059669'}>
          {count > 0 ? `${count} 个缺陷` : '无缺陷'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (text: string) => (
        <Tag color={text === 'completed' ? '#059669' : '#0055FF'}>
          {text === 'completed' ? '已完成' : '处理中'}
        </Tag>
      ),
    },
  ];

  // 缺陷类型颜色映射
  const defectColors = ['#DC2626', '#F59E0B', '#0055FF', '#059669', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  // 准备缺陷占比数据
  const defectEntries = statistics?.defect_stats
    ? Object.entries(statistics.defect_stats).sort((a, b) => b[1] - a[1])
    : [];
  const totalDefectEvents = statistics?.total_events || 0;

  // 准备置信分布数据
  const confDist = statistics?.confidence_distribution || [];

  // 准备损伤占比数据
  const damageEntries = statistics?.damage_ratio
    ? Object.entries(statistics.damage_ratio).sort((a, b) => b[1].avg_area - a[1].avg_area)
    : [];

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={4}>欢迎回来，{user?.username}</Title>
          <Text type="secondary">这是您的工作台，可以查看检测统计和最近记录</Text>
        </div>

        {/* 顶部统计卡片 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="总检测次数"
                value={statistics?.total_records || 0}
                prefix={<ScanOutlined />}
                valueStyle={{ color: '#0055FF' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="发现缺陷数"
                value={statistics?.total_defects || 0}
                prefix={<WarningOutlined />}
                valueStyle={{ color: '#DC2626' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="平均缺陷数"
                value={statistics?.avg_defects_per_record || 0}
                precision={2}
                prefix={<FileTextOutlined />}
                valueStyle={{ color: '#059669' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="检测成功率"
                value={statistics?.total_records ? 100 : 0}
                suffix="%"
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#059669' }}
              />
            </Card>
          </Col>
        </Row>

        {/* 四个数据卡片 */}
        <Row gutter={[16, 16]}>
          {/* 缺陷占比 */}
          <Col xs={24} lg={12}>
            <Card title="缺陷占比" style={{ height: '100%' }}>
              {defectEntries.length > 0 ? (
                <div>
                  {defectEntries.map(([name, count], index) => {
                    const pct = totalDefectEvents > 0 ? (count / totalDefectEvents) * 100 : 0;
                    return (
                      <div key={name} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text>{name}</Text>
                          <Text strong>{count} 个 ({pct.toFixed(1)}%)</Text>
                        </div>
                        <Progress
                          percent={pct}
                          showInfo={false}
                          strokeColor={defectColors[index % defectColors.length]}
                          size="small"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
                  暂无缺陷数据
                </div>
              )}
            </Card>
          </Col>

          {/* 最近统计（每日趋势） */}
          <Col xs={24} lg={12}>
            <Card title="最近统计" style={{ height: '100%' }}>
              {statistics?.date_stats && Object.keys(statistics.date_stats).length > 0 ? (
                <div>
                  {Object.entries(statistics.date_stats)
                    .slice(-7)
                    .map(([date, count]) => {
                      const maxCount = Math.max(...Object.values(statistics.date_stats));
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      return (
                        <div key={date} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text>{date}</Text>
                            <Text strong>{count} 次检测</Text>
                          </div>
                          <Progress
                            percent={pct}
                            showInfo={false}
                            strokeColor="#0055FF"
                            size="small"
                          />
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
                  暂无检测数据
                </div>
              )}
            </Card>
          </Col>

          {/* 损伤占比 */}
          <Col xs={24} lg={12}>
            <Card title="损伤占比" style={{ height: '100%' }}>
              {damageEntries.length > 0 ? (
                <div>
                  {damageEntries.slice(0, 6).map(([name, stats], index) => {
                    const maxArea = Math.max(...damageEntries.map(([, s]) => s.avg_area));
                    const pct = maxArea > 0 ? (stats.avg_area / maxArea) * 100 : 0;
                    return (
                      <div key={name} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text>{name}</Text>
                          <Text strong>平均面积 {stats.avg_area} px² ({stats.total_count}次)</Text>
                        </div>
                        <Progress
                          percent={pct}
                          showInfo={false}
                          strokeColor={defectColors[(index + 2) % defectColors.length]}
                          size="small"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
                  暂无损伤数据
                </div>
              )}
            </Card>
          </Col>

          {/* 置信分布 */}
          <Col xs={24} lg={12}>
            <Card title="置信分布" style={{ height: '100%' }}>
              {confDist.length > 0 && totalDefectEvents > 0 ? (
                <div>
                  {confDist.map((item, index) => {
                    const colors = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981', '#059669'];
                    return (
                      <div key={item.range} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text>{item.range}</Text>
                          <Text strong>{item.count} 个 ({item.percentage}%)</Text>
                        </div>
                        <Progress
                          percent={item.percentage}
                          showInfo={false}
                          strokeColor={colors[index]}
                          size="small"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
                  暂无置信度数据
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* 最近检测记录 */}
        <Card title="最近检测记录">
          <Table
            columns={columns}
            dataSource={recentRecords}
            rowKey="id"
            pagination={false}
            size="middle"
          />
        </Card>
      </Space>
    </div>
  );
};

export default Dashboard;
