import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Space,
  Typography,
  Tabs,
  Button,
  message,
  Popconfirm,
  Select,
  Modal,
  Descriptions,
  Image,
} from 'antd';
import {
  UserOutlined,
  FileTextOutlined,
  WarningOutlined,
  DashboardOutlined,
  DeleteOutlined,
  ReloadOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { adminAPI } from '../../services/api';

const { Title, Text } = Typography;

interface DashboardData {
  total_users: number;
  total_records: number;
  total_defects: number;
  user_type_stats: { [key: string]: number };
  source_stats: { [key: string]: number };
  date_stats: { [key: string]: number };
  avg_defects_per_record: number;
}

interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  company_name?: string;
  user_type: string;
  is_active: boolean;
  created_at: string;
}

interface Record {
  id: string;
  user_id: string;
  batch_id: string;
  timestamp: string;
  source_type: string;
  defect_count: number;
  status: string;
  conf_threshold?: number;
  iou_threshold?: number;
  image_width?: number;
  image_height?: number;
  original_image?: string;
  annotated_image?: string;
  heatmap_image?: string;
}

interface Event {
  id: string;
  class_name: string;
  confidence: number;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
}

const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(false);
  const [userTypeFilter, setUserTypeFilter] = useState<string | undefined>();
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [userStats, setUserStats] = useState<{ total: number; personal: number; enterprise: number; admin: number }>({ total: 0, personal: 0, enterprise: 0, admin: 0 });

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboardData();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'records') {
      loadRecords();
    }
  }, [activeTab, userTypeFilter]);

  // 计算用户统计
  useEffect(() => {
    if (users.length > 0) {
      const personal = users.filter(u => u.user_type === 'personal').length;
      const enterprise = users.filter(u => u.user_type === 'enterprise').length;
      const admin = users.filter(u => u.user_type === 'admin').length;
      setUserStats({
        total: users.length,
        personal,
        enterprise,
        admin,
      });
    }
  }, [users]);

  // 加载看板数据
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getDashboard();
      setDashboardData(data);
    } catch (error) {
      console.error('加载看板数据失败:', error);
      message.error('加载看板数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载用户列表
  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getUsers(userTypeFilter);
      setUsers(data);
    } catch (error) {
      console.error('加载用户列表失败:', error);
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载记录列表
  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getAllRecords();
      setRecords(data);
    } catch (error) {
      console.error('加载记录列表失败:', error);
      message.error('加载记录列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 更新用户状态
  const handleUpdateUserStatus = async (userId: string, isActive: boolean) => {
    try {
      await adminAPI.updateUserStatus(userId, isActive);
      message.success(`用户已${isActive ? '启用' : '禁用'}`);
      loadUsers();
    } catch (error) {
      console.error('更新用户状态失败:', error);
      message.error('更新用户状态失败');
    }
  };

  // 删除记录
  const handleDeleteRecord = async (recordId: string) => {
    try {
      await adminAPI.deleteRecord(recordId);
      message.success('删除成功');
      loadRecords();
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 查看记录详情
  const handleViewDetail = async (record: Record) => {
    setSelectedRecord(record);
    setDetailVisible(true);

    try {
      const eventsData = await adminAPI.getRecordEvents(record.id);
      setEvents(eventsData);
    } catch (error) {
      console.error('加载事件失败:', error);
      setEvents([]);
    }
  };

  // 用户表格列
  const userColumns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (text: string) => text || '-',
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      render: (text: string) => text || '-',
    },
    {
      title: '企业',
      dataIndex: 'company_name',
      key: 'company_name',
      render: (text: string) => text || '-',
    },
    {
      title: '用户类型',
      dataIndex: 'user_type',
      key: 'user_type',
      render: (text: string) => {
        const typeMap: { [key: string]: { color: string; label: string } } = {
          personal: { color: 'blue', label: '个人用户' },
          enterprise: { color: 'green', label: '企业用户' },
          admin: { color: 'red', label: '管理员' },
        };
        const type = typeMap[text] || { color: 'default', label: text };
        return <Tag color={type.color}>{type.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'error'}>
          {isActive ? '正常' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: User) => (
        <Space>
          {record.user_type !== 'admin' && (
            <Popconfirm
              title={`确定${record.is_active ? '禁用' : '启用'}此用户？`}
              onConfirm={() =>
                handleUpdateUserStatus(record.id, !record.is_active)
              }
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                danger={record.is_active}
              >
                {record.is_active ? '禁用' : '启用'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // 记录表格列
  const recordColumns = [
    {
      title: '批次ID',
      dataIndex: 'batch_id',
      key: 'batch_id',
      ellipsis: true,
    },
    {
      title: '用户ID',
      dataIndex: 'user_id',
      key: 'user_id',
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
          image: { color: 'blue', label: '图片' },
          camera: { color: 'green', label: '摄像头' },
          ip_camera: { color: 'orange', label: 'IP摄像头' },
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
        <Tag color={count > 0 ? 'red' : 'green'}>{count}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (text: string) => (
        <Tag color={text === 'completed' ? 'success' : 'processing'}>
          {text === 'completed' ? '完成' : '处理中'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            查看
          </Button>
          <Popconfirm
            title="确定删除此记录？"
            onConfirm={() => handleDeleteRecord(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 事件表格列
  const eventColumns = [
    {
      title: '缺陷类型',
      dataIndex: 'class_name',
      key: 'class_name',
      render: (text: string) => <Tag color="red">{text}</Tag>,
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      render: (value: number) => `${(value * 100).toFixed(1)}%`,
    },
    {
      title: '位置',
      key: 'bbox',
      render: (_: any, record: Event) =>
        `(${record.bbox_x1}, ${record.bbox_y1}) - (${record.bbox_x2}, ${record.bbox_y2})`,
    },
  ];

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={4}>系统管理</Title>
          <Text type="secondary">管理员看板，查看系统统计和管理用户</Text>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'dashboard',
              label: (
                <span>
                  <DashboardOutlined />
                  看板
                </span>
              ),
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  {/* 统计卡片 */}
                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="总用户数"
                          value={dashboardData?.total_users || 0}
                          prefix={<UserOutlined />}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="总检测次数"
                          value={dashboardData?.total_records || 0}
                          prefix={<FileTextOutlined />}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="发现缺陷数"
                          value={dashboardData?.total_defects || 0}
                          prefix={<WarningOutlined />}
                          valueStyle={{ color: '#ff4d4f' }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="平均缺陷数"
                          value={dashboardData?.avg_defects_per_record || 0}
                          precision={2}
                        />
                      </Card>
                    </Col>
                  </Row>

                  {/* 用户类型统计 */}
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                      <Card title="用户类型分布">
                        {dashboardData?.user_type_stats &&
                          Object.entries(dashboardData.user_type_stats).map(
                            ([type, count]) => (
                              <div
                                key={type}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '8px 0',
                                  borderBottom: '1px solid #f0f0f0',
                                }}
                              >
                                <Tag
                                  color={
                                    type === 'personal'
                                      ? 'blue'
                                      : type === 'enterprise'
                                      ? 'green'
                                      : 'red'
                                  }
                                >
                                  {type === 'personal'
                                    ? '个人用户'
                                    : type === 'enterprise'
                                    ? '企业用户'
                                    : '管理员'}
                                </Tag>
                                <Text strong>{count} 人</Text>
                              </div>
                            )
                          )}
                      </Card>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Card title="检测来源统计">
                        {dashboardData?.source_stats &&
                          Object.entries(dashboardData.source_stats).map(
                            ([source, count]) => (
                              <div
                                key={source}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '8px 0',
                                  borderBottom: '1px solid #f0f0f0',
                                }}
                              >
                                <Text>
                                  {source === 'image'
                                    ? '图片检测'
                                    : source === 'camera'
                                    ? '摄像头'
                                    : 'IP摄像头'}
                                </Text>
                                <Text strong>{count} 次</Text>
                              </div>
                            )
                          )}
                      </Card>
                    </Col>
                  </Row>

                  {/* 每日趋势 */}
                  <Card title="每日检测趋势">
                    {dashboardData?.date_stats &&
                      Object.entries(dashboardData.date_stats)
                        .slice(-7)
                        .map(([date, count]) => (
                          <div
                            key={date}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '8px 0',
                              borderBottom: '1px solid #f0f0f0',
                            }}
                          >
                            <Text>{date}</Text>
                            <Text strong>{count} 次</Text>
                          </div>
                        ))}
                  </Card>
                </Space>
              ),
            },
            {
              key: 'users',
              label: (
                <span>
                  <UserOutlined />
                  用户管理
                </span>
              ),
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  {/* 用户统计卡片 */}
                  <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="总用户数"
                          value={userStats.total}
                          prefix={<UserOutlined />}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="个人用户"
                          value={userStats.personal}
                          prefix={<UserOutlined />}
                          valueStyle={{ color: '#1890ff' }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="企业用户"
                          value={userStats.enterprise}
                          prefix={<UserOutlined />}
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <Card>
                        <Statistic
                          title="管理员"
                          value={userStats.admin}
                          prefix={<UserOutlined />}
                          valueStyle={{ color: '#ff4d4f' }}
                        />
                      </Card>
                    </Col>
                  </Row>

                  <Card>
                    <Space style={{ marginBottom: 16 }}>
                      <Select
                        placeholder="用户类型"
                        allowClear
                        value={userTypeFilter}
                        onChange={setUserTypeFilter}
                        style={{ width: 120 }}
                      >
                        <Select.Option value="personal">个人用户</Select.Option>
                        <Select.Option value="enterprise">企业用户</Select.Option>
                        <Select.Option value="admin">管理员</Select.Option>
                      </Select>
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={loadUsers}
                      >
                        刷新
                      </Button>
                    </Space>

                    <Table
                      columns={userColumns}
                      dataSource={users}
                      rowKey="id"
                      loading={loading}
                      pagination={{ pageSize: 10 }}
                    />
                  </Card>
                </Space>
              ),
            },
            {
              key: 'records',
              label: (
                <span>
                  <FileTextOutlined />
                  记录管理
                </span>
              ),
              children: (
                <Card>
                  <Space style={{ marginBottom: 16 }}>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={loadRecords}
                    >
                      刷新
                    </Button>
                  </Space>

                  <Table
                    columns={recordColumns}
                    dataSource={records}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              ),
            },
          ]}
        />
      </Space>

      {/* 详情弹窗 */}
      <Modal
        title="检测记录详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {selectedRecord && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="批次ID">
                {selectedRecord.batch_id}
              </Descriptions.Item>
              <Descriptions.Item label="检测时间">
                {new Date(selectedRecord.timestamp).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="来源">
                <Tag
                  color={
                    selectedRecord.source_type === 'image'
                      ? 'blue'
                      : selectedRecord.source_type === 'camera'
                      ? 'green'
                      : 'orange'
                  }
                >
                  {selectedRecord.source_type === 'image'
                    ? '图片'
                    : selectedRecord.source_type === 'camera'
                    ? '摄像头'
                    : 'IP摄像头'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="缺陷数量">
                <Tag color={selectedRecord.defect_count > 0 ? 'red' : 'green'}>
                  {selectedRecord.defect_count} 个
                </Tag>
              </Descriptions.Item>
              {selectedRecord.conf_threshold !== undefined && (
                <Descriptions.Item label="置信度阈值">
                  {selectedRecord.conf_threshold}
                </Descriptions.Item>
              )}
              {selectedRecord.iou_threshold !== undefined && (
                <Descriptions.Item label="IOU阈值">
                  {selectedRecord.iou_threshold}
                </Descriptions.Item>
              )}
              {selectedRecord.image_width !== undefined && selectedRecord.image_height !== undefined && (
                <Descriptions.Item label="图片尺寸">
                  {selectedRecord.image_width} x {selectedRecord.image_height}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="状态">
                <Tag
                  color={
                    selectedRecord.status === 'completed' ? 'success' : 'processing'
                  }
                >
                  {selectedRecord.status === 'completed' ? '完成' : '处理中'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {/* 图片展示 */}
            <Row gutter={[16, 16]}>
              {selectedRecord.original_image && (
                <Col span={8}>
                  <Card title="原始图片" size="small">
                    <Image
                      src={`/api/detection/image/${selectedRecord.original_image}`}
                      style={{ width: '100%' }}
                    />
                  </Card>
                </Col>
              )}
              {selectedRecord.annotated_image && (
                <Col span={8}>
                  <Card title="标注图片" size="small">
                    <Image
                      src={`/api/detection/image/${selectedRecord.annotated_image}`}
                      style={{ width: '100%' }}
                    />
                  </Card>
                </Col>
              )}
              {selectedRecord.heatmap_image && (
                <Col span={8}>
                  <Card title="热力图" size="small">
                    <Image
                      src={`/api/detection/image/${selectedRecord.heatmap_image}`}
                      style={{ width: '100%' }}
                    />
                  </Card>
                </Col>
              )}
            </Row>

            {/* 缺陷事件 */}
            {events.length > 0 && (
              <Card title="缺陷详情">
                <Table
                  columns={eventColumns}
                  dataSource={events}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </Card>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default Admin;
