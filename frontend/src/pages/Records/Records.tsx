import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Button,
  Input,
  Modal,
  Descriptions,
  Image,
  message,
  Popconfirm,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  FileTextOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { recordsAPI } from '../../services/api';

const { Title, Text } = Typography;

interface Record {
  id: string;
  batch_id: string;
  timestamp: string;
  source_type: string;
  defect_count: number;
  conf_threshold: number;
  iou_threshold: number;
  image_width: number;
  image_height: number;
  status: string;
  original_image: string;
  annotated_image: string;
  heatmap_image: string;
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

const Records: React.FC = () => {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  // 筛选状态
  const [filterType, setFilterType] = useState<string>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = React.useRef<HTMLDivElement>(null);

  // 筛选选项
  const filterOptions = [
    { value: 'all', label: '全部来源' },
    { value: 'image', label: '图片导入' },
    { value: 'camera', label: '本地摄像头' },
    { value: 'ip_camera', label: 'IP摄像头' },
  ];

  // 筛选后的记录
  const filteredRecords = React.useMemo(() => {
    if (filterType === 'all') return records;
    return records.filter(r => r.source_type === filterType);
  }, [records, filterType]);

  // 点击外部关闭下拉框
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadRecords();
  }, [pagination.current, pagination.pageSize]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await recordsAPI.getRecords(
        pagination.pageSize,
        (pagination.current - 1) * pagination.pageSize
      );
      setRecords(data);
      setPagination((prev) => ({ ...prev, total: data.length }));
    } catch (error) {
      console.error('加载记录失败:', error);
      message.error('加载记录失败');
    } finally {
      setLoading(false);
    }
  };

  // 查看记录详情
  const handleViewDetail = async (record: Record) => {
    setSelectedRecord(record);
    setDetailVisible(true);

    try {
      const eventsData = await recordsAPI.getRecordEvents(record.id);
      setEvents(eventsData);
    } catch (error) {
      console.error('加载事件失败:', error);
    }
  };

  // 删除记录
  const handleDelete = async (recordId: string) => {
    try {
      await recordsAPI.deleteRecord(recordId);
      message.success('删除成功');
      loadRecords();
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 搜索相似记录
  const handleSearch = async () => {
    if (!searchText.trim()) {
      loadRecords();
      return;
    }

    setLoading(true);
    try {
      const data = await recordsAPI.searchSimilar(searchText, 20);
      setRecords(data);
    } catch (error) {
      console.error('搜索失败:', error);
      message.error('搜索失败');
    } finally {
      setLoading(false);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '批次ID',
      dataIndex: 'batch_id',
      key: 'batch_id',
      ellipsis: true,
      width: 200,
    },
    {
      title: '检测时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '来源',
      dataIndex: 'source_type',
      key: 'source_type',
      width: 100,
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
      width: 100,
      render: (count: number) => (
        <Tag color={count > 0 ? 'red' : 'green'}>{count}</Tag>
      ),
    },
    {
      title: '图片尺寸',
      key: 'image_size',
      width: 120,
      render: (_: any, record: Record) =>
        `${record.image_width} x ${record.image_height}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (text: string) => (
        <Tag color={text === 'completed' ? 'success' : 'processing'}>
          {text === 'completed' ? '完成' : '处理中'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
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
            onConfirm={() => handleDelete(record.id)}
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
          <Title level={4}>检测记录</Title>
          <Text type="secondary">查看和管理您的检测记录</Text>
        </div>

        {/* 统计信息 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="总记录数"
                value={filteredRecords.length}
                prefix={<FileTextOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="缺陷总数"
                value={filteredRecords.reduce((sum, r) => sum + r.defect_count, 0)}
                prefix={<WarningOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="检测成功率"
                value={
                  filteredRecords.length > 0
                    ? (filteredRecords.filter((r) => r.status === 'completed').length /
                        filteredRecords.length) *
                      100
                    : 0
                }
                suffix="%"
                precision={1}
              />
            </Card>
          </Col>
        </Row>

        {/* 搜索和操作 */}
        <Card>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Input
              placeholder="搜索记录..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 260 }}
            />
            {/* 来源类型筛选下拉框 */}
            <div
              ref={filterDropdownRef}
              style={{ position: 'relative', display: 'inline-block', minWidth: 150 }}
            >
              <div
                className={`custom-select-trigger ${isFilterDropdownOpen ? 'open' : ''}`}
                id="filter-type-trigger"
                onClick={() => setIsFilterDropdownOpen(prev => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: '#fff',
                  fontSize: 14,
                  transition: 'border-color 0.2s',
                  userSelect: 'none',
                }}
              >
                <span id="filterTypeDisplayText">
                  {filterOptions.find(o => o.value === filterType)?.label || '全部来源'}
                </span>
                <svg
                  className="custom-select-arrow"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    width: 16,
                    height: 16,
                    marginLeft: 8,
                    transition: 'transform 0.2s',
                    transform: isFilterDropdownOpen ? 'rotate(90deg)' : 'rotate(0)',
                  }}
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </div>
              {isFilterDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: '#fff',
                    border: '1px solid #d9d9d9',
                    borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 100,
                    overflow: 'hidden',
                    display: 'block',
                    opacity: 1,
                    clipPath: 'none',
                  }}
                >
                  {filterOptions.map(option => (
                    <div
                      key={option.value}
                      className={`custom-option ${filterType === option.value ? 'active' : ''}`}
                      onClick={() => {
                        setFilterType(option.value);
                        setIsFilterDropdownOpen(false);
                        setPagination(prev => ({ ...prev, current: 1 }));
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 14,
                        transition: 'background 0.15s',
                        background: filterType === option.value ? '#e6f4ff' : 'transparent',
                        color: filterType === option.value ? '#1677ff' : '#333',
                        fontWeight: filterType === option.value ? 600 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (filterType !== option.value) (e.target as HTMLElement).style.background = '#f5f5f5';
                      }}
                      onMouseLeave={(e) => {
                        if (filterType !== option.value) (e.target as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadRecords}>
              刷新
            </Button>
          </div>

          <Table
            columns={columns}
            dataSource={filteredRecords}
            rowKey="id"
            loading={loading}
            pagination={pagination}
            onChange={(pag) => setPagination(pag as any)}
            scroll={{ x: 1000 }}
          />
        </Card>

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
                <Descriptions.Item label="置信度阈值">
                  {selectedRecord.conf_threshold}
                </Descriptions.Item>
                <Descriptions.Item label="IOU阈值">
                  {selectedRecord.iou_threshold}
                </Descriptions.Item>
                <Descriptions.Item label="图片尺寸">
                  {selectedRecord.image_width} x {selectedRecord.image_height}
                </Descriptions.Item>
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
      </Space>
    </div>
  );
};

export default Records;
