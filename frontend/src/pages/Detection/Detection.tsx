import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Button,
  Slider,
  message,
  Spin,
  Image,
  Tag,
  Table,
  Switch,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  FolderOutlined,
  SettingOutlined,
  InboxOutlined,
  ScanOutlined,
  CameraOutlined,
  ReloadOutlined,
  FullscreenOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { detectionAPI, systemAPI, recordsAPI } from '../../services/api';

// =====================================================
// 类型定义
// =====================================================
interface DetectionResult {
  id: string;
  batch_id: string;
  defect_count: number;
  events: Array<{
    class_name: string;
    confidence: number;
    bbox: number[];
  }>;
  original_image: string;
  annotated_image: string;
  heatmap_image: string;
}

interface SystemStatus {
  camera_open: boolean;
  mode: string;
  model_loaded: boolean;
  device: string;
  conf_threshold: number;
  iou_threshold: number;
}

interface ModelStatus {
  loaded: boolean;
  model_type: string;
  device: string;
  class_count: number;
  class_names: string[];
}

interface RecentRecord {
  id: string;
  batch_id: string;
  timestamp: string;
  defect_count: number;
}

// =====================================================
// 样式常量（匹配 Flask 5000 端口风格）
// =====================================================
const STYLES = {
  bgMain: '#F1F5F9',
  bgCard: '#FFFFFF',
  primary: '#0055FF',
  textPrimary: '#0F172A',
  textSecondary: 'rgba(0, 0, 0, 0.75)',
  textMuted: 'rgba(0, 0, 0, 0.45)',
  border: '#E2E8F0',
  radius: '12px',
  shadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
  shadowHover: '0 4px 12px rgba(0, 0, 0, 0.1)',
};

const cardStyle: React.CSSProperties = {
  background: STYLES.bgCard,
  borderRadius: STYLES.radius,
  boxShadow: STYLES.shadow,
  border: `1px solid ${STYLES.border}`,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: STYLES.textPrimary,
  padding: '16px 16px 12px',
  borderBottom: `1px solid ${STYLES.border}`,
};

// =====================================================
// Logo SVG 组件
// =====================================================
const LogoIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 12L20 6L32 12V28L20 34L8 28V12Z" fill="#0055FF" opacity="0.9"/>
    <path d="M8 12L20 18L32 12" stroke="#0055FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20 18V34" stroke="#0055FF" strokeWidth="2" strokeLinecap="round"/>
    <path d="M8 12V28L20 34" stroke="#0055FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M32 12V28L20 34" stroke="#0055FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// =====================================================
