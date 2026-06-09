import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext';
import './steel-home.css';

interface DetectionResult {
  success: boolean;
  image_base64?: string;
  original_image_base64?: string;
  heatmap_base64?: string;
  detections?: Array<{
    class_name: string;
    confidence: number;
    bbox?: number[];
    area?: number;
  }>;
  image_size?: [number, number];
  model_type?: string;
  batch_id?: string;
  error?: string;
}

interface ClassOption {
  id: number;
  name: string;
}

interface EventRecord {
  class_name?: string;
  class?: number;
  confidence: number;
  timestamp: string;
}

const SteelHomePage: React.FC = () => {
  // ===== Auth & Navigation =====
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // ===== Refs =====
  const uploadZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectBtnRef = useRef<HTMLButtonElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const statusTextRef = useRef<HTMLDivElement>(null);
  const resultContentRef = useRef<HTMLDivElement>(null);
  const imagesContainerRef = useRef<HTMLDivElement>(null);
  const originalImageDisplayRef = useRef<HTMLImageElement>(null);
  const clearImageBtnRef = useRef<HTMLButtonElement>(null);
  const annotatedImageWrapperRef = useRef<HTMLDivElement>(null);
  const annotatedImageDisplayRef = useRef<HTMLImageElement>(null);
  const heatmapImageWrapperRef = useRef<HTMLDivElement>(null);
  const heatmapImageDisplayRef = useRef<HTMLImageElement>(null);
  const detectionDataSectionRef = useRef<HTMLDivElement>(null);
  const videoFeedRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayMessageRef = useRef<HTMLDivElement>(null);
  const eventsListRef = useRef<HTMLUListElement>(null);
  const redClassListRef = useRef<HTMLDivElement>(null);
  const confThresholdRef = useRef<HTMLInputElement>(null);
  const iouThresholdRef = useRef<HTMLInputElement>(null);
  const confValueRef = useRef<HTMLSpanElement>(null);
  const iouValueRef = useRef<HTMLSpanElement>(null);
  const confProgressBarRef = useRef<HTMLDivElement>(null);
  const iouProgressBarRef = useRef<HTMLDivElement>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressTextRef = useRef<HTMLDivElement>(null);
  const splitViewBtnRef = useRef<HTMLButtonElement>(null);
  const uploadPanelRef = useRef<HTMLDivElement>(null);
  const splitAIAnalysisPanelRef = useRef<HTMLDivElement>(null);
  const splitAIAnalysisResultRef = useRef<HTMLDivElement>(null);
  const splitAIAnalysisLoadingRef = useRef<HTMLDivElement>(null);
  const splitAIAnalysisContentRef = useRef<HTMLDivElement>(null);
  const splitNoAnalysisRef = useRef<HTMLDivElement>(null);
  const splitAnalyzeWithLLMBtnRef = useRef<HTMLButtonElement>(null);
  const ipAddressModalRef = useRef<HTMLDivElement>(null);
  const ipAddressInputRef = useRef<HTMLInputElement>(null);
  const ipModalErrorMessageRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsOverlayRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const screenshotIntervalRef = useRef<HTMLInputElement>(null);
  const intervalValueRef = useRef<HTMLSpanElement>(null);
  const intervalProgressBarRef = useRef<HTMLDivElement>(null);
  const screenshotIntervalControlRef = useRef<HTMLDivElement>(null);
  const videoDetectionSectionRef = useRef<HTMLDivElement>(null);
  const imageDetectionSectionRef = useRef<HTMLDivElement>(null);
  const modelSelectTextRef = useRef<HTMLSpanElement>(null);
  const modelDropdownOptionsRef = useRef<HTMLDivElement>(null);
  const modelSelectWrapperRef = useRef<HTMLDivElement>(null);
  const folderBtnRef = useRef<HTMLButtonElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const capturesIframeRef = useRef<HTMLIFrameElement>(null);
  const imageLabelRef = useRef<HTMLInputElement>(null);
  const uploadInstructionsRef = useRef<HTMLDivElement>(null);
  const prevImageBtnRef = useRef<HTMLButtonElement>(null);
  const nextImageBtnRef = useRef<HTMLButtonElement>(null);

  // ===== State =====
  const [currentDetectMode, setCurrentDetectMode] = useState<'image' | 'local' | 'ip'>('image');
  const [localCameraEnabled, setLocalCameraEnabled] = useState(false);
  const [currentModel, setCurrentModel] = useState<'yolo' | 'unet'>('yolo');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSplitViewMode, setIsSplitViewMode] = useState(false);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [redBoxClasses, setRedBoxClasses] = useState<Set<number>>(new Set());
  const [currentCameraStatus, setCurrentCameraStatus] = useState('none');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [detectionResults, setDetectionResults] = useState<Record<number, DetectionResult>>({});
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ipModalResolve, setIpModalResolve] = useState<((value: string | null) => void) | null>(null);
  const [isIPModalActive, setIsIPModalActive] = useState(false);
  const [capturesIframeLoaded, setCapturesIframeLoaded] = useState(false);
  const [animationEnabled, setAnimationEnabled] = useState(() => localStorage.getItem('animation_enabled') !== 'false');
  const [highContrastEnabled, setHighContrastEnabled] = useState(() => localStorage.getItem('high_contrast_text') === 'true');
  const [blurEnabled, setBlurEnabled] = useState(() => localStorage.getItem('blur_enabled') !== 'false');
  const [isCameraOperationInProgress, setIsCameraOperationInProgress] = useState(false);
  const leftContentWrapperRef = useRef<HTMLDivElement | null>(null);

  // ===== Constants =====
  const YOLO_PATH = "best (1).pt";
  const UNET_PATH = "myChannelUnet_2_neudet_best.pth";
  const SYSTEM_STATE_KEY = 'steel_detection_system_state';

  // ===== Helpers =====
  const showStatus = useCallback((msg: string, type: 'success' | 'error' | 'info') => {
    if (statusTextRef.current) {
      statusTextRef.current.textContent = msg;
      statusTextRef.current.className = 'status-text ' + type;
      statusTextRef.current.hidden = false;
    }
  }, []);

  const updateSliderProgress = useCallback((slider: HTMLInputElement, progressBar: HTMLDivElement | null) => {
    if (!progressBar || !slider.parentElement) return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const value = parseFloat(slider.value);
    const percentage = (value - min) / (max - min);
    const wrapperWidth = slider.parentElement.offsetWidth;
    const sliderWidth = 12;
    const gap = 6;
    const padding = 6;
    const availableWidth = wrapperWidth - (padding * 2);
    const halfSlider = sliderWidth / 2;
    const trackWidth = availableWidth - sliderWidth;
    const sliderCenterX = padding + halfSlider + percentage * trackWidth;
    let progressBarWidth = sliderCenterX + halfSlider + gap;
    if (progressBarWidth > wrapperWidth) progressBarWidth = wrapperWidth;
    if (progressBarWidth < 0) progressBarWidth = 0;
    progressBar.style.width = Math.round(progressBarWidth) + 'px';
  }, []);

  // ===== API Functions =====
  const loadDetectionParams = useCallback(async () => {
    try {
      const res = await fetch('/get_detection_params');
      const data = await res.json();
      if (data.conf_threshold && confThresholdRef.current) {
        confThresholdRef.current.value = data.conf_threshold;
        if (confValueRef.current) confValueRef.current.textContent = data.conf_threshold.toFixed(2);
        updateSliderProgress(confThresholdRef.current, confProgressBarRef.current);
      }
      if (data.iou_threshold && iouThresholdRef.current) {
        iouThresholdRef.current.value = data.iou_threshold;
        if (iouValueRef.current) iouValueRef.current.textContent = data.iou_threshold.toFixed(2);
        updateSliderProgress(iouThresholdRef.current, iouProgressBarRef.current);
      }
    } catch (err) {
      console.error('加载检测参数失败:', err);
    }
  }, [updateSliderProgress]);

  const loadScreenshotInterval = useCallback(async () => {
    try {
      const res = await fetch('/get_screenshot_interval');
      const data = await res.json();
      if (data.interval !== undefined && screenshotIntervalRef.current) {
        screenshotIntervalRef.current.value = data.interval;
        if (intervalValueRef.current) intervalValueRef.current.textContent = data.interval;
        updateSliderProgress(screenshotIntervalRef.current, intervalProgressBarRef.current);
      }
    } catch (err) {
      console.error('加载截图间隔失败:', err);
    }
  }, [updateSliderProgress]);

  const loadClassOptionsAndSelection = useCallback(async () => {
    try {
      let retries = 0;
      let opts: ClassOption[] = [];
      while (retries < 5) {
        const optsRes = await fetch('/class_options');
        opts = await optsRes.json();
        if (Array.isArray(opts) && opts.length > 0) break;
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
      const validOpts = Array.isArray(opts) ? opts : [];
      setClassOptions(validOpts);
      const redRes = await fetch('/red_box_classes');
      const redData = await redRes.json();
      const savedClasses = (redData || {}).classes || [];
      setRedBoxClasses(new Set(savedClasses.map(Number)));
    } catch (e) {
      console.error('类别加载失败', e);
      setClassOptions([]);
      setRedBoxClasses(new Set());
    }
  }, []);

  const refreshModelStatus = useCallback(async () => {
    try {
      const data = (await (await fetch('/model_status')).json()) || {};
      if (!data.success || !data.model) return;
      const m = data.model;
      const setText = (id: string, v: string) => {
        const el = document.getElementById(id);
        if (el) el.innerText = v;
      };
      setText('statusModelType', (m.model_type || '?').toUpperCase());
      setText('statusDevice', m.device || '-');
      setText('statusClassTotal', m.class_count !== undefined ? String(m.class_count) : '-');
    } catch (e) {
      console.error('模型状态刷新失败', e);
    }
  }, []);

  const saveRedBoxClasses = useCallback(async (classes: Set<number>) => {
    try {
      await fetch('/set_red_box_classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes: Array.from(classes) })
      });
    } catch (e) {
      console.error('保存红框类别失败', e);
    }
  }, []);

  const syncCameraStatus = useCallback(async () => {
    try {
      const d = await (await fetch('/get_camera_status')).json();
      if (d.is_running) {
        let newStatus = 'local';
        if (typeof d.camera_source === 'string' && (d.camera_source.startsWith('http://') || d.camera_source.startsWith('rtsp://'))) {
          newStatus = 'ip';
        }
        setCurrentCameraStatus(newStatus);
        const statusCam = document.getElementById('statusCamera');
        if (statusCam) statusCam.innerText = newStatus === 'local' ? '电脑摄像头' : 'IP摄像头';
        if (videoFeedRef.current) {
          videoFeedRef.current.style.display = 'block';
          videoFeedRef.current.src = `/video_feed?t=${Date.now()}`;
        }
      } else {
        setCurrentCameraStatus('none');
        const statusCam = document.getElementById('statusCamera');
        if (statusCam) statusCam.innerText = '已关闭';
        if (videoFeedRef.current) videoFeedRef.current.style.display = 'none';
        if (overlayMessageRef.current) {
          overlayMessageRef.current.textContent = '请选择摄像头源';
          overlayMessageRef.current.hidden = false;
        }
      }
    } catch (e) {
      console.error('摄像头状态同步失败', e);
    }
  }, []);

  const showIPModal = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      setIpModalResolve(() => resolve);
      setIsIPModalActive(true);
      setTimeout(() => {
        if (ipAddressInputRef.current) ipAddressInputRef.current.focus();
      }, 100);
    });
  }, []);

  const closeIPModal = useCallback((value: string | null = null) => {
    setIsIPModalActive(false);
    if (ipModalResolve) {
      ipModalResolve(value);
      setIpModalResolve(null);
    }
  }, [ipModalResolve]);

  const confirmIPModal = useCallback(() => {
    const input = ipAddressInputRef.current;
    const errorMessage = ipModalErrorMessageRef.current;
    const value = input ? input.value.trim() : '';
    if (!value) {
      if (input) input.classList.add('error');
      if (errorMessage) errorMessage.classList.add('show');
      return;
    }
    if (input) input.classList.remove('error');
    if (errorMessage) errorMessage.classList.remove('show');
    closeIPModal(value);
  }, [closeIPModal]);

  const switchCamera = useCallback(async () => {
    const cameraSelect = document.getElementById('cameraSelect') as HTMLSelectElement;
    if (!cameraSelect) return;
    const type = cameraSelect.value;
    const overlay = overlayMessageRef.current;
    const camNames: Record<string, string> = { 'none': '已关闭', 'local': '电脑摄像头', 'ip': 'IP摄像头' };

    if (type === 'ip') {
      const ip = await showIPModal();
      if (!ip) {
        cameraSelect.value = currentCameraStatus;
        return;
      }
      let url = ip.trim();
      if (!url.startsWith('http://') && !url.startsWith('rtsp://')) url = 'http://' + url;
      if (!url.includes('/video')) url += '/video';
      if (overlay) { overlay.hidden = false; overlay.textContent = '正在连接IP摄像头...'; }
      try {
        const r = await fetch('/set_camera', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_type: 'ip', ip_address: url })
        });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error((d || {}).error || '连接失败');
        setCurrentCameraStatus('ip');
        const statusCam = document.getElementById('statusCamera');
        if (statusCam) statusCam.innerText = 'IP摄像头';
        if (videoFeedRef.current) {
          videoFeedRef.current.style.display = 'block';
          videoFeedRef.current.src = `/video_feed?t=${Date.now()}`;
        }
        if (overlay) overlay.hidden = true;
      } catch (err: any) {
        if (overlay) { overlay.textContent = '连接失败: ' + err.message; overlay.hidden = false; }
        cameraSelect.value = currentCameraStatus;
      }
      return;
    }

    if (overlay) { overlay.hidden = false; overlay.textContent = '正在切换摄像头...'; }
    try {
      const r = await fetch('/set_camera', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera_type: type })
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error((d || {}).error || '切换失败');
      setCurrentCameraStatus(type);
      const statusCam = document.getElementById('statusCamera');
      if (statusCam) statusCam.innerText = camNames[type] || '未知';
      if (type === 'none') {
        if (videoFeedRef.current) { videoFeedRef.current.src = ''; videoFeedRef.current.style.display = 'none'; }
        if (overlay) overlay.hidden = true;
      } else {
        if (videoFeedRef.current) {
          videoFeedRef.current.style.display = 'block';
          videoFeedRef.current.src = `/video_feed?t=${Date.now()}`;
        }
        if (overlay) overlay.hidden = true;
      }
    } catch (err: any) {
      if (overlay) { overlay.textContent = '切换失败: ' + err.message; overlay.hidden = false; }
      cameraSelect.value = currentCameraStatus;
    }
  }, [currentCameraStatus, showIPModal]);

  const refreshEvents = useCallback(() => {
    fetch('/recent_events').then(r => r.json()).then((data: EventRecord[]) => {
      const list = eventsListRef.current;
      if (!list) return;
      list.innerHTML = '';
      if (!Array.isArray(data) || data.length === 0) {
        list.innerHTML = '<li class="muted">暂无检测记录</li>';
        const statusEvent = document.getElementById('statusEvent');
        if (statusEvent) statusEvent.innerText = '-';
        return;
      }
      data.slice(0, 12).forEach(rec => {
        const li = document.createElement('li');
        const className = rec.class_name || `类别${rec.class}`;
        const timeStr = rec.timestamp ? new Date(rec.timestamp).toLocaleString('zh-CN', {
          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
        }) : '-';
        li.innerHTML = `<strong>${className}</strong><div class="muted" style="font-size:12px">${timeStr} · 置信度:${Number(rec.confidence).toFixed(2)}</div>`;
        list.appendChild(li);
      });
      const latestEvent = data[0];
      if (latestEvent) {
        const statusEvent = document.getElementById('statusEvent');
        if (statusEvent) {
          const className = latestEvent.class_name || `类别${latestEvent.class}`;
          statusEvent.innerText = `${className} (${Number(latestEvent.confidence).toFixed(2)})`;
        }
      }
    }).catch(() => {
      if (eventsListRef.current) eventsListRef.current.innerHTML = '<li class="muted">暂无检测记录</li>';
    });
  }, []);

  // ===== Render Functions =====
  const renderResult = useCallback((data: DetectionResult) => {
    const container = resultContentRef.current;
    if (!container) return;
    let html = '';
    const dets = data.detections || [];
    html += `<div style="margin-bottom: 16px;"><strong>检测到 ${dets.length} 个缺陷</strong>`;
    if (data.image_size) {
      html += ` <span class="muted">(图片尺寸: ${data.image_size[0]} × ${data.image_size[1]})</span>`;
    }
    html += `</div>`;
    if (dets.length > 0) {
      html += `<table class="det-table"><thead><tr><th>序号</th><th>缺陷类型</th><th>置信度</th><th>位置</th></tr></thead><tbody>`;
      dets.forEach((det, i) => {
        const confPct = det.confidence != null ? (det.confidence * 100).toFixed(1) : '-';
        const barW = det.confidence ? Math.max(4, det.confidence * 80) : 0;
        const posInfo = det.bbox ? det.bbox.join(', ') : (det.area != null ? `面积: ${det.area}px²` : '-');
        html += `<tr><td>${i + 1}</td><td>${det.class_name}</td><td>${confPct}% <span class="conf-bar" style="width:${barW}px"></span></td><td class="muted">${posInfo}</td></tr>`;
      });
      html += `</tbody></table>`;
    } else {
      html += `<div class="muted" style="margin-top: 8px;">未检测到缺陷</div>`;
    }
    container.innerHTML = html;
  }, []);

  const renderAIAnalysis = useCallback((analysisText: string, targetContent?: HTMLDivElement) => {
    const content = targetContent || document.getElementById('aiAnalysisContent') as HTMLDivElement;
    if (!content) return;
    if (!analysisText) { content.innerHTML = ''; return; }
    let cleanedText = analysisText;
    let lines = cleanedText.split('\n').map(line => line.trim());
    lines = lines.map(line => line.replace(/^【(.+?)】\s*$/, '**$1**'));
    lines = lines.map(line => line.replace(/^[\-\*]\s+/, ''));
    let cleanedLines = lines.filter(line => line !== '');
    let result = cleanedLines.join('\n');
    result = result.replace(/^#+\s+/gm, '');
    result = result.replace(/^>\s+/gm, '');
    result = result.replace(/^---+$/gm, '');
    result = result.replace(/`/g, '');

    const paragraphs = result.split('\n').filter(p => p.trim());
    let html = '';
    paragraphs.forEach(para => {
      para = para.trim();
      if (para.startsWith('【') && para.includes('】')) {
        const title = para.replace(/【|】/g, '');
        html += `<h4>${title}</h4>`;
      } else if (/^\*\*.+\*\*$/.test(para)) {
        const title = para.replace(/^\*\*|\*\*$/g, '');
        html += `<h4 style="color: var(--primary);">${title}</h4>`;
      } else if (para.startsWith('- ') || para.startsWith('• ')) {
        const content = para.substring(2);
        html += `<p>• ${content}</p>`;
      } else {
        html += `<p>${para}</p>`;
      }
    });
    content.innerHTML = html;
  }, []);

  const renderSplitAIAnalysis = useCallback((analysisText: string) => {
    if (splitAIAnalysisContentRef.current) {
      renderAIAnalysis(analysisText, splitAIAnalysisContentRef.current);
    }
    if (splitAIAnalysisResultRef.current) splitAIAnalysisResultRef.current.hidden = false;
    if (splitNoAnalysisRef.current) splitNoAnalysisRef.current.style.display = 'none';
  }, [renderAIAnalysis]);

  // ===== Image Handling =====
  const showOriginalImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (originalImageDisplayRef.current) originalImageDisplayRef.current.src = e.target?.result as string;
      if (imagesContainerRef.current) imagesContainerRef.current.hidden = false;
      if (uploadZoneRef.current) uploadZoneRef.current.hidden = true;
      if (detectBtnRef.current) detectBtnRef.current.hidden = false;
    };
    reader.readAsDataURL(file);
  }, []);

  const showCurrentImage = useCallback(() => {
    const file = uploadedFiles[currentImageIndex];
    if (!file) return;
    showOriginalImage(file);
    const imageLabel = imageLabelRef.current;
    if (imageLabel) {
      const allDetected = uploadedFiles.every((_, idx) => detectionResults[idx]);
      if (allDetected && uploadedFiles.length > 1) {
        imageLabel.value = `图片${currentImageIndex + 1}`;
        imageLabel.readOnly = false;
        imageLabel.classList.add('editable');
        imageLabel.placeholder = '输入序号跳转';
      } else if (uploadedFiles.length > 1) {
        imageLabel.value = `已导入 ${uploadedFiles.length} 张图片`;
        imageLabel.readOnly = true;
        imageLabel.classList.remove('editable');
      } else {
        imageLabel.value = '原图';
        imageLabel.readOnly = true;
        imageLabel.classList.remove('editable');
      }
    }
    if (detectionResults[currentImageIndex]) {
      const data = detectionResults[currentImageIndex];
      if (annotatedImageDisplayRef.current && data.image_base64) {
        annotatedImageDisplayRef.current.src = `data:image/jpeg;base64,${data.image_base64}`;
      }
      if (annotatedImageWrapperRef.current) annotatedImageWrapperRef.current.hidden = false;
      if (data.heatmap_base64 && heatmapImageDisplayRef.current) {
        heatmapImageDisplayRef.current.src = `data:image/jpeg;base64,${data.heatmap_base64}`;
        if (heatmapImageWrapperRef.current) heatmapImageWrapperRef.current.hidden = false;
      }
      renderResult(data);
      if (detectionDataSectionRef.current) detectionDataSectionRef.current.hidden = false;
    } else {
      if (annotatedImageWrapperRef.current) annotatedImageWrapperRef.current.hidden = true;
      if (heatmapImageWrapperRef.current) heatmapImageWrapperRef.current.hidden = true;
      if (detectionDataSectionRef.current) detectionDataSectionRef.current.hidden = true;
    }
    if (uploadedFiles.length > 1) {
      if (prevImageBtnRef.current) prevImageBtnRef.current.hidden = false;
      if (nextImageBtnRef.current) nextImageBtnRef.current.hidden = false;
    } else {
      if (prevImageBtnRef.current) prevImageBtnRef.current.hidden = true;
      if (nextImageBtnRef.current) nextImageBtnRef.current.hidden = true;
    }
  }, [uploadedFiles, currentImageIndex, detectionResults, showOriginalImage, renderResult]);

  const clearImage = useCallback(() => {
    setSelectedFile(null);
    setLastResult(null);
    setUploadedFiles([]);
    setCurrentImageIndex(0);
    setDetectionResults({});
    if (originalImageDisplayRef.current) originalImageDisplayRef.current.src = '';
    if (annotatedImageDisplayRef.current) annotatedImageDisplayRef.current.src = '';
    if (heatmapImageDisplayRef.current) heatmapImageDisplayRef.current.src = '';
    if (imagesContainerRef.current) imagesContainerRef.current.hidden = true;
    if (uploadZoneRef.current) uploadZoneRef.current.hidden = false;
    if (detectBtnRef.current) detectBtnRef.current.hidden = true;
    if (detectionDataSectionRef.current) detectionDataSectionRef.current.hidden = true;
    if (statusTextRef.current) statusTextRef.current.hidden = true;
    if (resultContentRef.current) resultContentRef.current.innerHTML = '';
    const imageLabel = imageLabelRef.current;
    if (imageLabel) { imageLabel.value = '原图'; imageLabel.readOnly = true; imageLabel.classList.remove('editable'); }
    showStatus('已清除,请重新上传图片', 'info');
  }, [showStatus]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const filtered = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (filtered.length === 0) {
      showStatus('请上传图片文件', 'error');
      return;
    }
    if (statusTextRef.current) statusTextRef.current.hidden = true;
    setUploadedFiles(filtered);
    setCurrentImageIndex(0);
    setDetectionResults({});
    const imageLabel = imageLabelRef.current;
    if (imageLabel) imageLabel.textContent = `已导入 ${filtered.length} 张图片`;
    if (annotatedImageWrapperRef.current) annotatedImageWrapperRef.current.hidden = true;
    if (heatmapImageWrapperRef.current) heatmapImageWrapperRef.current.hidden = true;
    if (detectionDataSectionRef.current) detectionDataSectionRef.current.hidden = true;
    showOriginalImage(filtered[0]);
    if (prevImageBtnRef.current) prevImageBtnRef.current.hidden = filtered.length <= 1;
    if (nextImageBtnRef.current) nextImageBtnRef.current.hidden = filtered.length <= 1;
  }, [showOriginalImage, showStatus]);

  // ===== Mode & Model =====
  const updateSliderPosition = useCallback((mode: string) => {
    const doUpdate = () => {
      const slider = document.getElementById('modeTabsSlider');
      const targetTab = document.querySelector(`.mode-tab[data-mode="${mode}"]`) as HTMLElement;
      if (slider && targetTab) {
        const containerRect = document.querySelector('.mode-tabs-container')?.getBoundingClientRect();
        const tabRect = targetTab.getBoundingClientRect();
        if (containerRect && tabRect.height > 0) {
          const top = tabRect.top - containerRect.top;
          const height = tabRect.height;
          (slider as HTMLElement).style.top = `${top}px`;
          (slider as HTMLElement).style.height = `${height}px`;
          (slider as HTMLElement).style.width = `calc(100% - 6px)`;
        }
      }
    };
    // 立即尝试更新
    doUpdate();
    // 使用 requestAnimationFrame 确保DOM已渲染
    requestAnimationFrame(() => {
      doUpdate();
      // 再延迟一次作为后备
      setTimeout(doUpdate, 50);
    });
  }, []);

  const selectMode = useCallback((mode: 'image' | 'local' | 'ip') => {
    if (mode === 'image' && (currentDetectMode === 'local' || currentDetectMode === 'ip')) {
      fetch('/stop_camera', { method: 'POST' }).catch(() => {});
    }
    setCurrentDetectMode(mode);
    document.querySelectorAll('.mode-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.mode-tab[data-mode="${mode}"]`)?.classList.add('active');
    updateSliderPosition(mode);
    if (screenshotIntervalControlRef.current) {
      screenshotIntervalControlRef.current.style.display = (mode === 'local' || mode === 'ip') ? 'block' : 'none';
    }
    if (videoDetectionSectionRef.current) {
      videoDetectionSectionRef.current.hidden = mode === 'image';
    }
    if (imageDetectionSectionRef.current) {
      imageDetectionSectionRef.current.hidden = mode !== 'image';
    }
    if (splitViewBtnRef.current) {
      splitViewBtnRef.current.hidden = mode !== 'image';
    }
    if (mode !== 'image' && isSplitViewMode) {
      setIsSplitViewMode(false);
      document.body.classList.remove('split-view-mode');
      if (splitViewBtnRef.current) splitViewBtnRef.current.classList.remove('active');
    }
  }, [currentDetectMode, updateSliderPosition, isSplitViewMode]);

  const selectModel = useCallback((model: 'yolo' | 'unet') => {
    setCurrentModel(model);
    if (modelSelectTextRef.current) modelSelectTextRef.current.textContent = model === 'yolo' ? 'YOLO' : 'UNet';
    document.querySelectorAll('.custom-option').forEach(option => option.classList.remove('active'));
    document.querySelector(`.custom-option[data-value="${model}"]`)?.classList.add('active');
    setIsModelDropdownOpen(false);
  }, []);

  const toggleModelDropdown = useCallback(() => {
    setIsModelDropdownOpen(prev => !prev);
  }, []);

  // ===== Split View =====
  const syncSplitPanelState = useCallback(() => {
    if (!isSplitViewMode) return;
    const savedAIAnalysis = sessionStorage.getItem('aiAnalysisText');
    if (savedAIAnalysis) {
      renderSplitAIAnalysis(savedAIAnalysis);
    } else {
      if (splitAIAnalysisResultRef.current) splitAIAnalysisResultRef.current.hidden = true;
      if (splitNoAnalysisRef.current) splitNoAnalysisRef.current.style.display = 'block';
    }
  }, [isSplitViewMode, renderSplitAIAnalysis]);

  // ===== Settings =====
  const openSettings = useCallback(() => {
    setIsSettingsOpen(true);
    document.body.classList.add('settings-open');
    settingsPanelRef.current?.classList.add('active');
    settingsOverlayRef.current?.classList.add('active');
    settingsBtnRef.current?.classList.add('active');
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    document.body.classList.remove('settings-open');
    settingsPanelRef.current?.classList.remove('active');
    settingsOverlayRef.current?.classList.remove('active');
    settingsBtnRef.current?.classList.remove('active');
  }, []);

  // ===== Detection =====
  const runDetection = useCallback(async () => {
    if (uploadedFiles.length === 0) return;
    loadingRef.current?.classList.add('active');
    if (statusTextRef.current) statusTextRef.current.hidden = true;
    if (detectBtnRef.current) detectBtnRef.current.hidden = true;
    if (progressContainerRef.current) progressContainerRef.current.hidden = false;

    const newResults: Record<number, DetectionResult> = {};
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      if (progressTextRef.current) progressTextRef.current.textContent = `正在检测第 ${i + 1} / ${uploadedFiles.length} 张图片...`;
      if (progressFillRef.current) progressFillRef.current.style.width = `${(i / uploadedFiles.length) * 100}%`;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/detect_image', { method: 'POST', body: formData });
        const data: DetectionResult = await res.json();
        if (!data.success) {
          showStatus(`图片 ${i + 1} 检测失败: ${data.error}`, 'error');
          continue;
        }
        newResults[i] = data;
        setLastResult(data);
        showStatus(`图片 ${i + 1} 检测完成`, 'success');
      } catch (err: any) {
        showStatus(`图片 ${i + 1} 请求失败: ${err.message}`, 'error');
      }
      if (progressFillRef.current) progressFillRef.current.style.width = `${((i + 1) / uploadedFiles.length) * 100}%`;
    }
    setDetectionResults(newResults);
    loadingRef.current?.classList.remove('active');
    if (progressContainerRef.current) progressContainerRef.current.hidden = true;
    showStatus('所有图片检测完成', 'success');
    setCurrentImageIndex(0);
    setTimeout(() => showCurrentImage(), 100);
  }, [uploadedFiles, showStatus, showCurrentImage]);

  // ===== AI Analysis =====
  const analyzeWithLLM = useCallback(async () => {
    const targetResult = lastResult || detectionResults[currentImageIndex];
    if (!targetResult || !targetResult.image_base64) {
      showStatus('请先进行图片检测', 'error');
      return;
    }
    const aiAnalysisResult = document.getElementById('aiAnalysisResult') as HTMLDivElement;
    const aiAnalysisLoading = document.getElementById('aiAnalysisLoading') as HTMLDivElement;
    const aiAnalysisContent = document.getElementById('aiAnalysisContent') as HTMLDivElement;
    if (aiAnalysisResult) aiAnalysisResult.style.display = 'block';
    if (aiAnalysisLoading) aiAnalysisLoading.hidden = false;
    if (aiAnalysisContent) aiAnalysisContent.innerHTML = '';
    try {
      const response = await fetch('/analyze_with_llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: targetResult.image_base64,
          detections: targetResult.detections || [],
          model_type: targetResult.model_type || 'yolo',
          conf_threshold: parseFloat(confThresholdRef.current?.value || '0.25'),
          iou_threshold: parseFloat(iouThresholdRef.current?.value || '0.45'),
          batch_id: targetResult.batch_id || null
        })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'AI分析失败');
      renderAIAnalysis(data.analysis);
      showStatus('AI分析完成', 'success');
      sessionStorage.setItem('aiAnalysisText', data.analysis);
      if (isSplitViewMode) renderSplitAIAnalysis(data.analysis);
    } catch (err: any) {
      if (aiAnalysisContent) {
        aiAnalysisContent.innerHTML = `<div style="color: var(--danger); padding: 20px; text-align: center;"><div style="font-size: 48px; margin-bottom: 12px;">❌</div><div><strong>分析失败</strong></div><div style="margin-top: 8px; font-size: 13px;">${err.message}</div></div>`;
      }
      showStatus('AI分析失败: ' + err.message, 'error');
    } finally {
      if (aiAnalysisLoading) aiAnalysisLoading.hidden = true;
    }
  }, [lastResult, detectionResults, currentImageIndex, isSplitViewMode, renderAIAnalysis, renderSplitAIAnalysis, showStatus]);

  // ===== Effects =====
  useEffect(() => {
    // Init sliders with default values immediately
    if (confThresholdRef.current) updateSliderProgress(confThresholdRef.current, confProgressBarRef.current);
    if (iouThresholdRef.current) updateSliderProgress(iouThresholdRef.current, iouProgressBarRef.current);
    if (screenshotIntervalRef.current) updateSliderProgress(screenshotIntervalRef.current, intervalProgressBarRef.current);

    // Load detection params from server (will update sliders again)
    loadDetectionParams();
    loadScreenshotInterval();

    // Load class options and model status
    Promise.all([loadClassOptionsAndSelection(), refreshModelStatus()]);

    // Sync camera status
    syncCameraStatus();

    // Refresh events interval
    const eventsInterval = setInterval(refreshEvents, 2000);
    const cameraInterval = setInterval(syncCameraStatus, 5000);
    refreshEvents();

    return () => {
      clearInterval(eventsInterval);
      clearInterval(cameraInterval);
    };
  }, [loadDetectionParams, loadScreenshotInterval, updateSliderProgress, loadClassOptionsAndSelection, refreshModelStatus, syncCameraStatus, refreshEvents]);

  useEffect(() => {
    if (animationEnabled) {
      document.body.classList.remove('no-animations');
    } else {
      document.body.classList.add('no-animations');
    }
  }, [animationEnabled]);

  useEffect(() => {
    if (highContrastEnabled) {
      document.body.classList.add('high-contrast-text');
    } else {
      document.body.classList.remove('high-contrast-text');
    }
  }, [highContrastEnabled]);

  useEffect(() => {
    if (blurEnabled) {
      document.body.classList.remove('no-blur');
    } else {
      document.body.classList.add('no-blur');
    }
  }, [blurEnabled]);

  useEffect(() => {
    // Default mode - use requestAnimationFrame for reliable DOM measurement
    requestAnimationFrame(() => {
      selectMode('image');
    });
  }, [selectMode, updateSliderPosition]);

  // ===== Event Handlers =====
  const onUploadZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  }, [handleFiles]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    uploadZoneRef.current?.classList.add('dragover');
  }, []);

  const onDragLeave = useCallback(() => {
    uploadZoneRef.current?.classList.remove('dragover');
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    uploadZoneRef.current?.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onConfChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (confValueRef.current) confValueRef.current.textContent = value.toFixed(2);
    updateSliderProgress(e.target, confProgressBarRef.current);
    try {
      await fetch('/set_conf_threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conf_threshold: value })
      });
    } catch (err) {
      console.error('设置置信度阈值失败:', err);
    }
  }, [updateSliderProgress]);

  const onIouChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (iouValueRef.current) iouValueRef.current.textContent = value.toFixed(2);
    updateSliderProgress(e.target, iouProgressBarRef.current);
    try {
      await fetch('/set_iou_threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iou_threshold: value })
      });
    } catch (err) {
      console.error('设置IOU阈值失败:', err);
    }
  }, [updateSliderProgress]);

  const onIntervalChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (intervalValueRef.current) intervalValueRef.current.textContent = String(value);
    updateSliderProgress(e.target, intervalProgressBarRef.current);
    try {
      await fetch('/set_screenshot_interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: value })
      });
    } catch (err) {
      console.error('设置截图间隔失败:', err);
    }
  }, [updateSliderProgress]);

  const onPrevImage = useCallback(() => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(prev => prev - 1);
    }
  }, [currentImageIndex]);

  const onNextImage = useCallback(() => {
    if (currentImageIndex < uploadedFiles.length - 1) {
      setCurrentImageIndex(prev => prev + 1);
    }
  }, [currentImageIndex, uploadedFiles.length]);

  const onImageLabelKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value.trim();
      const match = value.match(/\d+/);
      if (match) {
        const targetIndex = parseInt(match[0]) - 1;
        if (targetIndex >= 0 && targetIndex < uploadedFiles.length) {
          setCurrentImageIndex(targetIndex);
          input.blur();
        } else {
          showStatus(`图片序号超出范围(1-${uploadedFiles.length})`, 'error');
          showCurrentImage();
        }
      } else {
        showStatus('请输入有效的图片序号', 'error');
        showCurrentImage();
      }
    } else if (e.key === 'Escape') {
      input.blur();
      showCurrentImage();
    }
  }, [uploadedFiles.length, showStatus, showCurrentImage]);

  const onSplitViewClick = useCallback(() => {
    setIsSplitViewMode(prev => {
      const newMode = !prev;
      sessionStorage.setItem('isSplitViewMode', String(newMode));
      if (newMode) {
        splitViewBtnRef.current?.classList.add('active');
        if (splitViewBtnRef.current) splitViewBtnRef.current.title = '退出分屏模式';
        document.body.classList.add('split-view-mode');
        syncSplitPanelState();
      } else {
        splitViewBtnRef.current?.classList.remove('active');
        if (splitViewBtnRef.current) splitViewBtnRef.current.title = '分屏模式';
        document.body.classList.remove('split-view-mode');
      }
      return newMode;
    });
  }, [syncSplitPanelState]);

  const onFolderClick = useCallback(() => {
    const iframeContainer = iframeContainerRef.current;
    const capturesIframe = capturesIframeRef.current;
    if (!iframeContainer || !capturesIframe) return;
    if (!capturesIframeLoaded) {
      capturesIframe.src = '/captures';
      setCapturesIframeLoaded(true);
    }
    iframeContainer.classList.add('active');
  }, [capturesIframeLoaded]);

  const onToggleLocalCamera = useCallback(async () => {
    if (isCameraOperationInProgress) return;
    setIsCameraOperationInProgress(true);
    const cameraSelect = document.getElementById('cameraSelect') as HTMLSelectElement;
    if (!cameraSelect) { setIsCameraOperationInProgress(false); return; }
    cameraSelect.value = cameraSelect.value === 'local' ? 'none' : 'local';
    if (cameraSelect.value === 'local') {
      setLocalCameraEnabled(true);
    } else {
      setLocalCameraEnabled(false);
      await fetch('/stop_camera', { method: 'POST' }).catch(() => {});
    }
    setIsCameraOperationInProgress(false);
  }, [isCameraOperationInProgress]);

  const onSelectAllRedClasses = useCallback(() => {
    const all = new Set(classOptions.map(x => x.id));
    setRedBoxClasses(all);
    saveRedBoxClasses(all);
  }, [classOptions, saveRedBoxClasses]);

  const onClearRedClasses = useCallback(() => {
    const empty = new Set<number>();
    setRedBoxClasses(empty);
    saveRedBoxClasses(empty);
  }, [saveRedBoxClasses]);

  const onRedClassToggle = useCallback((id: number, checked: boolean) => {
    setRedBoxClasses(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      saveRedBoxClasses(next);
      return next;
    });
  }, [saveRedBoxClasses]);

  const onWindowResize = useCallback(() => {
    if (confThresholdRef.current) updateSliderProgress(confThresholdRef.current, confProgressBarRef.current);
    if (iouThresholdRef.current) updateSliderProgress(iouThresholdRef.current, iouProgressBarRef.current);
    updateSliderPosition(currentDetectMode);
  }, [updateSliderProgress, updateSliderPosition, currentDetectMode]);

  useEffect(() => {
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, [onWindowResize]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelSelectWrapperRef.current && !modelSelectWrapperRef.current.contains(e.target as Node) && isModelDropdownOpen) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isModelDropdownOpen]);

  // ESC key for settings & user menu
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSettingsOpen) closeSettings();
        if (isUserMenuOpen) setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSettingsOpen, closeSettings, isUserMenuOpen]);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node) && isUserMenuOpen) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isUserMenuOpen]);

  // Iframe message listener
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.action === 'navigateToHome') {
        iframeContainerRef.current?.classList.remove('active');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Show current image when index changes
  useEffect(() => {
    if (uploadedFiles.length > 0) showCurrentImage();
  }, [currentImageIndex, uploadedFiles.length]); // eslint-disable-line

  return (
    <div className="app steel-home-page">
      {/* iframe容器 */}
      <div ref={iframeContainerRef} className="iframe-container">
        <iframe ref={capturesIframeRef} src="" frameBorder={0} title="检测记录" />
      </div>

      {/* 顶部导航 */}
      <header className="app-header">
        <div className="brand">
          <div className="logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 12L20 6L32 12V28L20 34L8 28V12Z" fill="currentColor" opacity="0.9"/>
              <path d="M8 12L20 18L32 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 18V34" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M8 12V28L20 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M32 12V28L20 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
              <line x1="28" y1="15" x2="28" y2="25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
            </svg>
          </div>
          <div className="title">
            <h1>钢材缺陷检测系统</h1>
          </div>
        </div>
        <div className="header-actions">
          <button ref={folderBtnRef} className="folder-btn" title="检测记录" onClick={onFolderClick}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button ref={settingsBtnRef} className="settings-btn" title="设置" onClick={() => isSettingsOpen ? closeSettings() : openSettings()}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
          {/* 用户菜单 */}
          <div className="user-menu-wrapper" ref={userMenuRef}>
            <button className="user-menu-trigger" title="用户菜单" onClick={() => setIsUserMenuOpen(prev => !prev)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span className="user-menu-name">{user?.username || '用户'}</span>
            </button>
            {isUserMenuOpen && (
              <div className="user-menu-dropdown">
                <div className="user-menu-info">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <div>
                    <div className="user-menu-username">{user?.username || '用户'}</div>
                    <div className="user-menu-usertype">{user?.user_type === 'admin' ? '管理员' : user?.user_type === 'enterprise' ? '企业用户' : '个人用户'}</div>
                  </div>
                </div>
                <div className="user-menu-divider"></div>
                <button className="user-menu-item" onClick={() => { setIsUserMenuOpen(false); logout(); navigate('/login'); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  退出登录
                </button>
                <button className="user-menu-item" onClick={() => { setIsUserMenuOpen(false); logout(); navigate('/login'); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
                    <polyline points="16 3 21 3 21 8"></polyline>
                    <line x1="4" y1="20" x2="21" y2="3"></line>
                    <polyline points="21 16 21 21 16 21"></polyline>
                    <line x1="15" y1="15" x2="21" y2="21"></line>
                    <line x1="4" y1="4" x2="9" y2="9"></line>
                  </svg>
                  切换用户
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 主内容 - 三栏布局 */}
      <main className="main three-column-layout">
        {/* 左侧面板 */}
        <aside className="left-sidebar">
          <div className="sidebar-content">
            <div className="panel">
              <div className="card-title">系统状态</div>
              <div className="panel-content">
                <div className="status-row">
                  <strong>摄像头</strong>
                  <span id="statusCamera">已关闭</span>
                </div>
                <div className="status-row">
                  <strong>检测模式</strong>
                  <span id="statusMode">缺陷检测</span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="card-title">模型信息</div>
              <div className="panel-content">
                <div className="status-row">
                  <strong>当前模型</strong>
                  <span id="statusModelType">-</span>
                </div>
                <div className="status-row">
                  <strong>设备</strong>
                  <span id="statusDevice">-</span>
                </div>
                <div className="status-row">
                  <strong>类别数</strong>
                  <span id="statusClassTotal">-</span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="card-title">检测日志</div>
              <div className="panel-content">
                <div className="status-row event-log-latest">
                  <strong>最新检测</strong>
                  <span id="statusEvent">-</span>
                </div>
                <ul ref={eventsListRef} className="event-log">
                  <li className="muted">暂无检测记录</li>
                </ul>
              </div>
            </div>
          </div>
        </aside>

        {/* 中间面板 */}
        <section className="center-panel">
          <select id="cameraSelect" className="hidden-element" style={{ display: 'none' }}>
            <option value="none">关闭</option>
            <option value="local">电脑摄像头</option>
            <option value="ip">IP摄像头</option>
          </select>
          <select id="mode" className="hidden-element" style={{ display: 'none' }}>
            <option value="detection">检测模式 (YOLO)</option>
            <option value="segmentation">分割模式 (UNet)</option>
          </select>

          {/* 视频检测区域 */}
          <div ref={videoDetectionSectionRef} className="detection-section" hidden>
            <div className="video-card">
              <div className="camera-header">
                <div className="camera-title">摄像头</div>
                <div className={`camera-switch ${localCameraEnabled ? 'active' : ''}`} onClick={onToggleLocalCamera} title="开启/关闭摄像头">
                  <div className="switch-track">
                    <div className="switch-thumb"></div>
                  </div>
                </div>
              </div>
              <div className="video-box">
                <img ref={videoFeedRef} id="videoFeed" src="" alt="视频流" draggable={false} style={{ display: 'none' }} />
                <canvas ref={canvasRef} id="canvas"></canvas>
                <div ref={overlayMessageRef} id="overlayMessage" className="overlay-message" hidden>请选择摄像头源</div>
              </div>
              <div className="legend">
                <div><span className="legend-box gb"></span>检测框</div>
              </div>
            </div>
          </div>

          {/* 图片检测区域 */}
          <div ref={imageDetectionSectionRef} className="detection-section" hidden={false}>
            <div className="upload-panel" ref={uploadPanelRef}>
              <div className="camera-header">
                <div className="camera-title">上传图片</div>
                <div className="camera-header-actions">
                  <button ref={splitViewBtnRef} className="btn" id="splitViewBtn" title="分屏模式" onClick={onSplitViewClick}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="12" y1="3" x2="12" y2="21"></line>
                    </svg>
                    AI侧栏
                  </button>
                  <button ref={detectBtnRef} className="btn primary" id="detectBtn" hidden onClick={runDetection}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    开始检测
                  </button>
                </div>
              </div>

              {/* 上传区域 */}
              <div ref={uploadZoneRef} className="upload-zone" id="uploadZone" onClick={onUploadZoneClick} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
                <svg className="upload-icon" viewBox="0 0 64 64" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 16C8 14.8954 8.89543 14 10 14H22L28 20H54C55.1046 20 56 20.8954 56 22V48C56 49.1046 55.1046 50 54 50H10C8.89543 50 8 49.1046 8 48V16Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
                  <path d="M8 24H56V48C56 49.1046 55.1046 50 54 50H10C8.89543 50 8 49.1046 8 48V24Z" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="3"/>
                </svg>
                <div className="upload-hint">点击或拖拽图片到此处</div>
                <div className="muted upload-subhint">JPG / PNG / BMP</div>
              </div>
              <input ref={fileInputRef} type="file" id="fileInput" accept="image/*" multiple className="hidden-element" style={{ display: 'none' }} onChange={onFileChange} />

              {/* 分屏模式下的右侧AI分析面板 */}
              <div id="splitAIAnalysisPanel" ref={splitAIAnalysisPanelRef}>
                <div className="camera-header">
                  <div className="camera-title">AI分析报告</div>
                  <div id="splitAIAnalysisSection" className="split-ai-section">
                    <button ref={splitAnalyzeWithLLMBtnRef} className="btn primary" onClick={analyzeWithLLM}>
                      开始AI分析
                    </button>
                  </div>
                </div>
                <div id="splitAIAnalysisResult" ref={splitAIAnalysisResultRef} className="split-ai-section" hidden>
                  <div id="splitAIAnalysisLoading" ref={splitAIAnalysisLoadingRef} className="ai-loading" hidden>
                    <div className="spinner"></div>
                    <div className="ai-loading-text">正在调用AI进行分析，请稍候...</div>
                  </div>
                  <div id="splitAIAnalysisContent" ref={splitAIAnalysisContentRef} className="split-ai-content"></div>
                </div>
                <div id="splitNoAnalysis" ref={splitNoAnalysisRef} className="split-ai-section no-analysis-hint">
                  <div className="split-no-analysis-hint">上传图片并检测后，点击"开始AI分析"获取智能报告</div>
                </div>
              </div>

              {/* 图片显示区域 */}
              <div className="images-container" id="imagesContainer" ref={imagesContainerRef} hidden>
                <div className="image-wrapper">
                  <button className="clear-image-btn" id="clearImageBtn" ref={clearImageBtnRef} title="清除图片，重新上传" onClick={clearImage}>×</button>
                  <img ref={originalImageDisplayRef} id="originalImageDisplay" alt="原图" />
                  <input className="image-label image-label-input" id="imageLabel" ref={imageLabelRef} type="text" value="原图" readOnly onKeyDown={onImageLabelKeyDown} onFocus={(e) => e.currentTarget.select()} />
                </div>
                <div className="image-wrapper" id="annotatedImageWrapper" ref={annotatedImageWrapperRef} hidden>
                  <img ref={annotatedImageDisplayRef} id="annotatedImageDisplay" alt="标注图" />
                  <div className="image-label">标注图</div>
                </div>
                <div className="image-wrapper" id="heatmapImageWrapper" ref={heatmapImageWrapperRef} hidden>
                  <img ref={heatmapImageDisplayRef} id="heatmapImageDisplay" alt="热力图" />
                  <div className="image-label">热力图</div>
                </div>
                <button className="nav-arrow prev-arrow" id="prevImageBtn" ref={prevImageBtnRef} hidden onClick={onPrevImage}>❮</button>
                <button className="nav-arrow next-arrow" id="nextImageBtn" ref={nextImageBtnRef} hidden onClick={onNextImage}>❯</button>
              </div>

              {/* 进度条 */}
              <div className="progress-container" id="progressContainer" ref={progressContainerRef} hidden>
                <div className="progress-bar">
                  <div className="progress-fill" id="progressFill" ref={progressFillRef}></div>
                </div>
                <div className="progress-text" id="progressText" ref={progressTextRef}>准备中...</div>
              </div>

              {/* 检测数据表格 */}
              <div id="detectionDataSection" className="detection-data-section" ref={detectionDataSectionRef} hidden>
                <h4 className="detection-data-title">📋 检测数据</h4>
                <div id="resultContent" ref={resultContentRef}></div>
              </div>

              <div className="loading" id="loading" ref={loadingRef}>
                <div className="spinner"></div>
                <div className="loading-text">检测中，请稍候...</div>
              </div>

              <div id="statusText" className="status-text" ref={statusTextRef} hidden></div>

              {/* 使用说明卡片 */}
              <div className="upload-instructions" id="uploadInstructions" ref={uploadInstructionsRef}>
                <div className="instructions-title">使用说明</div>
                <div className="instructions-list">
                  <div className="instruction-item">支持 JPG、PNG、BMP 格式的图片文件</div>
                  <div className="instruction-item">点击虚线框或拖拽图片到上方区域上传</div>
                  <div className="instruction-item">点击"开始检测"按钮进行钢材缺陷检测</div>
                  <div className="instruction-item">检测完成后可切换至"AI侧栏"模式获取智能分析</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 右侧面板 */}
        <aside className="right-sidebar">
          <div className="sidebar-content">
            <div className="panel control-panel-card">
              <div className="card-title">控制面板</div>
              <div className="mode-selection-section">
                <div className="mode-section-title">检测模式</div>
                <div className="mode-tabs-container">
                  <div className="mode-tabs-slider" id="modeTabsSlider"></div>
                  <div className={`mode-tab ${currentDetectMode === 'image' ? 'active' : ''}`} data-mode="image" onClick={() => selectMode('image')}>
                    <span className="mode-tab-label">导入图片</span>
                  </div>
                  <div className={`mode-tab ${currentDetectMode === 'local' ? 'active' : ''}`} data-mode="local" onClick={() => selectMode('local')}>
                    <span className="mode-tab-label">本地摄像头</span>
                  </div>
                  <div className={`mode-tab ${currentDetectMode === 'ip' ? 'active' : ''}`} data-mode="ip" onClick={() => selectMode('ip')}>
                    <span className="mode-tab-label">IP摄像头</span>
                  </div>
                </div>
              </div>
              <div className="model-selection-section">
                <div className="model-section-title">模型选择</div>
                <div className="custom-select" ref={modelSelectWrapperRef}>
                  <div className={`custom-select-trigger ${isModelDropdownOpen ? 'open' : ''}`} onClick={toggleModelDropdown}>
                    <span ref={modelSelectTextRef}>YOLO</span>
                    <svg className="custom-select-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 6 15 12 9 18"></polyline>
                    </svg>
                  </div>
                  <div className={`custom-select-options ${isModelDropdownOpen ? 'open' : ''}`} ref={modelDropdownOptionsRef}>
                    <div className="custom-select-options-inner">
                      <div className={`custom-option ${currentModel === 'yolo' ? 'active' : ''}`} data-value="yolo" onClick={() => selectModel('yolo')}>YOLO</div>
                      <div className={`custom-option ${currentModel === 'unet' ? 'active' : ''}`} data-value="unet" onClick={() => selectModel('unet')}>UNet</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 检测参数 */}
            <div className="panel params-panel">
              <div className="card-title">检测参数</div>
              <div className="param-control">
                <div className="param-header">
                  <label>置信度阈值 (Confidence)</label>
                  <span className="param-value" ref={confValueRef}>0.25</span>
                </div>
                <div className="slider-wrapper">
                  <div className="progress-bar" ref={confProgressBarRef}></div>
                  <input type="range" ref={confThresholdRef} min="0.01" max="0.99" step="0.01" defaultValue="0.25" onChange={onConfChange} />
                </div>
                <div className="param-hint">越低检测到越多缺陷，但可能包含误检</div>
              </div>
              <div className="param-control">
                <div className="param-header">
                  <label>IOU阈值 (NMS)</label>
                  <span className="param-value" ref={iouValueRef}>0.45</span>
                </div>
                <div className="slider-wrapper">
                  <div className="progress-bar" ref={iouProgressBarRef}></div>
                  <input type="range" ref={iouThresholdRef} min="0.01" max="0.99" step="0.01" defaultValue="0.45" onChange={onIouChange} />
                </div>
                <div className="param-hint">越高保留更多重叠框，越低过滤更严格</div>
              </div>
              <div className="param-control hidden-element" ref={screenshotIntervalControlRef} id="screenshotIntervalControl">
                <div className="param-header">
                  <label>截图间隔 (秒)</label>
                  <span className="param-value" ref={intervalValueRef}>5</span>
                </div>
                <div className="slider-wrapper">
                  <div className="progress-bar" ref={intervalProgressBarRef}></div>
                  <input type="range" ref={screenshotIntervalRef} min="1" max="5" step="1" defaultValue="5" onChange={onIntervalChange} />
                </div>
                <div className="param-hint">摄像头模式下自动截图的时间间隔</div>
              </div>
            </div>

            {/* 红框缺陷 */}
            <div className="panel">
              <div className="card-title">红框缺陷<span className="subtitle">点击缺陷名称切换红框显示</span></div>
              <div ref={redClassListRef} id="redClassList" className="class-checkbox-list">
                {classOptions.map(item => (
                  <div key={item.id} className={`class-checkbox-item ${redBoxClasses.has(item.id) ? 'checked' : ''}`}>
                    <input type="checkbox" id={`red-class-${item.id}`} checked={redBoxClasses.has(item.id)} onChange={(e) => onRedClassToggle(item.id, e.target.checked)} />
                    <label htmlFor={`red-class-${item.id}`}>{item.id} - {item.name}</label>
                  </div>
                ))}
              </div>
              <div className="red-class-status-row">
                <span>已选缺陷</span>
                <strong><span id="statusRedClassCount">{redBoxClasses.size}</span> 个</strong>
              </div>
              <div className="red-class-btn-row">
                <button id="selectAllRedClassesBtn" className="red-class-btn cancel-btn" onClick={onSelectAllRedClasses}>全选</button>
                <button id="clearRedClassesBtn" className="red-class-btn confirm-btn" onClick={onClearRedClasses}>清空</button>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="app-footer">
        钢材缺陷检测系统 · Built with YOLO26
      </footer>

      {/* IP地址输入弹窗 */}
      <div ref={ipAddressModalRef} id="ipAddressModal" className={`modal ${isIPModalActive ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeIPModal(null); }}>
        <div className="ip-modal-content">
          <div className="ip-modal-title">输入地址</div>
          <div className="ip-modal-input-wrapper">
            <input type="text" ref={ipAddressInputRef} className="ip-modal-input" placeholder="示例地址: 192.168.1.100:8080" onInput={() => { ipAddressInputRef.current?.classList.remove('error'); ipModalErrorMessageRef.current?.classList.remove('show'); }} />
            <div ref={ipModalErrorMessageRef} className="ip-modal-error-message">请输入IP摄像头地址</div>
          </div>
          <div className="ip-modal-buttons">
            <button className="ip-modal-btn cancel-btn" onClick={() => closeIPModal(null)}>取消</button>
            <button className="ip-modal-btn confirm-btn" onClick={confirmIPModal}>确定</button>
          </div>
        </div>
      </div>

      {/* 设置面板 */}
      <div className="settings-overlay" ref={settingsOverlayRef} onClick={closeSettings}></div>
      <div className="settings-panel" ref={settingsPanelRef}>
        <div className="settings-title">显示设置</div>
        <div className="settings-card">
          <div className="setting-item">
            <div className="setting-label">
              <div className="setting-title">动画程序</div>
              <div className="setting-description">点击组件时添加动画效果</div>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={animationEnabled} onChange={(e) => { setAnimationEnabled(e.target.checked); localStorage.setItem('animation_enabled', String(e.target.checked)); }} />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="setting-item">
            <div className="setting-label">
              <div className="setting-title">高对比度文字</div>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={highContrastEnabled} onChange={(e) => { setHighContrastEnabled(e.target.checked); localStorage.setItem('high_contrast_text', String(e.target.checked)); }} />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="setting-item">
            <div className="setting-label">
              <div className="setting-title">高斯模糊</div>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={blurEnabled} onChange={(e) => { setBlurEnabled(e.target.checked); localStorage.setItem('blur_enabled', String(e.target.checked)); }} />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SteelHomePage;