// 主组件
// =====================================================
const Detection: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLImageElement>(null);

  // ---- 状态 ----
  const [activeMode, setActiveMode] = useState<'image' | 'local' | 'ip'>('image');
  const [loading, setLoading] = useState(false);
  const [confThreshold, setConfThreshold] = useState(0.25);
  const [iouThreshold, setIouThreshold] = useState(0.45);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [cameraStreamUrl, setCameraStreamUrl] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [selectedRedClasses, setSelectedRedClasses] = useState<string[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ---- 初始化加载 ----
  useEffect(() => {
    loadSystemData();
  }, []);

  const loadSystemData = async () => {
    try {
      // 系统状态
      const status = await systemAPI.healthCheck();
      // 注意：healthCheck 调用的是 /health，这里改为调用 /api/status
      // 暂时用 fetch 直接调用
      const statusRes = await fetch('http://localhost:8000/api/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setSystemStatus(statusData);
        setConfThreshold(statusData.conf_threshold ?? 0.25);
        setIouThreshold(statusData.iou_threshold ?? 0.45);
      }

      // 模型状态
      const modelRes = await fetch('http://localhost:8000/model_status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
      });
      if (modelRes.ok) {
        const modelData = await modelRes.json();
        setModelStatus(modelData);
        if (Array.isArray(modelData.class_names)) {
          setClassOptions(modelData.class_names);
        } else {
          setClassOptions([]);
        }
      }

      // 最近记录
      const records = await recordsAPI.getRecords(5, 0);
      setRecentRecords(records || []);
    } catch (error) {
      console.error('加载系统数据失败:', error);
    }
  };

  // ---- 图片检测 ----
  const handleImageDetection = async () => {
    if (fileList.length === 0) {
      message.warning('请先上传图片');
      return;
    }
    const file = fileList[0].originFileObj;
    if (!file) {
      message.error('文件上传失败');
      return;
    }
    setLoading(true);
    try {
      const result = await detectionAPI.detectImage(file, confThreshold, iouThreshold);
      setDetectionResult(result);
      message.success(`检测完成，发现 ${result.defect_count} 个缺陷`);
      // 刷新最近记录
      loadSystemData();
    } catch (error) {
      console.error('检测失败:', error);
      message.error('检测失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // ---- 摄像头 ----
  const toggleCamera = () => {
    if (cameraOpen) {
      setCameraStreamUrl('');
      setCameraOpen(false);
    } else {
      const streamUrl = detectionAPI.getCameraStream('0');
      setCameraStreamUrl(streamUrl);
      setCameraOpen(true);
    }
  };

  const handleCameraCapture = async () => {
    setLoading(true);
    try {
      const result = await detectionAPI.captureFromCamera('0', confThreshold, iouThreshold);
      setDetectionResult(result);
      message.success(`捕获检测完成，发现 ${result.defect_count} 个缺陷`);
      loadSystemData();
    } catch (error) {
      console.error('捕获检测失败:', error);
      message.error('捕获检测失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // ---- 参数调节 ----
  const handleConfChange = async (value: number) => {
    setConfThreshold(value);
    try {
      await fetch('http://localhost:8000/set_conf_threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: value }),
      });
    } catch (e) { /* ignore */ }
  };

  const handleIouChange = async (value: number) => {
    setIouThreshold(value);
    try {
      await fetch('http://localhost:8000/set_iou_threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: value }),
      });
    } catch (e) { /* ignore */ }
  };

  // ---- 红框缺陷 ----
  const toggleRedClass = (className: string) => {
    setSelectedRedClasses(prev =>
      prev.includes(className)
        ? prev.filter(c => c !== className)
        : [...prev, className]
    );
  };

  const selectAllRedClasses = () => {
    setSelectedRedClasses([...classOptions]);
  };

  const clearRedClasses = () => {
    setSelectedRedClasses([]);
  };

  // ---- AI 智能分析 ----
  const handleAiAnalysis = async () => {
    if (!detectionResult?.annotated_image) {
      message.warning('请先完成检测');
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch('http://localhost:8000/analyze_with_llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_path: detectionResult.annotated_image }),
      });
      const data = await res.json();
      setAiAnalysis(data.analysis || data.result || '暂无分析结果');
      setAiSidebarOpen(true);
    } catch (error) {
      message.error('AI分析失败');
    } finally {
      setAiLoading(false);
    }
  };

  // ---- 缺陷事件表格列 ----
  const eventColumns = [
    {
      title: '缺陷类型',
      dataIndex: 'class_name',
      key: 'class_name',
      render: (text: string) => <Tag color="#DC2626">{text}</Tag>,
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      render: (value: number) => `${(value * 100).toFixed(1)}%`,
    },
    {
      title: '位置',
      dataIndex: 'bbox',
      key: 'bbox',
      render: (bbox: number[]) => `(${bbox[0]}, ${bbox[1]}) - (${bbox[2]}, ${bbox[3]})`,
    },
  ];

  // ---- 模式切换 ----
  const handleModeChange = async (mode: 'image' | 'local' | 'ip') => {
    setActiveMode(mode);
    // 关闭摄像头如果切换出摄像头模式
    if (mode !== 'local' && mode !== 'ip') {
      setCameraStreamUrl('');
      setCameraOpen(false);
    }
    try {
      await fetch('http://localhost:8000/set_mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode === 'image' ? 'detection' : 'detection' }),
      });
    } catch (e) { /* ignore */ }
  };

  // =====================================================
  // 渲染
  // =====================================================
  return (
    <div style={{ minHeight: '100vh', background: STYLES.bgMain, display: 'flex', flexDirection: 'column' }}>
      {/* ====== 顶部导航 ====== */}
      <header
        style={{
          background: STYLES.bgCard,
          borderBottom: `1px solid ${STYLES.border}`,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoIcon size={36} />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: STYLES.textPrimary }}>
            钢材缺陷检测系统
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/records')}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: `1px solid ${STYLES.border}`,
              background: STYLES.bgCard,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: STYLES.textSecondary,
              transition: 'all 0.2s',
            }}
            title="检测记录"
          >
            <FolderOutlined style={{ fontSize: 18 }} />
          </button>
          <button
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: `1px solid ${STYLES.border}`,
              background: STYLES.bgCard,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: STYLES.textSecondary,
              transition: 'all 0.2s',
            }}
            title="设置"
          >
            <SettingOutlined style={{ fontSize: 18 }} />
          </button>
        </div>
      </header>

      {/* ====== 主内容 - 三栏布局 ====== */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          gap: 16,
          padding: '16px 24px',
          overflow: 'hidden',
        }}
      >
        {/* ====== 左侧面板 ====== */}
        <aside style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 系统状态 */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>系统状态</div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${STYLES.border}` }}>
                <span style={{ color: STYLES.textSecondary, fontSize: 14 }}>摄像头</span>
                <span style={{ color: cameraOpen ? '#059669' : STYLES.textMuted, fontSize: 14 }}>
                  {cameraOpen ? '运行中' : '已关闭'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: STYLES.textSecondary, fontSize: 14 }}>检测模式</span>
                <span style={{ color: STYLES.textPrimary, fontSize: 14 }}>
                  {activeMode === 'image' ? '缺陷检测' : activeMode === 'local' ? '本地摄像头' : 'IP摄像头'}
                </span>
              </div>
            </div>
          </div>

          {/* 模型信息 */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>模型信息</div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${STYLES.border}` }}>
                <span style={{ color: STYLES.textSecondary, fontSize: 14 }}>当前模型</span>
                <span style={{ color: STYLES.textPrimary, fontSize: 14 }}>
                  {modelStatus?.model_type || '?'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${STYLES.border}` }}>
                <span style={{ color: STYLES.textSecondary, fontSize: 14 }}>设备</span>
                <span style={{ color: STYLES.textPrimary, fontSize: 14 }}>
                  {modelStatus?.device === 'cpu' ? 'CPU' : modelStatus?.device || '-'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: STYLES.textSecondary, fontSize: 14 }}>类别数</span>
                <span style={{ color: STYLES.textPrimary, fontSize: 14 }}>
                  {modelStatus?.class_count ?? '-'}
                </span>
              </div>
            </div>
          </div>

          {/* 检测日志 */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>检测日志</div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${STYLES.border}` }}>
                <span style={{ color: STYLES.textSecondary, fontSize: 14 }}>最新检测</span>
                <span style={{ color: STYLES.textMuted, fontSize: 14 }}>
                  {recentRecords.length > 0 ? recentRecords[0].batch_id : '-'}
                </span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', maxHeight: 160, overflowY: 'auto' }}>
                {recentRecords.length === 0 ? (
                  <li style={{ color: STYLES.textMuted, fontSize: 13, padding: '4px 0' }}>暂无检测记录</li>
                ) : (
                  recentRecords.slice(0, 5).map((record, idx) => (
                    <li key={idx} style={{ color: STYLES.textSecondary, fontSize: 13, padding: '4px 0', borderBottom: idx < recentRecords.length - 1 ? `1px solid ${STYLES.border}` : 'none' }}>
                      {record.batch_id} — {record.defect_count > 0 ? `${record.defect_count}个缺陷` : '无缺陷'}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </aside>

        {/* ====== 中间面板 ====== */}
        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 图片上传 / 摄像头区域 */}
          <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 标题栏 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: `1px solid ${STYLES.border}`,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: STYLES.textPrimary }}>
                {activeMode === 'image' ? '上传图片' : activeMode === 'local' ? '本地摄像头' : 'IP摄像头'}
              </span>
              {activeMode === 'image' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button
                    icon={<span style={{ fontSize: 14 }}>🤖</span>}
                    loading={aiLoading}
                    onClick={handleAiAnalysis}
                    disabled={!detectionResult}
                    style={{ borderRadius: 8, borderColor: STYLES.primary, color: STYLES.primary }}
                  >
                    AI侧栏
                  </Button>
                  <Button
                    type="primary"
                    icon={<ScanOutlined />}
                    loading={loading}
                    onClick={handleImageDetection}
                    disabled={fileList.length === 0}
                    style={{ background: STYLES.primary, borderRadius: 8 }}
                  >
                    开始检测
                  </Button>
                </div>
              )}
              {(activeMode === 'local' || activeMode === 'ip') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="primary"
                    icon={<CameraOutlined />}
                    onClick={toggleCamera}
                    style={{ background: cameraOpen ? '#DC2626' : STYLES.primary, borderRadius: 8 }}
                  >
                    {cameraOpen ? '关闭摄像头' : '开启实时检测'}
                  </Button>
                  <Button
                    icon={<ScanOutlined />}
                    loading={loading}
                    onClick={handleCameraCapture}
                    disabled={!cameraOpen}
                    style={{ borderRadius: 8 }}
                  >
                    捕获检测
                  </Button>
                </div>
              )}
            </div>

            {/* 内容区 */}
            <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
              {activeMode === 'image' && (
                <>
                  {!detectionResult ? (
                    <>
                      <Upload.Dragger
                        fileList={fileList}
                        onChange={({ fileList }) => setFileList(fileList)}
                        beforeUpload={() => false}
                        maxCount={1}
                        accept="image/*"
                        style={{
                          background: '#FAFAFA',
                          border: `2px dashed ${STYLES.border}`,
                          borderRadius: 12,
                          padding: '40px 20px',
                        }}
                      >
                        <p className="ant-upload-drag-icon">
                          <InboxOutlined style={{ fontSize: 48, color: STYLES.textMuted }} />
                        </p>
                        <p style={{ color: STYLES.textSecondary, fontSize: 16, marginBottom: 4 }}>
                          点击或拖拽图片到此处
                        </p>
                        <p style={{ color: STYLES.textMuted, fontSize: 13 }}>
                          JPG / PNG / BMP
                        </p>
                      </Upload.Dragger>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* 结果概览 */}
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ ...cardStyle, padding: '12px 20px', flex: 1, minWidth: 140 }}>
                          <div style={{ color: STYLES.textMuted, fontSize: 13 }}>批次ID</div>
                          <div style={{ color: STYLES.textPrimary, fontSize: 16, fontWeight: 600, marginTop: 4 }}>
                            {detectionResult.batch_id}
                          </div>
                        </div>
                        <div style={{ ...cardStyle, padding: '12px 20px', flex: 1, minWidth: 140 }}>
                          <div style={{ color: STYLES.textMuted, fontSize: 13 }}>缺陷数量</div>
                          <div style={{ color: detectionResult.defect_count > 0 ? '#DC2626' : '#059669', fontSize: 16, fontWeight: 600, marginTop: 4 }}>
                            {detectionResult.defect_count} 个
                          </div>
                        </div>
                      </div>

                      {/* 图片显示 */}
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {detectionResult.original_image && (
                          <div style={{ flex: 1, minWidth: 280 }}>
                            <div style={{ color: STYLES.textSecondary, fontSize: 13, marginBottom: 8, fontWeight: 500 }}>原图</div>
                            <Image
                              src={detectionAPI.getImage(detectionResult.original_image)}
                              style={{ width: '100%', borderRadius: 8, border: `1px solid ${STYLES.border}` }}
                            />
                          </div>
                        )}
                        {detectionResult.annotated_image && (
                          <div style={{ flex: 1, minWidth: 280 }}>
                            <div style={{ color: STYLES.textSecondary, fontSize: 13, marginBottom: 8, fontWeight: 500 }}>标注图</div>
                            <Image
                              src={detectionAPI.getImage(detectionResult.annotated_image)}
                              style={{ width: '100%', borderRadius: 8, border: `1px solid ${STYLES.border}` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* 缺陷详情表格 */}
                      {detectionResult.events.length > 0 && (
                        <div style={cardStyle}>
                          <div style={{ ...cardTitleStyle, borderBottom: `1px solid ${STYLES.border}` }}>检测数据</div>
                          <div style={{ padding: 12 }}>
                            <Table
                              columns={eventColumns}
                              dataSource={detectionResult.events}
                              rowKey={(record, index) => index?.toString() || '0'}
                              size="small"
                              pagination={false}
                            />
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <Button icon={<ReloadOutlined />} onClick={() => { setDetectionResult(null); setFileList([]); }}>
                          重新检测
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {(activeMode === 'local' || activeMode === 'ip') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 640,
                      aspectRatio: '16/9',
                      background: '#000',
                      borderRadius: 12,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {cameraStreamUrl ? (
                      <img
                        ref={videoRef}
                        src={cameraStreamUrl}
                        alt="摄像头画面"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                        <CameraOutlined style={{ fontSize: 48 }} />
                        <div style={{ marginTop: 12 }}>请点击"开启实时检测"</div>
                      </div>
                    )}
                  </div>
                  {detectionResult && (
                    <div style={{ width: '100%', maxWidth: 640 }}>
                      <div style={{ ...cardStyle, padding: 16 }}>
                        <div style={{ fontWeight: 600, marginBottom: 12 }}>捕获检测结果</div>
                        <div style={{ color: detectionResult.defect_count > 0 ? '#DC2626' : '#059669', fontWeight: 600 }}>
                          发现 {detectionResult.defect_count} 个缺陷
                        </div>
                        {detectionResult.annotated_image && (
                          <Image
                            src={detectionAPI.getImage(detectionResult.annotated_image)}
                            style={{ width: '100%', marginTop: 12, borderRadius: 8 }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 使用说明 */}
          <div style={cardStyle}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: STYLES.textPrimary, marginBottom: 12 }}>使用说明</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: STYLES.textSecondary, fontSize: 14, lineHeight: 2 }}>
                <li>支持 JPG、PNG、BMP 格式的图片文件</li>
                <li>点击虚线框或拖拽图片到上方区域上传</li>
                <li>点击"开始检测"按钮进行钢材缺陷检测</li>
                <li>检测完成后可查看标注图和缺陷详情</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ====== 右侧面板 ====== */}
        <aside style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 控制面板 */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>控制面板</div>
            <div style={{ padding: '12px 16px' }}>
              {/* 检测模式 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: STYLES.textSecondary, marginBottom: 8, fontWeight: 500 }}>检测模式</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={() => handleModeChange('image')}
                    style={{
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: activeMode === 'image' ? STYLES.primary : STYLES.bgCard,
                      color: activeMode === 'image' ? '#fff' : STYLES.textPrimary,
                      border: activeMode === 'image' ? 'none' : `1px solid ${STYLES.border}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    导入图片
                  </button>
                  <button
                    onClick={() => handleModeChange('local')}
                    style={{
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                      background: activeMode === 'local' ? STYLES.primary : STYLES.bgCard,
                      color: activeMode === 'local' ? '#fff' : STYLES.textPrimary,
                      border: activeMode === 'local' ? 'none' : `1px solid ${STYLES.border}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    本地摄像头
                  </button>
                  <button
                    onClick={() => handleModeChange('ip')}
                    style={{
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                      background: activeMode === 'ip' ? STYLES.primary : STYLES.bgCard,
                      color: activeMode === 'ip' ? '#fff' : STYLES.textPrimary,
                      border: activeMode === 'ip' ? 'none' : `1px solid ${STYLES.border}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    IP摄像头
                  </button>
                </div>
              </div>

              {/* 模型选择 */}
              <div>
                <div style={{ fontSize: 13, color: STYLES.textSecondary, marginBottom: 8, fontWeight: 500 }}>模型选择</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: `1px solid ${STYLES.border}`,
                    cursor: 'pointer',
                    background: STYLES.bgCard,
                  }}
                >
                  <span style={{ color: STYLES.textPrimary, fontSize: 14 }}>YOLO</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* 检测参数 */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>检测参数</div>
            <div style={{ padding: '12px 16px' }}>
              {/* 置信度阈值 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: STYLES.textSecondary, fontWeight: 500 }}>
                    置信度阈值 (Confidence)
                  </label>
                  <span style={{ fontSize: 14, color: STYLES.primary, fontWeight: 600 }}>
                    {confThreshold.toFixed(2)}
                  </span>
                </div>
                <Slider
                  min={0.01}
                  max={0.99}
                  step={0.01}
                  value={confThreshold}
                  onChange={handleConfChange}
                  trackStyle={{ background: STYLES.primary }}
                  handleStyle={{ borderColor: STYLES.primary }}
                />
                <div style={{ fontSize: 12, color: STYLES.textMuted, marginTop: 4 }}>
                  越低检测到越多缺陷，但可能包含误检
                </div>
              </div>

              {/* IOU阈值 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: STYLES.textSecondary, fontWeight: 500 }}>
                    IOU阈值 (NMS)
                  </label>
                  <span style={{ fontSize: 14, color: STYLES.primary, fontWeight: 600 }}>
                    {iouThreshold.toFixed(2)}
                  </span>
                </div>
                <Slider
                  min={0.01}
                  max={0.99}
                  step={0.01}
                  value={iouThreshold}
                  onChange={handleIouChange}
                  trackStyle={{ background: STYLES.primary }}
                  handleStyle={{ borderColor: STYLES.primary }}
                />
                <div style={{ fontSize: 12, color: STYLES.textMuted, marginTop: 4 }}>
                  越高保留更多重叠框，越低过滤更严格
                </div>
              </div>
            </div>
          </div>

          {/* 红框缺陷 */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>
              红框缺陷
              <span style={{ fontSize: 12, color: STYLES.textMuted, fontWeight: 400, marginLeft: 8 }}>
                点击缺陷名称切换红框显示
              </span>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <div
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {classOptions.length === 0 ? (
                  <div style={{ color: STYLES.textMuted, fontSize: 13, padding: '8px 0' }}>
                    暂无缺陷类别
                  </div>
                ) : (
                  classOptions.map((cls) => (
                    <label
                      key={cls}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: selectedRedClasses.includes(cls) ? '#EFF6FF' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRedClasses.includes(cls)}
                        onChange={() => toggleRedClass(cls)}
                        style={{ width: 16, height: 16, accentColor: STYLES.primary }}
                      />
                      <span style={{ fontSize: 14, color: STYLES.textPrimary }}>{cls}</span>
                    </label>
                  ))
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '12px 0 8px',
                  borderTop: `1px solid ${STYLES.border}`,
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 13, color: STYLES.textSecondary }}>已选缺陷</span>
                <strong style={{ fontSize: 14, color: STYLES.textPrimary }}>
                  {selectedRedClasses.length} 个
                </strong>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={selectAllRedClasses}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 8,
                    border: `1px solid ${STYLES.border}`,
                    background: STYLES.bgCard,
                    color: STYLES.textSecondary,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  全选
                </button>
                <button
                  onClick={clearRedClasses}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: 8,
                    border: 'none',
                    background: STYLES.primary,
                    color: '#fff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  清空
                </button>
              </div>
            </div>
          </div>
          {/* AI 智能分析 */}
          {aiSidebarOpen && (
            <div style={cardStyle}>
              <div style={{ ...cardTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>AI 智能分析</span>
                <button
                  onClick={() => setAiSidebarOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: STYLES.textMuted,
                    fontSize: 16,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {aiAnalysis ? (
                  <div style={{ color: STYLES.textSecondary, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {aiAnalysis}
                  </div>
                ) : (
                  <div style={{ color: STYLES.textMuted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                    点击"AI侧栏"按钮获取智能分析
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* ====== 底部 ====== */}
      <footer
        style={{
          textAlign: 'center',
          padding: '12px 24px',
          color: STYLES.textMuted,
          fontSize: 13,
          borderTop: `1px solid ${STYLES.border}`,
          background: STYLES.bgCard,
        }}
      >
        钢材缺陷检测系统 · Built with YOLO26
      </footer>
    </div>
  );
};

export default Detection;
