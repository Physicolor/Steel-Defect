#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
钢材缺陷检测系统 - 主应用
功能：YOLO/UNet 双模检测 · 实时视频流 · 本地记录
"""
import os
import sys
import json
import time
import threading
from datetime import datetime
from flask import Flask, jsonify, render_template, request, Response, send_file
from werkzeug.utils import secure_filename

# 加载 .env 文件（如果存在）
try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print("[配置] 已加载 .env 文件")
except ImportError:
    print("[提示] 未安装 python-dotenv，如需使用 .env 文件请运行: pip install python-dotenv")

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(__file__))

# 导入服务层
try:
    from services.model_service import ModelService
    from services.video_service import open_camera
    from services.record_service import RecordService
    from services.spark_image_service import SparkImageService
except ImportError:
    print("[警告] 未找到 services 模块，部分功能可能不可用。请确保 services 包已创建。")

# ==================== 辅助函数 ====================
# 【功能】自动检测可用的计算设备（GPU/CPU）
# 【调用位置】Config类初始化时（第59行）
# 【返回值】设备字符串："cuda:0" 或 "cpu"
def _detect_device():
    """自动检测设备：优先使用 CUDA，否则 CPU"""
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda:0"
            print(f"[设备] 检测到 CUDA: {torch.cuda.get_device_name(0)}")
            print(f"[设备] 显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
            return device
        else:
            print("[设备] 未检测到 CUDA，使用 CPU")
            return "cpu"
    except Exception as e:
        print(f"[设备] CUDA检测失败 ({type(e).__name__}: {e})，使用 CPU")
        return "cpu"

# ==================== 配置区域 ====================
class Config:
    """系统配置"""
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    HOST = os.environ.get('FLASK_HOST', '0.0.0.0')
    PORT = int(os.environ.get('FLASK_PORT', 5000))
    
    # ✅ 设备配置：自动检测 CUDA，可通过环境变量覆盖
    # 设置 USE_CUDA=false 强制使用 CPU
    USE_CUDA = os.environ.get('USE_CUDA', 'true').lower() != 'false'
    DEVICE = _detect_device() if USE_CUDA else "cpu"
    
    # 文件路径配置
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_CONFIG_PATH = os.path.join(BASE_DIR, 'model_config.json')
    RECORDS_PATH = os.path.join(BASE_DIR, 'records.json')
    CAPTURE_DIR = os.path.join(BASE_DIR, 'captures')
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    
    # 默认模型路径（使用相对路径）
    DEFAULT_YOLO_MODEL = os.path.join(BASE_DIR, 'best (1).pt')
    DEFAULT_UNET_MODEL = os.path.join(BASE_DIR, 'myChannelUnet_2_neudet_best.pth')
    
    # 推理参数
    CONF_THRESHOLD = 0.25  # 置信度阈值
    IOU_THRESHOLD = 0.45   # IOU阈值（非极大值抑制）
    IMG_SIZE = 640

# ==================== 全局状态管理 ====================
class SystemState:
    """线程安全的系统状态管理"""
    def __init__(self):
        self._lock = threading.RLock()
        self.camera_source = None  # None / 0 / "http://..."
        self.cap = None
        self.mode = 'detection'  # 'detection' or 'segmentation'
        self.model = None
        self.red_box_classes = []  # 红框标记的类别ID列表
        self.is_running = False
        self.last_frame = None
        self.detection_results = []
        
        # 截图间隔和会话管理
        self.screenshot_interval = 5.0  # 截图间隔(秒),默认5秒
        self.camera_session_id = None  # 摄像头会话ID
        self.frame_counter = 0  # 帧计数器
        self.last_screenshot_time = 0  # 上次截图时间
        
        # 检测记录缓存（用于加速captures_data接口）
        self.captures_cache = {
            'data': None,
            'date_range': None,
            'timestamp': 0,
            'file_count': 0,
            'status': 'idle',      # idle / loading / ready / error
            'progress': 0,          # 0-100
            'total_files': 0
        }
        self.cache_lock = threading.Lock()
        self.cache_ttl = 30  # 缓存有效期（秒）
        
    def get(self):
        with self._lock:
            return {
                'camera_source': self.camera_source,
                'mode': self.mode,
                'is_running': self.is_running,
                'red_box_classes': self.red_box_classes
            }

# 初始化
app = Flask(__name__)
app.config.from_object(Config)
state = SystemState()

# 初始化服务
try:
    record_service = RecordService(Config.RECORDS_PATH, Config.CAPTURE_DIR)
    spark_image_service = SparkImageService()
    from services.spark_lite_service import SparkLiteService
    spark_lite_service = SparkLiteService()
    print(f"[服务] RecordService 已初始化: {Config.RECORDS_PATH}")
    print(f"[服务] SparkImageService 已初始化")
    print(f"[服务] SparkLiteService 已初始化")
except NameError as e:
    print(f"[警告] 服务初始化失败: {e}")
    record_service = None
    spark_image_service = None

# 创建必要目录
os.makedirs(Config.CAPTURE_DIR, exist_ok=True)
os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

# ==================== 辅助函数 ====================
def load_model_config():
    """加载模型配置"""
    if os.path.exists(Config.MODEL_CONFIG_PATH):
        try:
            with open(Config.MODEL_CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"current_model": Config.DEFAULT_YOLO_MODEL}

def save_model_config(config):
    """保存模型配置"""
    try:
        with open(Config.MODEL_CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[配置保存失败] {e}")

def init_model():
    """初始化模型"""
    config = load_model_config()
    model_path = config.get('current_model', Config.DEFAULT_YOLO_MODEL)
    
    # 如果配置的路径不存在，使用默认模型
    if not os.path.exists(model_path):
        if state.mode == 'detection' and os.path.exists(Config.DEFAULT_YOLO_MODEL):
            model_path = Config.DEFAULT_YOLO_MODEL
        elif state.mode == 'segmentation' and os.path.exists(Config.DEFAULT_UNET_MODEL):
            model_path = Config.DEFAULT_UNET_MODEL
        else:
            print("[警告] 未找到模型文件，请先上传或指定模型路径")
            return None
    
    try:
        print(f"[模型] 正在加载: {os.path.basename(model_path)}")
        print(f"[模型] 使用设备: {Config.DEVICE}")
        state.model = ModelService(model_path, device_cfg=Config.DEVICE)
        print(f"[模型] 加载成功: {state.model.model_type}")
        return state.model
    except Exception as e:
        print(f"[模型加载失败] {e}")
        return None

def _filter_batch_item(batch, filter_type, cls_filter):
    """检查单个批次是否通过筛选条件"""
    if not filter_type or not cls_filter or filter_type == 'all' or cls_filter == 'all':
        return True

    if filter_type == 'defect_type':
        has_defect = any(d.get('class_name') == cls_filter for d in (batch.get('defects') or []))
        if not has_defect and batch.get('crops'):
            has_defect = any(c.get('class_name') == cls_filter for c in batch['crops'])
        return has_defect

    elif filter_type == 'confidence':
        if not batch.get('defects'):
            return False
        try:
            min_conf, max_conf = [float(v) for v in cls_filter.split('-')]
            for defect in batch['defects']:
                conf = (defect.get('confidence', 0) or 0)
                if conf <= 1.0:
                    conf *= 100
                if min_conf <= conf < max_conf:
                    return True
            return False
        except Exception:
            return False

    elif filter_type == 'defect_count':
        defect_count = len(batch.get('defects') or []) or len(batch.get('crops') or [])
        try:
            return defect_count == int(cls_filter)
        except Exception:
            return False

    elif filter_type == 'source_type':
        return batch.get('source_type', 'legacy') == cls_filter

    return True


def _apply_filters(batches, filter_type, cls_filter):
    """对批次列表应用筛选（缺陷类型/置信度区间/缺陷个数/来源类型）"""
    return [b for b in batches if _filter_batch_item(b, filter_type, cls_filter)]


def _extract_timestamp_from_batch_id(batch_id):
    """从批次ID中提取时间戳字符串（YYYYMMDD_HHMMSS 或 YYYYMMDD_HHMMSS_mmm）"""
    import re
    # image_batch_20260508_234623_216
    m = re.match(r'image_batch_(\d{8}_\d{6}(?:_\d+)?)', batch_id)
    if m: return m.group(1)
    # camera_batch_20260502_111019 / ip_batch_20260502_111019 (后跟帧索引)
    m = re.match(r'(?:camera|ip)_batch_(\d{8}_\d{6})', batch_id)
    if m: return m.group(1)
    # batch_{defect_name}_{YYYYMMDD}_{HHMMSS}_{mmm} 或 batch_{YYYYMMDD}_{HHMMSS}_{mmm}
    m = re.match(r'batch_.*?_(\d{8}_\d{6}(?:_\d+)?)', batch_id)
    if m: return m.group(1)
    return None


def _parse_iso_date(iso_str):
    """解析 ISO 日期字符串，兼容有无秒数（YYYY-MM-DDTHH:MM / YYYY-MM-DDTHH:MM:SS）"""
    from datetime import datetime
    # 补齐秒数：2026-04-20T02:01 → 2026-04-20T02:01:00
    if 'T' in iso_str and iso_str.count(':') == 1:
        iso_str += ':00'
    return datetime.fromisoformat(iso_str)


def _parse_batch_timestamp(ts):
    """解析批次时间戳，支持多种格式"""
    from datetime import datetime
    # 处理带毫秒的格式：20260508_234623_216 → 取前两部分
    if '_' in ts:
        parts = ts.split('_')
        if len(parts) >= 2:
            date_str = parts[0]  # 20260508
            time_str = parts[1]  # 234623
            if len(date_str) == 8 and len(time_str) == 6:
                return datetime(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]),
                                int(time_str[:2]), int(time_str[2:4]), int(time_str[4:6]))
    # 格式化的时间戳：2026-05-02 11:10:19
    try:
        return datetime.strptime(ts, '%Y-%m-%d %H:%M:%S')
    except ValueError:
        pass
    # 纯日期时间格式
    try:
        return datetime.strptime(ts, '%Y%m%d_%H%M%S')
    except ValueError:
        pass
    return None


def _filter_by_date(batches, req_start, req_end):
    """按日期范围过滤批次列表"""
    if not req_start and not req_end:
        return batches
    filtered = []
    for batch in batches:
        ts = batch.get('timestamp', '')
        if not ts:
            filtered.append(batch)
            continue
        try:
            file_time = _parse_batch_timestamp(ts)
            if file_time is None:
                filtered.append(batch)
                continue
            if req_start:
                start_dt = _parse_iso_date(req_start)
                if file_time < start_dt:
                    continue
            if req_end:
                end_dt = _parse_iso_date(req_end)
                if file_time > end_dt:
                    continue
            filtered.append(batch)
        except Exception:
            filtered.append(batch)
    return filtered

def detection_thread():
    """后台检测线程"""
    import cv2
    import numpy as np
    
    last_save_time = 0  # 上次保存记录的时间
    save_count = 0  # 保存计数
    
    while state.is_running:
        if not state.cap or not state.cap.isOpened():
            time.sleep(0.1)
            continue
        
        ret, frame = state.cap.read()
        if not ret or frame is None:
            time.sleep(0.05)
            continue
        
        # 执行推理（全程识别）
        try:
            results = state.model.predict(frame, conf=Config.CONF_THRESHOLD, imgsz=Config.IMG_SIZE, iou=Config.IOU_THRESHOLD)
            
            # 处理检测结果
            detections = []
            if hasattr(results, 'boxes') and results.boxes is not None:
                boxes = results.boxes.xyxy.cpu().numpy()
                confs = results.boxes.conf.cpu().numpy()
                classes = results.boxes.cls.cpu().numpy().astype(int)
                
                
                for box, conf, cls_id in zip(boxes, confs, classes):
                    x1, y1, x2, y2 = map(int, box[:4])
                    bbox_list = [x1, y1, x2, y2]
                    detections.append({
                        'bbox': bbox_list,
                        'confidence': float(conf),
                        'class_id': int(cls_id),
                        'class_name': state.model.class_names.get(cls_id, f'class_{cls_id}')
                    })
                    
                    # 普通检测记录：每隔1秒保存一次（保留旧逻辑用于日志）
                    current_time = time.time()
                    if record_service and (current_time - last_save_time) >= 1.0:
                        record_service.save_record("DETECT", bbox_list, cls_id, conf)
                        last_save_time = current_time
                        save_count += 1
                        if save_count % 10 == 0:
                            print(f"[记录] 已保存 {save_count} 条检测记录")
            
            # 绘制检测结果
            annotated_frame = draw_detections(frame, detections, results)
            
            # 更新预览帧（实时显示识别框）
            state.last_frame = annotated_frame
            state.detection_results = detections
            
            # 新增: 截图间隔控制（只控制保存，不影响识别和预览）
            current_time = time.time()
            if current_time - state.last_screenshot_time < state.screenshot_interval:
                # 未达到截图间隔,跳过保存
                time.sleep(0.03)
                continue
            
            # 生成热力图
            heatmap = generate_heatmap(frame, detections)
            
            # 保存图片组（原图+标注图+热力图+缺陷裁剪图）
            if record_service and detections:
                # 新增: 判断摄像头类型
                source_type = 'camera' if state.camera_source == 0 else 'ip_camera'
                
                batch_id = record_service.save_image_group(
                    frame_original=frame,
                    frame_annotated=annotated_frame,
                    frame_heatmap=heatmap,
                    label="video",
                    detections=detections,
                    conf_threshold=Config.CONF_THRESHOLD,
                    iou_threshold=Config.IOU_THRESHOLD,
                    source_type=source_type,
                    frame_index=state.frame_counter,
                    batch_session_id=state.camera_session_id
                )
                if batch_id:
                    print(f"[视频流] 保存图片组: {batch_id} (帧#{state.frame_counter})")
                
                # 更新帧计数器和截图时间
                state.frame_counter += 1
                state.last_screenshot_time = current_time
            
        except Exception as e:
            print(f"[检测错误] {e}")
            import traceback
            traceback.print_exc()
            state.last_frame = frame
        
        time.sleep(0.03)  # ~30 FPS

def draw_detections(frame, detections, results):
    """在帧上绘制检测结果"""
    import cv2
    import numpy as np
    
    annotated = frame.copy()
    
    # 绘制检测框
    for det in detections:
        x1, y1, x2, y2 = det['bbox']
        conf = det['confidence']
        cls_id = det['class_id']
        
        # 根据类别选择颜色
        if cls_id in state.red_box_classes:
            color = (0, 0, 255)  # 红色
        else:
            color = (0, 255, 0)  # 绿色
        
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        
        # 准备标签文本
        label = f"{det['class_name']} {conf:.2f}"
        
        # 获取文本尺寸
        font_scale = 0.5
        thickness = 2
        (text_width, text_height), baseline = cv2.getTextSize(
            label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness
        )
        
        # 计算文本位置，确保在图片内部
        # 默认放在框的左上角内侧
        text_x = x1 + 5
        text_y = y1 + text_height + 5
        
        # 如果文本会超出右边界，放在框内靠右
        if text_x + text_width > x2:
            text_x = x2 - text_width - 5
        
        # 如果文本会超出上边界，放在框内下方
        if y1 < text_height + 10:
            text_y = y1 + text_height + 10
        
        # 如果文本会超出下边界，放在框内上方
        if text_y > y2:
            text_y = y2 - 5
        
        # 绘制文本背景（半透明矩形）
        bg_x1 = text_x - 2
        bg_y1 = text_y - text_height - 2
        bg_x2 = text_x + text_width + 2
        bg_y2 = text_y + 2
        
        # 确保背景在图片范围内
        bg_x1 = max(0, bg_x1)
        bg_y1 = max(0, bg_y1)
        bg_x2 = min(annotated.shape[1], bg_x2)
        bg_y2 = min(annotated.shape[0], bg_y2)
        
        cv2.rectangle(annotated, (bg_x1, bg_y1), (bg_x2, bg_y2), color, -1)
        
        # 绘制文本（白色）
        cv2.putText(annotated, label, (text_x, text_y),
                   cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)
    
    return annotated

def generate_heatmap(frame, detections):
    """生成热力图 - 根据缺陷置信度生成红黄渐变热力图"""
    import cv2
    import numpy as np
    
    # 创建空白热力图层
    heatmap = np.zeros_like(frame, dtype=np.uint8)
    
    # 为每个检测框生成热力图
    for det in detections:
        x1, y1, x2, y2 = det['bbox']
        conf = det['confidence']
        
        # 根据置信度计算颜色（从红色到黄色）
        # 高置信度=红色(0,0,255), 低置信度=黄色(0,255,255)
        red_intensity = int(255 * conf)
        green_intensity = int(255 * (1 - conf))
        color = (0, green_intensity, red_intensity)  # BGR格式
        
        # 在热力图上绘制半透明矩形
        overlay = heatmap.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)  # 填充矩形
        
        # 添加透明度混合
        alpha = 0.4 + (conf * 0.3)  # 置信度越高，透明度越高 (0.4-0.7)
        cv2.addWeighted(overlay, alpha, heatmap, 1 - alpha, 0, heatmap)
    
    # 如果有检测结果，将热力图与原图混合
    if detections:
        # 使用addWeighted混合原图和热力图
        result = cv2.addWeighted(frame, 0.6, heatmap, 0.4, 0)
        return result
    else:
        # 没有检测结果，返回原图
        return frame.copy()

def generate_frames():
    """生成视频流（MJPEG）"""
    import cv2
    
    while state.is_running:
        if state.last_frame is not None:
            ret, buffer = cv2.imencode('.jpg', state.last_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ret:
                frame_bytes = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        time.sleep(0.03)

# ==================== 路由层 ====================

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

@app.route('/detect')
def detect_page():
    """检测页面"""
    return render_template('detect.html')

@app.route('/captures')
def captures_page():
    """截图浏览页面"""
    return render_template('captures.html')

@app.route('/video_feed')
def video_feed():
    """视频流端点"""
    return Response(generate_frames(),
                   mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/detect_image', methods=['POST'])
def detect_image():
    """上传图片进行检测"""
    import cv2
    import base64
    import numpy as np
    
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "未上传文件"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "文件名为空"}), 400
    
    if not state.model:
        return jsonify({"success": False, "error": "模型未加载"}), 500
    
    try:
        # 读取上传的图片
        img_bytes = file.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({"success": False, "error": "无法解码图片"}), 400
        
        # 执行推理
        results = state.model.predict(frame, conf=Config.CONF_THRESHOLD, imgsz=Config.IMG_SIZE, iou=Config.IOU_THRESHOLD)
        
        # 处理检测结果
        detections = []
        if hasattr(results, 'boxes') and results.boxes is not None:
            boxes = results.boxes.xyxy.cpu().numpy()
            confs = results.boxes.conf.cpu().numpy()
            classes = results.boxes.cls.cpu().numpy().astype(int)
            
            for box, conf, cls_id in zip(boxes, confs, classes):
                x1, y1, x2, y2 = map(int, box[:4])
                detections.append({
                    'bbox': [x1, y1, x2, y2],
                    'confidence': float(conf),
                    'class_id': int(cls_id),
                    'class_name': state.model.class_names.get(cls_id, f'class_{cls_id}')
                })
                
                # 保存检测记录（日志）
                record_service.save_record("IMAGE_DETECT", box, cls_id, conf)
        
        # 绘制检测结果
        annotated_frame = draw_detections(frame, detections, results)
        
        # 生成热力图
        heatmap = generate_heatmap(frame, detections)
        
        # 保存图片组（原图+标注图+热力图+缺陷裁剪图）
        batch_id = None
        if record_service:
            batch_id = record_service.save_image_group(
                frame_original=frame,
                frame_annotated=annotated_frame,
                frame_heatmap=heatmap,
                label="image",
                detections=detections,
                conf_threshold=Config.CONF_THRESHOLD,
                iou_threshold=Config.IOU_THRESHOLD,
                source_type='image'  # 新增: 标记为图片模式
            )
            if batch_id:
                print(f"[图片检测] 保存图片组: {batch_id}")
        
        # 转换为 base64
        _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        # 将原图也转换为 base64
        _, orig_buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        orig_base64 = base64.b64encode(orig_buffer).decode('utf-8')
        
        # 将热力图转换为 base64
        _, heatmap_buffer = cv2.imencode('.jpg', heatmap, [cv2.IMWRITE_JPEG_QUALITY, 85])
        heatmap_base64 = base64.b64encode(heatmap_buffer).decode('utf-8')
        
        return jsonify({
            "success": True,
            "image_base64": img_base64,
            "original_image_base64": orig_base64,
            "heatmap_base64": heatmap_base64,
            "detections": detections,
            "model_type": state.model.model_type,
            "image_size": [int(frame.shape[1]), int(frame.shape[0])],
            "batch_id": batch_id  # 添加批次ID
        })
        
    except Exception as e:
        print(f"[图片检测失败] {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/status')
def api_status():
    """系统状态 API"""
    st = state.get()
    model_status = state.model.get_status() if state.model else None
    
    return jsonify({
        "code": 200,
        "data": {
            "system": st,
            "model": model_status,
            "timestamp": time.time()
        }
    })

@app.route('/model_status')
def model_status():
    """模型状态"""
    config = load_model_config()
    
    # 获取当前加载的模型信息
    current_model_info = {}
    if state.model:
        current_model_info = state.model.get_status()
    
    # 返回 YOLO 和 UNet 模型路径
    return jsonify({
        "success": True,
        "model": {
            **current_model_info,
            "weights_path": Config.DEFAULT_YOLO_MODEL,  # YOLO 模型路径
            "unet_weights_path": Config.DEFAULT_UNET_MODEL  # UNet 模型路径
        }
    })

@app.route('/class_options')
def class_options():
    """获取类别选项"""
    if state.model:
        names = state.model.get_names()
        if isinstance(names, dict):
            options = [{"id": k, "name": v} for k, v in names.items()]
        else:
            options = [{"id": i, "name": str(n)} for i, n in enumerate(names)]
        return jsonify(options)
    return jsonify([])

@app.route('/red_box_classes')
def red_box_classes():
    """获取红框类别"""
    return jsonify({"classes": state.red_box_classes})

@app.route('/set_red_box_classes', methods=['POST'])
def set_red_box_classes():
    """设置红框类别"""
    data = request.json
    state.red_box_classes = data.get('classes', [])
    return jsonify({"success": True})

@app.route('/set_camera', methods=['POST'])
def set_camera():
    """设置摄像头"""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"success": False, "error": "无效的请求数据"}), 400
    source = data.get('source') or data.get('camera_type')
    
    # 关闭现有摄像头
    if state.cap:
        try:
            state.cap.release()
        except Exception:
            pass
        state.cap = None
    
    if source == 'none' or source is None:
        state.camera_source = None
        state.is_running = False
        return jsonify({"success": True, "status": "closed"})
    
    try:
        # 转换源格式
        if source == 'local':
            cam_source = 0
        elif isinstance(source, str) and source.startswith(('http://', 'rtsp://')):
            cam_source = source
        else:
            if source == 'ip':
                ip_address = data.get('ip_address', '')
                if not ip_address:
                    return jsonify({"success": False, "error": "未提供IP地址"}), 400
                cam_source = ip_address
            else:
                cam_source = int(source)
        
        print(f"[摄像头] 正在打开: {cam_source}")
        state.cap = open_camera(cam_source)
        state.camera_source = cam_source
        state.is_running = True
        
        # 初始化摄像头会话
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        session_prefix = 'camera_batch' if source == 'local' else 'ip_batch'
        state.camera_session_id = f"{session_prefix}_{timestamp}"
        state.frame_counter = 0
        state.last_screenshot_time = 0
        print(f"[会话管理] 会话ID: {state.camera_session_id}")
        
        # 启动检测线程
        thread = threading.Thread(target=detection_thread, daemon=True)
        thread.start()
        
        print(f"[摄像头] 启动成功")
        return jsonify({"success": True, "status": "running", "source": str(cam_source)})
    except Exception as e:
        print(f"[摄像头错误] {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/get_camera_status')
def get_camera_status():
    """获取摄像头状态"""
    st = state.get()
    return jsonify({
        "is_running": st['is_running'],
        "camera_source": st['camera_source'],
        "mode": st['mode']
    })

@app.route('/stop_camera', methods=['POST'])
def stop_camera():
    """关闭摄像头"""
    print("[API] 关闭摄像头")
    
    # 停止检测循环
    state.is_running = False
    
    # 释放摄像头
    if state.cap:
        state.cap.release()
        state.cap = None
    
    # 清空状态
    state.camera_source = None
    state.last_frame = None
    
    # 新增: 清空会话状态
    print(f"[会话管理] 结束会话: {state.camera_session_id}, 总帧数: {state.frame_counter}")
    state.camera_session_id = None
    state.frame_counter = 0
    state.last_screenshot_time = 0
    
    print("[摄像头] 已关闭")
    return jsonify({"success": True, "status": "closed"})

@app.route('/get_screenshot_interval')
def get_screenshot_interval():
    """获取截图间隔"""
    return jsonify({"interval": state.screenshot_interval})

@app.route('/set_screenshot_interval', methods=['POST'])
def set_screenshot_interval():
    """设置截图间隔"""
    data = request.json
    interval = data.get('interval', 5.0)
    
    # 限制范围1-5秒
    interval = max(1.0, min(5.0, float(interval)))
    state.screenshot_interval = interval
    
    print(f"[截图间隔] 设置为: {interval}秒")
    return jsonify({"success": True, "interval": interval})

@app.route('/set_mode', methods=['POST'])
def set_mode():
    """设置检测模式"""
    data = request.json
    mode = data.get('mode', 'detection')
    
    if mode not in ['detection', 'segmentation']:
        return jsonify({"success": False, "error": "无效模式"}), 400
    
    state.mode = mode
    
    # 重新加载对应类型的模型
    config = load_model_config()
    if mode == 'detection':
        model_path = Config.DEFAULT_YOLO_MODEL
    else:
        model_path = Config.DEFAULT_UNET_MODEL
    
    if os.path.exists(model_path):
        try:
            print(f"[模式切换] 使用设备: {Config.DEVICE}")
            state.model = ModelService(model_path, device_cfg=Config.DEVICE)
            config['current_model'] = model_path
            save_model_config(config)
            return jsonify({"success": True, "model_type": state.model.model_type})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500
    
    return jsonify({"success": False, "error": "模型文件不存在"}), 404

@app.route('/set_model_weights', methods=['POST'])
def set_model_weights():
    """切换模型权重"""
    data = request.json
    # 兼容前端传递的 weights_path 和 path 两种参数名
    model_path = data.get('weights_path') or data.get('path')
    
    if not model_path:
        return jsonify({"success": False, "error": "未提供模型路径"}), 400
    
    # 如果是相对路径，转换为绝对路径
    if not os.path.isabs(model_path):
        model_path = os.path.join(Config.BASE_DIR, model_path)
    
    if not os.path.exists(model_path):
        return jsonify({"success": False, "error": f"模型文件不存在: {model_path}"}), 404
    
    try:
        state.model.reload_weights(model_path)
        
        # 更新配置（保存相对路径）
        config = load_model_config()
        rel_path = os.path.relpath(model_path, Config.BASE_DIR)
        config['current_model'] = rel_path
        
        # 更新最近使用的模型列表
        recent = config.get('recent_models', [])
        if rel_path in recent:
            recent.remove(rel_path)
        recent.insert(0, rel_path)
        config['recent_models'] = recent[:10]
        save_model_config(config)
        
        print(f"[模型] 成功切换到: {os.path.basename(model_path)}")
        return jsonify({"success": True, "model_type": state.model.model_type})
    except Exception as e:
        print(f"[模型切换失败] {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/get_detection_params')
def get_detection_params():
    """获取检测参数"""
    return jsonify({
        "conf_threshold": Config.CONF_THRESHOLD,
        "iou_threshold": Config.IOU_THRESHOLD,
        "img_size": Config.IMG_SIZE
    })

@app.route('/set_conf_threshold', methods=['POST'])
def set_conf_threshold():
    """设置置信度阈值"""
    data = request.json
    conf = data.get('conf_threshold', 0.25)
    # 限制范围在0.01-0.99之间
    Config.CONF_THRESHOLD = max(0.01, min(0.99, float(conf)))
    return jsonify({"success": True, "conf_threshold": Config.CONF_THRESHOLD})

@app.route('/set_iou_threshold', methods=['POST'])
def set_iou_threshold():
    """设置IOU阈值"""
    data = request.json
    iou = data.get('iou_threshold', 0.45)
    # 限制范围在0.01-0.99之间
    Config.IOU_THRESHOLD = max(0.01, min(0.99, float(iou)))
    return jsonify({"success": True, "iou_threshold": Config.IOU_THRESHOLD})

@app.route('/download_records')
def download_records():
    """下载检测记录"""
    if os.path.exists(Config.RECORDS_PATH):
        return send_file(Config.RECORDS_PATH, 
                        as_attachment=True,
                        download_name=f"records_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    return jsonify({"error": "记录文件不存在"}), 404

@app.route('/captures_data')
def captures_data():
    """获取检测记录数据（按批次分组）- 支持缓存和增量加载"""
    import glob
    import re
    import time as time_module
    from datetime import datetime

    perf_start = time_module.time()

    # 获取筛选参数
    filter_type = request.args.get('filter_type', 'defect_type')  # defect_type, confidence, source_type
    cls_filter = request.args.get('cls', 'all')  # 具体的筛选值
    req_start = request.args.get('start', '')  # 开始日期
    req_end = request.args.get('end', '')  # 结束日期
    
    # 检查缓存是否有效
    current_time = time_module.time()
    with state.cache_lock:
        cache_valid = (
            state.captures_cache['data'] is not None and
            (current_time - state.captures_cache['timestamp']) < state.cache_ttl
        )
        if cache_valid:
            cached_file_count = state.captures_cache['file_count']
            # 快速检查文件数量是否有变化
            capture_files_count = len(glob.glob(os.path.join(Config.CAPTURE_DIR, '*.jpg'))) + \
                                  len(glob.glob(os.path.join(Config.CAPTURE_DIR, '*.json')))
            if cached_file_count == capture_files_count:
                print(f"[数据] 使用缓存 ({cached_file_count} 个文件)")

                # 即使使用缓存，也要应用筛选逻辑
                result = state.captures_cache['data']
                # 按日期范围筛选
                result = _filter_by_date(result, req_start, req_end)
                # 按缺陷类型/置信度等筛选
                if cls_filter and cls_filter != 'all':
                    result = _apply_filters(result, filter_type, cls_filter)

                return jsonify({
                    'data': result,
                    'date_range': state.captures_cache['date_range'],
                    'cached': True
                })
    
    # 检查是否已有后台预加载正在进行（避免重复扫描）
    retry_count = 0
    while True:
        with state.cache_lock:
            current_status = state.captures_cache['status']
        if current_status != 'loading':
            break
        retry_count += 1
        if retry_count > 25:
            break
        time_module.sleep(0.2)

    # 缓存无效，重新扫描
    with state.cache_lock:
        state.captures_cache['status'] = 'loading'
        state.captures_cache['progress'] = 0

    capture_files = glob.glob(os.path.join(Config.CAPTURE_DIR, '*.jpg')) + \
                    glob.glob(os.path.join(Config.CAPTURE_DIR, '*.json'))
    file_count = len(capture_files)

    with state.cache_lock:
        state.captures_cache['total_files'] = file_count
    
    # 从文件名提取时间戳进行排序（避免调用getmtime）
    def extract_time_from_filename(filepath):
        filename = os.path.basename(filepath)
        
        # 尝试匹配新格式: batch_{defect_name}_{timestamp}_{type}
        match = re.match(r'batch_[a-zA-Z0-9_-]+_(\d{8}_\d{6}_\d+)', filename)
        if not match:
            # 尝试匹配旧格式: batch_{timestamp}_{type}
            match = re.match(r'batch_(\d{8}_\d{6})', filename)
        
        if match:
            try:
                timestamp_str = match.group(1)  # 20260430_012652_123 或 20260430_012652
                parts = timestamp_str.split('_')
                if len(parts) >= 2:
                    date_str = parts[0]
                    time_str = parts[1]
                    year = int(date_str[:4])
                    month = int(date_str[4:6])
                    day = int(date_str[6:8])
                    hour = int(time_str[:2])
                    minute = int(time_str[2:4])
                    second = int(time_str[4:6])
                    return time_module.mktime((year, month, day, hour, minute, second, 0, 0, -1))
            except:
                pass
        # 回退到文件修改时间
        return os.path.getmtime(filepath)
    
    capture_files.sort(key=extract_time_from_filename, reverse=True)
    
    # 按批次ID分组
    batches = {}
    min_time = None
    max_time = None
    
    # 新增: 用于摄像头会话分组
    camera_sessions = {}  # {session_id: {batch_id: batch_data}}
    
    for img_path in capture_files:
        filename = os.path.basename(img_path)
        mtime = os.path.getmtime(img_path)
        
        # 解析文件名格式：
        # 新格式: batch_{defect_name}_{timestamp}_{type}.jpg  (如 batch_rolled-in_scale_20260430_225606_914_original.jpg)
        # 旧格式: batch_{timestamp}_{type}.jpg  (如 batch_20260430_224207_708_original.jpg)
        # 摄像头格式: camera_batch_{timestamp}_{index}_{type}.jpg 或 ip_batch_{timestamp}_{index}_{type}.jpg
        # 图片格式: image_batch_{timestamp}_{type}.jpg
        
        # 尝试匹配摄像头格式: camera_batch_{timestamp}_{ms}_{index}_{type}.jpg 或 ip_batch_{timestamp}_{ms}_{index}_{type}.jpg
        # 例如: camera_batch_20260502_111019_476_000_original.jpg
        camera_match = re.match(r'(camera_batch|ip_batch)_(\d{8}_\d{6})_(\d+)_(\d+)_(.+)', filename)
        
        if camera_match:
            # 摄像头会话模式
            source_prefix = camera_match.group(1)
            timestamp_part = camera_match.group(2)
            ms_part = camera_match.group(3)  # 毫秒部分，不使用
            frame_index = int(camera_match.group(4))  # 帧索引
            image_type = camera_match.group(5).replace('.jpg', '').replace('.json', '')  # 图片类型
            batch_id = f"{source_prefix}_{timestamp_part}_{frame_index:03d}"
            session_id = f"{source_prefix}_{timestamp_part}"
            timestamp_str = timestamp_part
            
            # 解析时间戳计算时间范围
            try:
                parts = timestamp_str.split('_')
                if len(parts) >= 2:
                    date_str = parts[0]
                    time_str = parts[1]
                    
                    year = int(date_str[:4])
                    month = int(date_str[4:6])
                    day = int(date_str[6:8])
                    hour = int(time_str[:2])
                    minute = int(time_str[2:4])
                    second = int(time_str[4:6])
                    
                    import time
                    file_time = time.mktime((year, month, day, hour, minute, second, 0, 0, -1))
                    
                    if min_time is None or file_time < min_time:
                        min_time = file_time
                    if max_time is None or file_time > max_time:
                        max_time = file_time
            except:
                if min_time is None or mtime < min_time:
                    min_time = mtime
                if max_time is None or mtime > max_time:
                    max_time = mtime
            
            # 初始化会话
            if session_id not in camera_sessions:
                camera_sessions[session_id] = {
                    'session_id': session_id,
                    'source_type': 'camera' if source_prefix == 'camera_batch' else 'ip_camera',
                    'timestamp': timestamp_str,
                    'mtime': mtime,
                    'frames': {},  # {frame_index: frame_data}
                    'total_frames': 0
                }
            
            # 初始化帧
            if frame_index not in camera_sessions[session_id]['frames']:
                camera_sessions[session_id]['frames'][frame_index] = {
                    'batch_id': batch_id,
                    'frame_index': frame_index,
                    'images': {},
                    'crops': [],
                    'defects': [],
                    'detection_params': {}
                }
            
            frame_data = camera_sessions[session_id]['frames'][frame_index]
            
            # 分类图片类型
            if image_type == 'original':
                frame_data['images']['original'] = filename
            elif image_type == 'annotated':
                frame_data['images']['annotated'] = filename
            elif image_type == 'heatmap':
                frame_data['images']['heatmap'] = filename
            elif image_type.startswith('crop_'):
                crop_parts = image_type.split('_', 2)
                if len(crop_parts) >= 3:
                    crop_index = int(crop_parts[1])
                    crop_class = crop_parts[2]
                    frame_data['crops'].append({
                        'filename': filename,
                        'index': crop_index,
                        'class_name': crop_class
                    })
            elif image_type == 'info':
                try:
                    json_path = os.path.join(Config.CAPTURE_DIR, filename)
                    with open(json_path, 'r', encoding='utf-8') as f:
                        info_data = json.load(f)
                        frame_data['defects'] = info_data.get('defects', [])
                        frame_data['detection_params'] = info_data.get('detection_params', {})
                        frame_data['timestamp'] = timestamp_str if timestamp_str else info_data.get('timestamp_short', '')
                        camera_sessions[session_id]['total_frames'] = max(
                            camera_sessions[session_id]['total_frames'],
                            frame_index + 1
                        )
                except Exception as e:
                    print(f"[读取帧信息失败] {batch_id}: {e}")
        else:
            # 尝试匹配图片格式: image_batch_{timestamp}_{type}.jpg
            # 时间戳格式: 20260502_210025_123 (包含毫秒)
            image_match = re.match(r'(image_batch)_(\d{8}_\d{6}_\d+?)_(.+)', filename)
            
            if image_match:
                # 图片模式
                timestamp_part = image_match.group(2)
                image_type = image_match.group(3).replace('.jpg', '').replace('.json', '')
                batch_id = f"image_batch_{timestamp_part}"
                timestamp_str = timestamp_part
                
                # 时间戳处理(同上)
                try:
                    parts = timestamp_str.split('_')
                    if len(parts) >= 2:
                        date_str = parts[0]
                        time_str = parts[1]
                        
                        year = int(date_str[:4])
                        month = int(date_str[4:6])
                        day = int(date_str[6:8])
                        hour = int(time_str[:2])
                        minute = int(time_str[2:4])
                        second = int(time_str[4:6])
                        
                        import time
                        file_time = time.mktime((year, month, day, hour, minute, second, 0, 0, -1))
                        
                        if min_time is None or file_time < min_time:
                            min_time = file_time
                        if max_time is None or file_time > max_time:
                            max_time = file_time
                except:
                    if min_time is None or mtime < min_time:
                        min_time = mtime
                    if max_time is None or mtime > max_time:
                        max_time = mtime
                
                if batch_id not in batches:
                    batches[batch_id] = {
                        'batch_id': batch_id,
                        'source_type': 'image',
                        'timestamp': timestamp_str,
                        'mtime': mtime,
                        'images': {},
                        'crops': [],
                        'defects': [],
                        'detection_params': {}
                    }
                
                # 分类图片类型
                if image_type == 'original':
                    batches[batch_id]['images']['original'] = filename
                elif image_type == 'annotated':
                    batches[batch_id]['images']['annotated'] = filename
                elif image_type == 'heatmap':
                    batches[batch_id]['images']['heatmap'] = filename
                elif image_type.startswith('crop_'):
                    crop_parts = image_type.split('_', 2)
                    if len(crop_parts) >= 3:
                        crop_index = int(crop_parts[1])
                        crop_class = crop_parts[2]
                        batches[batch_id]['crops'].append({
                            'filename': filename,
                            'index': crop_index,
                            'class_name': crop_class
                        })
                elif image_type == 'info':
                    try:
                        json_path = os.path.join(Config.CAPTURE_DIR, filename)
                        with open(json_path, 'r', encoding='utf-8') as f:
                            info_data = json.load(f)
                            batches[batch_id]['defects'] = info_data.get('defects', [])
                            batches[batch_id]['detection_params'] = info_data.get('detection_params', {})
                            batches[batch_id]['timestamp'] = timestamp_str if timestamp_str else info_data.get('timestamp_short', '')
                    except Exception as e:
                        print(f"[读取批次信息失败] {batch_id}: {e}")
            else:
                # 不匹配任何新格式,尝试旧格式或带缺陷名的新格式
                # 新格式: batch_{defect_name}_{timestamp}_{type}.jpg  (如 batch_rolled-in_scale_20260430_225606_914_original.jpg)
                # 旧格式: batch_{timestamp}_{type}.jpg  (如 batch_20260430_224207_708_original.jpg)
                
                # 先尝试匹配带缺陷名的新格式
                new_batch_match = re.match(r'batch_([a-zA-Z0-9_-]+?)_(\d{8}_\d{6}_\d+?)_(.+)', filename)
                if new_batch_match:
                    defect_name = new_batch_match.group(1)
                    timestamp_part = new_batch_match.group(2)
                    image_type = new_batch_match.group(3).replace('.jpg', '').replace('.json', '')
                    batch_id = f"batch_{defect_name}_{timestamp_part}"
                    timestamp_str = timestamp_part
                else:
                    # 尝试匹配旧格式
                    match = re.match(r'batch_(\d{8}_\d{6}_\d+?)_(.+)', filename)
                    if not match:
                        continue
                    
                    batch_id = f"batch_{match.group(1)}"
                    image_type = match.group(2).replace('.jpg', '').replace('.json', '')
                    timestamp_str = match.group(1)
            
            # 从文件名中提取时间戳（更快的方式）
            try:
                # 解析时间戳: 20260430_012652 -> 2026-04-30 01:26:52
                parts = timestamp_str.split('_')
                if len(parts) >= 2:
                    date_str = parts[0]  # 20260430
                    time_str = parts[1]  # 012652
                    
                    year = int(date_str[:4])
                    month = int(date_str[4:6])
                    day = int(date_str[6:8])
                    hour = int(time_str[:2])
                    minute = int(time_str[2:4])
                    second = int(time_str[4:6])
                    
                    import time
                    file_time = time.mktime((year, month, day, hour, minute, second, 0, 0, -1))
                    
                    # 更新时间范围（使用文件时间而不是mtime，更快）
                    if min_time is None or file_time < min_time:
                        min_time = file_time
                    if max_time is None or file_time > max_time:
                        max_time = file_time
            except:
                # 如果解析失败，回退到使用mtime
                if min_time is None or mtime < min_time:
                    min_time = mtime
                if max_time is None or mtime > max_time:
                    max_time = mtime
            
            if batch_id not in batches:
                batches[batch_id] = {
                    'batch_id': batch_id,
                    'source_type': 'legacy',  # 标记为旧格式
                    'timestamp': timestamp_str,  # 使用时间戳字符串
                    'mtime': mtime,
                    'images': {},
                    'crops': [],
                    'defects': [],
                    'detection_params': {}
                }
            
            # 分类图片类型
            if image_type == 'original':
                batches[batch_id]['images']['original'] = filename
            elif image_type == 'annotated':
                batches[batch_id]['images']['annotated'] = filename
            elif image_type == 'heatmap':
                batches[batch_id]['images']['heatmap'] = filename
            elif image_type.startswith('crop_'):
                # 解析裁剪图信息: crop_{index}_{class}
                crop_parts = image_type.split('_', 2)
                if len(crop_parts) >= 3:
                    crop_index = int(crop_parts[1])
                    crop_class = crop_parts[2]
                    batches[batch_id]['crops'].append({
                        'filename': filename,
                        'index': crop_index,
                        'class_name': crop_class
                    })
            elif image_type == 'info':
                # 读取JSON文件中的缺陷信息
                try:
                    json_path = os.path.join(Config.CAPTURE_DIR, filename)
                    with open(json_path, 'r', encoding='utf-8') as f:
                        info_data = json.load(f)
                        batches[batch_id]['defects'] = info_data.get('defects', [])
                        batches[batch_id]['detection_params'] = info_data.get('detection_params', {})
                        batches[batch_id]['timestamp'] = timestamp_str if timestamp_str else info_data.get('timestamp_short', '')
                except Exception as e:
                    print(f"[读取批次信息失败] {batch_id}: {e}")

    # 将摄像头会话转换为batch格式
    for session_id, session_data in camera_sessions.items():
        # 按帧索引排序
        sorted_frames = sorted(session_data['frames'].items(), key=lambda x: x[0])
        
        # 使用第一帧作为会话的代表
        if sorted_frames:
            first_frame_index, first_frame_data = sorted_frames[0]
            
            batch_entry = {
                'batch_id': session_id,
                'source_type': session_data['source_type'],
                'timestamp': session_data['timestamp'],
                'mtime': session_data['mtime'],
                'images': first_frame_data['images'],  # 使用第一帧的图片
                'crops': first_frame_data['crops'],
                'defects': first_frame_data['defects'],
                'detection_params': first_frame_data['detection_params'],
                'is_camera_session': True,  # 标记为摄像头会话
                'total_frames': session_data['total_frames'],
                'frames': [{'frame_index': idx, 'batch_id': data['batch_id']} for idx, data in sorted_frames]
            }
            batches[session_id] = batch_entry
    
    # 转换为列表并按时间排序
    result = sorted(batches.values(), key=lambda x: x['mtime'], reverse=True)
    
    # 为每个批次添加缩略图（优先显示带缺陷框的图片）
    for batch in result:
        thumbnail_found = None
        
        # 对于摄像头会话，需要从所有帧中找到有图片的帧
        if batch.get('is_camera_session') and batch.get('frames'):
            # 遍历所有帧，找到有图片的帧
            for frame in batch['frames']:
                frame_batch_id = frame['batch_id']
                # 从batches中查找该帧的详细信息
                if frame_batch_id in batches:
                    frame_data = batches[frame_batch_id]
                    # 按优先级选择：annotated(带缺陷框) > heatmap > original > crops
                    if 'annotated' in frame_data.get('images', {}):
                        thumbnail_found = frame_data['images']['annotated']
                        break
                    elif 'heatmap' in frame_data.get('images', {}):
                        thumbnail_found = frame_data['images']['heatmap']
                        break
                    elif 'original' in frame_data.get('images', {}):
                        thumbnail_found = frame_data['images']['original']
                        break
        
        # 如果摄像头会话没找到，或者非摄像头会话，尝试从当前batch的images中找
        if not thumbnail_found:
            # 按优先级选择：annotated(带缺陷框) > heatmap > original > crops
            if 'annotated' in batch.get('images', {}):
                thumbnail_found = batch['images']['annotated']
            elif 'heatmap' in batch.get('images', {}):
                thumbnail_found = batch['images']['heatmap']
            elif 'original' in batch.get('images', {}):
                thumbnail_found = batch['images']['original']
            else:
                # 如果没有以上图片，使用第一个可用的图片
                if batch.get('images'):
                    thumbnail_found = next(iter(batch['images'].values()), None)
                # 如果images也为空，尝试从crops中找
                if not thumbnail_found and batch.get('crops'):
                    thumbnail_found = batch['crops'][0].get('filename')
        
        # 确保thumbnail不为None
        batch['thumbnail'] = thumbnail_found or ''
        
        # 计算图片总数
        batch['image_count'] = len(batch.get('images', {})) + len(batch.get('crops', []))
    
    # 更新缓存
    with state.cache_lock:
        state.captures_cache['data'] = result
        state.captures_cache['date_range'] = {
            'min': min_time,
            'max': max_time
        }
        state.captures_cache['timestamp'] = current_time
        state.captures_cache['file_count'] = file_count
        state.captures_cache['status'] = 'ready'
        state.captures_cache['progress'] = 100

    total_time = time_module.time() - perf_start
    print(f"[数据] 加载 {len(result)} 条记录，耗时 {total_time:.2f}s")

    # 按日期范围筛选
    result = _filter_by_date(result, req_start, req_end)
    # 应用缺陷类型/置信度等筛选
    if cls_filter and cls_filter != 'all':
        result = _apply_filters(result, filter_type, cls_filter)

    # 返回数据和日期范围
    return jsonify({
        'data': result,
        'date_range': {
            'min': min_time,
            'max': max_time
        },
        'cached': False
    })

def _extract_timestamp_from_info_filename(filename):
    """从 info JSON 文件名中提取时间戳字符串（YYYYMMDD_HHMMSS 格式）"""
    import re
    # image_batch_20260508_234623_216_info.json
    m = re.match(r'image_batch_(\d{8}_\d{6}_\d+?)_info\.json', filename)
    if m: return m.group(1)
    # batch_{defect_name}_{YYYYMMDD}_{HHMMSS}_{mmm}_info.json
    m = re.match(r'batch_[a-zA-Z0-9_-]+_(\d{8}_\d{6}_\d+?)_info\.json', filename)
    if m: return m.group(1)
    # batch_{YYYYMMDD}_{HHMMSS}_{mmm}_info.json (旧格式)
    m = re.match(r'batch_(\d{8}_\d{6}_\d+?)_info\.json', filename)
    if m: return m.group(1)
    # camera_batch / ip_batch
    m = re.match(r'(?:camera|ip)_batch_(\d{8}_\d{6})_\d+_\d+_info\.json', filename)
    if m: return m.group(1)
    return None


@app.route('/api/captures/stats')
def captures_stats():
    """获取缺陷统计数据（用于圆环图）"""
    import glob
    import re
    from datetime import datetime
    import time as time_module

    start_time = request.args.get('start', '')
    end_time = request.args.get('end', '')
    filter_type = request.args.get('filter_type', '')
    cls_filter = request.args.get('cls', '')

    print(f"[缺陷统计] 时间范围: {start_time} - {end_time}, 筛选: {filter_type}={cls_filter}")

    json_files = glob.glob(os.path.join(Config.CAPTURE_DIR, '*.json'))

    defect_counts = {}

    for json_file in json_files:
        try:
            filename = os.path.basename(json_file)
            raw_ts = _extract_timestamp_from_info_filename(filename)

            # 日期范围筛选（使用文件名时间戳）
            if raw_ts and (start_time or end_time):
                try:
                    parts = raw_ts.split('_')
                    date_str = parts[0]
                    time_str = parts[1]
                    file_time = datetime(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]),
                                         int(time_str[:2]), int(time_str[2:4]), int(time_str[4:6]))
                    if start_time:
                        start_dt = _parse_iso_date(start_time)
                        if file_time < start_dt:
                            continue
                    if end_time:
                        end_dt = _parse_iso_date(end_time)
                        if file_time > end_dt:
                            continue
                except Exception:
                    pass

            with open(json_file, 'r', encoding='utf-8') as f:
                info_data = json.load(f)

                if not _filter_batch_item(info_data, filter_type, cls_filter):
                    continue

                defects = info_data.get('defects', [])
                for defect in defects:
                    class_name = defect.get('class_name', '未知')
                    defect_counts[class_name] = defect_counts.get(class_name, 0) + 1

        except Exception as e:
            print(f"[读取批次信息失败] {json_file}: {e}")
            continue

    print(f"[缺陷统计] 统计结果: {defect_counts}")

    return jsonify({
        'success': True,
        'data': {
            'defects': defect_counts
        }
    })

@app.route('/clear_captures_cache', methods=['POST'])
def clear_captures_cache():
    """清除检测记录缓存（在新增或删除记录后调用）"""
    with state.cache_lock:
        state.captures_cache['data'] = None
        state.captures_cache['date_range'] = None
        state.captures_cache['timestamp'] = 0
        state.captures_cache['file_count'] = 0
        state.captures_cache['status'] = 'idle'
        state.captures_cache['progress'] = 0

    print("[缓存] 已清除检测记录缓存")
    return jsonify({'success': True})

@app.route('/captures_cache_status')
def captures_cache_status():
    """返回检测记录缓存预热状态"""
    with state.cache_lock:
        return jsonify({
            'status': state.captures_cache['status'],
            'progress': state.captures_cache['progress'],
            'total_files': state.captures_cache['total_files'] or len(state.captures_cache.get('data') or [])
        })

@app.route('/api/captures/recent_stats')
def captures_recent_stats():
    """获取最近统计数据（用于柱状图：按天统计有缺陷图片和总导入图片）"""
    import glob
    import re
    from datetime import datetime
    from collections import defaultdict
    import time as time_module
    
    # 获取时间范围参数和筛选参数
    start_time = request.args.get('start', '')
    end_time = request.args.get('end', '')
    filter_type = request.args.get('filter_type', '')
    cls_filter = request.args.get('cls', '')

    print(f"[最近统计] 时间范围: {start_time} - {end_time}, 筛选: {filter_type}={cls_filter}")
    
    # 获取所有批次信息文件
    json_files = glob.glob(os.path.join(Config.CAPTURE_DIR, '*_info.json'))
    
    print(f"[最近统计] 找到 {len(json_files)} 个JSON文件")
    
    # 按天统计数据
    daily_stats = defaultdict(lambda: {'total': 0, 'defect': 0})
    
    for json_file in json_files:
        try:
            filename = os.path.basename(json_file)
            
            # 从JSON文件名提取batch_id
            # 格式: image_batch_20260507_204503_797_info.json
            # 或: batch_rolled-in-scale_20260502_111019_476_info.json
            # 或: camera_batch_20260502_111019_476_000_info.json
            
            batch_id = None
            timestamp_str = None
            
            # 尝试匹配image_batch格式
            image_match = re.match(r'(image_batch)_(\d{8}_\d{6}_\d+?)_info\.json', filename)
            if image_match:
                batch_id = f"image_batch_{image_match.group(2)}"
                timestamp_str = image_match.group(2)
            else:
                # 尝试匹配batch格式（带缺陷名）
                batch_with_defect = re.match(r'(batch_[a-zA-Z0-9_-]+)_(\d{8}_\d{6}_\d+?)_info\.json', filename)
                if batch_with_defect:
                    batch_id = f"batch_{batch_with_defect.group(1)}_{batch_with_defect.group(2)}"
                    timestamp_str = batch_with_defect.group(2)
                else:
                    # 尝试匹配camera_batch格式
                    camera_match = re.match(r'(camera_batch|ip_batch)_(\d{8}_\d{6})_(\d+)_(\d+)_info\.json', filename)
                    if camera_match:
                        batch_id = f"{camera_match.group(1)}_{camera_match.group(2)}_{int(camera_match.group(4)):03d}"
                        timestamp_str = camera_match.group(2)
                    else:
                        # 尝试匹配旧格式batch
                        old_match = re.match(r'(batch_\d{8}_\d{6}_\d+?)_info\.json', filename)
                        if old_match:
                            batch_id = old_match.group(1)
                            timestamp_str = old_match.group(1).replace('batch_', '')
            
            if not timestamp_str:
                continue
            
            # 解析时间戳
            try:
                parts = timestamp_str.split('_')
                if len(parts) >= 2:
                    date_str = parts[0]
                    time_str = parts[1]
                    
                    year = int(date_str[:4])
                    month = int(date_str[4:6])
                    day = int(date_str[6:8])
                    hour = int(time_str[:2])
                    minute = int(time_str[2:4])
                    second = int(time_str[4:6])
                    
                    file_time = time_module.mktime((year, month, day, hour, minute, second, 0, 0, -1))
                    file_datetime = datetime.fromtimestamp(file_time)
                    
                    # 检查时间范围
                    if start_time or end_time:
                        if start_time:
                            try:
                                start_dt = _parse_iso_date(start_time)
                                if file_datetime < start_dt:
                                    continue
                            except:
                                pass
                        
                        if end_time:
                            try:
                                end_dt = _parse_iso_date(end_time)
                                if file_datetime > end_dt:
                                    continue
                            except:
                                pass
                    
                    # 提取日期（YYYY-MM-DD）
                    date_key = file_datetime.strftime('%Y-%m-%d')
                    
                    # 每个JSON文件代表一个批次（一张或多张图片）
                    # 读取JSON内容检查是否有缺陷
                    with open(json_file, 'r', encoding='utf-8') as f:
                        info_data = json.load(f)

                        # 应用缺陷/来源/置信度筛选
                        if not _filter_batch_item(info_data, filter_type, cls_filter):
                            continue

                        # 统计总导入批次
                        daily_stats[date_key]['total'] += 1

                        # 统计有缺陷的批次
                        defects = info_data.get('defects', [])
                        if defects and len(defects) > 0:
                            daily_stats[date_key]['defect'] += 1
                            
                else:
                    print(f"[时间解析失败] {json_file}: timestamp格式不正确")
                    continue
                    
            except Exception as e:
                print(f"[时间解析失败] {json_file}: {e}")
                continue
                
        except Exception as e:
            print(f"[读取批次信息失败] {json_file}: {e}")
            continue
    
    # 转换为普通字典并按日期排序
    daily_stats_dict = {date: stats for date, stats in sorted(daily_stats.items())}
    
    print(f"[最近统计] 统计结果: {daily_stats_dict}")
    
    return jsonify({
        'success': True,
        'data': {
            'daily_stats': daily_stats_dict
        }
    })

@app.route('/api/captures/damage_ratio')
def captures_damage_ratio():
    """获取损伤占比统计（不同缺陷的检测框占据整个图片的面积占比）"""
    import glob
    from datetime import datetime
    from collections import defaultdict

    start_time = request.args.get('start', '')
    end_time = request.args.get('end', '')
    filter_type = request.args.get('filter_type', '')
    cls_filter = request.args.get('cls', '')

    print(f"[损伤占比] 时间范围: {start_time} - {end_time}, 筛选: {filter_type}={cls_filter}")

    json_files = glob.glob(os.path.join(Config.CAPTURE_DIR, '*_info.json'))

    damage_stats = defaultdict(lambda: {'total_area_ratio': 0.0, 'count': 0})
    total_images = 0

    for json_file in json_files:
        try:
            filename = os.path.basename(json_file)
            raw_ts = _extract_timestamp_from_info_filename(filename)

            # 日期范围筛选（使用文件名时间戳）
            if raw_ts and (start_time or end_time):
                try:
                    parts = raw_ts.split('_')
                    date_str = parts[0]
                    time_str = parts[1]
                    file_time = datetime(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]),
                                         int(time_str[:2]), int(time_str[2:4]), int(time_str[4:6]))
                    if start_time:
                        start_dt = _parse_iso_date(start_time)
                        if file_time < start_dt:
                            continue
                    if end_time:
                        end_dt = _parse_iso_date(end_time)
                        if file_time > end_dt:
                            continue
                except Exception:
                    pass

            # 读取JSON内容
            with open(json_file, 'r', encoding='utf-8') as f:
                info_data = json.load(f)

                # 获取图片尺寸（优先从JSON中获取，否则从图片文件获取）
                image_width = info_data.get('image_width', 0)
                image_height = info_data.get('image_height', 0)
                
                # 如果JSON中没有图片尺寸，尝试从原始图片文件获取
                if image_width == 0 or image_height == 0:
                    batch_id = info_data.get('batch_id', '')
                    # 搜索匹配的原始图片（文件名前缀匹配，兼容各种批次格式）
                    original_image = None
                    for fname in os.listdir(Config.CAPTURE_DIR):
                        if fname.startswith(batch_id) and '_original.' in fname:
                            original_image = os.path.join(Config.CAPTURE_DIR, fname)
                            break

                    if original_image and os.path.exists(original_image):
                        try:
                            from PIL import Image
                            with Image.open(original_image) as img:
                                image_width, image_height = img.size
                        except Exception as e:
                            print(f"[读取图片尺寸失败] {original_image}: {e}")
                            continue
                    else:
                        continue
                
                if image_width == 0 or image_height == 0:
                    continue

                # 应用缺陷/来源/置信度筛选
                if not _filter_batch_item(info_data, filter_type, cls_filter):
                    continue

                image_area = image_width * image_height
                total_images += 1
                
                # 获取缺陷列表
                defects = info_data.get('defects', [])
                
                for defect in defects:
                    defect_type = defect.get('class_name', 'unknown')
                    bbox = defect.get('bbox', [0, 0, 0, 0])  # [x1, y1, x2, y2]
                    
                    # 计算缺陷框面积
                    x1, y1, x2, y2 = bbox
                    defect_area = (x2 - x1) * (y2 - y1)
                    
                    # 计算面积占比
                    area_ratio = (defect_area / image_area) * 100 if image_area > 0 else 0
                    
                    # 累加统计
                    damage_stats[defect_type]['total_area_ratio'] += area_ratio
                    damage_stats[defect_type]['count'] += 1
                    
        except Exception as e:
            print(f"[读取批次信息失败] {json_file}: {e}")
            continue
    
    # 计算平均面积占比
    result = {}
    for defect_type, stats in damage_stats.items():
        if stats['count'] > 0:
            avg_ratio = stats['total_area_ratio'] / stats['count']
            result[defect_type] = {
                'avg_area_ratio': round(avg_ratio, 2),  # 平均面积占比(%)
                'total_count': stats['count'],  # 总出现次数
                'total_area_ratio': round(stats['total_area_ratio'], 2)  # 总面积占比(%)
            }
    
    print(f"[损伤占比] 统计结果: {result}")
    
    return jsonify({
        'success': True,
        'data': {
            'damage_ratio': result,
            'total_images': total_images
        }
    })

@app.route('/api/captures/confidence_distribution')
def captures_confidence_distribution():
    """获取置信度分布统计（统计所有缺陷的置信度在五个区间的分布）"""
    import glob
    from datetime import datetime
    from collections import defaultdict

    start_time = request.args.get('start', '')
    end_time = request.args.get('end', '')
    filter_type = request.args.get('filter_type', '')
    cls_filter = request.args.get('cls', '')

    print(f"[置信分布] 时间范围: {start_time} - {end_time}, 筛选: {filter_type}={cls_filter}")

    json_files = glob.glob(os.path.join(Config.CAPTURE_DIR, '*_info.json'))

    ranges = [
        {'label': '0-20%', 'min': 0, 'max': 20},
        {'label': '20-40%', 'min': 20, 'max': 40},
        {'label': '40-60%', 'min': 40, 'max': 60},
        {'label': '60-80%', 'min': 60, 'max': 80},
        {'label': '80-100%', 'min': 80, 'max': 100}
    ]

    distribution = {r['label']: 0 for r in ranges}
    total_defects = 0

    for json_file in json_files:
        try:
            filename = os.path.basename(json_file)
            raw_ts = _extract_timestamp_from_info_filename(filename)

            # 日期范围筛选（使用文件名时间戳）
            if raw_ts and (start_time or end_time):
                try:
                    parts = raw_ts.split('_')
                    date_str = parts[0]
                    time_str = parts[1]
                    file_time = datetime(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]),
                                         int(time_str[:2]), int(time_str[2:4]), int(time_str[4:6]))
                    if start_time:
                        start_dt = _parse_iso_date(start_time)
                        if file_time < start_dt:
                            continue
                    if end_time:
                        end_dt = _parse_iso_date(end_time)
                        if file_time > end_dt:
                            continue
                except Exception:
                    pass

            # 读取JSON内容
            with open(json_file, 'r', encoding='utf-8') as f:
                info_data = json.load(f)

                # 应用缺陷/来源/置信度筛选
                if not _filter_batch_item(info_data, filter_type, cls_filter):
                    continue

                # 获取缺陷列表
                defects = info_data.get('defects', [])

                for defect in defects:
                    confidence = defect.get('confidence', 0) * 100  # 转换为百分比
                    total_defects += 1
                    
                    # 判断属于哪个区间
                    for r in ranges:
                        if r['min'] <= confidence < r['max']:
                            distribution[r['label']] += 1
                            break
                    # 处理100%的情况
                    if confidence == 100:
                        distribution['80-100%'] += 1
                        
        except Exception as e:
            print(f"[读取批次信息失败] {json_file}: {e}")
            continue
    
    # 计算百分比
    result = []
    for r in ranges:
        count = distribution[r['label']]
        percentage = round((count / total_defects * 100) if total_defects > 0 else 0, 1)
        result.append({
            'range': r['label'],
            'count': count,
            'percentage': percentage
        })
    
    print(f"[置信分布] 统计结果: {result}")
    
    return jsonify({
        'success': True,
        'data': {
            'distribution': result,
            'total_defects': total_defects
        }
    })

@app.route('/batch_detail/<batch_id>')
def batch_detail(batch_id):
    """获取单个批次的详细信息（用于左右箭头浏览）"""
    import re
    
    # 安全检查：支持新旧两种批次ID格式
    # 旧格式: batch_20260430_224207_708
    # 新格式: batch_rolled-in_scale_20260430_225606_914 (包含缺陷名称)
    # 摄像头格式: camera_batch_20260502_111019_000 (包含毫秒和帧索引)
    # 帧格式: camera_batch_20260502_111019_000
    # IP摄像头: ip_batch_20260502_111019_000
    # 图片模式: image_batch_20260502_111019
    # 支持的模式: (batch_|camera_batch_|ip_batch_|image_batch_) + 可选的缺陷名 + 时间戳 + 可选的(毫秒_帧索引)
    valid_pattern = r'^(batch_|camera_batch_|ip_batch_|image_batch_)[a-zA-Z0-9_-]*\d{8}_\d{6}(_\d+(_\d+)?)?$'
    if not re.match(valid_pattern, batch_id):
        return jsonify({"error": "非法批次ID"}), 400
    
    # 查找该批次的所有图片
    batch_info = {
        'batch_id': batch_id,
        'images': {},
        'crops': []
    }
    
    # 扫描captures目录
    if os.path.exists(Config.CAPTURE_DIR):
        files = os.listdir(Config.CAPTURE_DIR)
        for filename in files:
            # 检查文件名是否属于这个批次
            # 旧格式: batch_20260430_224207_708_original.jpg
            # 新格式（带缺陷名）: batch_rolled-in_scale_20260430_225606_914_original.jpg
            # 摄像头格式: camera_batch_20260502_111019_476_000_original.jpg
            # 图片格式: image_batch_20260502_210025_123_original.jpg
            # batch_id: batch_rolled-in_scale_20260430_225606_914 或 camera_batch_20260502_111019_000 或 image_batch_20260502_210025_123
            
            # 尝试匹配旧格式: batch_id_type.jpg
            if filename.startswith(batch_id + '_') and filename.endswith('.jpg'):
                image_type = filename[len(batch_id)+1:-4]  # 去掉 batch_id_ 和 .jpg
            else:
                # 尝试匹配新格式（带缺陷名）: batch_{defect_name}_{timestamp}_{type}.jpg
                new_match = re.match(r'batch_([a-zA-Z0-9_-]+?)_(\d{8}_\d{6}_\d+?)_(.+)', filename)
                if new_match:
                    defect_name = new_match.group(1)
                    timestamp = new_match.group(2)
                    image_type = new_match.group(3).replace('.jpg', '')
                    
                    # 检查是否匹配当前batch_id
                    expected_batch_id = f"batch_{defect_name}_{timestamp}"
                    if expected_batch_id != batch_id:
                        continue
                else:
                    # 尝试匹配图片格式: image_batch_{timestamp}_{type}.jpg
                    image_match = re.match(r'(image_batch)_(\d{8}_\d{6}_\d+?)_(.+)', filename)
                    if image_match:
                        timestamp = image_match.group(2)
                        image_type = image_match.group(3).replace('.jpg', '')
                        
                        # 检查是否匹配当前batch_id
                        expected_batch_id = f"image_batch_{timestamp}"
                        if expected_batch_id != batch_id:
                            continue
                    else:
                        # 尝试匹配摄像头格式（包含毫秒）: camera_batch_20260502_111019_476_000_original.jpg
                        camera_match = re.match(r'(camera_batch|ip_batch)_(\d{8}_\d{6})_(\d+)_(\d+)_(.+)', filename)
                        if camera_match:
                            source_prefix = camera_match.group(1)
                            timestamp = camera_match.group(2)
                            ms = camera_match.group(3)
                            frame_idx = int(camera_match.group(4))
                            image_type = camera_match.group(5).replace('.jpg', '')
                            
                            # 检查是否匹配当前batch_id
                            expected_batch_id = f"{source_prefix}_{timestamp}_{frame_idx:03d}"
                            if expected_batch_id != batch_id:
                                continue
                        else:
                            continue
            
            filepath = os.path.join(Config.CAPTURE_DIR, filename)
            
            if image_type == 'original':
                batch_info['images']['original'] = filename
            elif image_type == 'annotated':
                batch_info['images']['annotated'] = filename
            elif image_type == 'heatmap':
                batch_info['images']['heatmap'] = filename
            elif image_type.startswith('crop_'):
                crop_parts = image_type.split('_', 2)
                if len(crop_parts) >= 3:
                    batch_info['crops'].append({
                        'filename': filename,
                        'index': int(crop_parts[1]),
                        'class_name': crop_parts[2]
                    })
    
    if not batch_info['images'] and not batch_info['crops']:
        return jsonify({"error": "批次不存在"}), 404
    
    # 读取 JSON 文件获取缺陷信息和检测参数
    # 新格式JSON文件名（带缺陷名）: batch_rolled-in-scale_20260502_111019_476_info.json
    # 新格式JSON文件名（摄像头）: camera_batch_20260502_111019_476_000_info.json
    # 新格式JSON文件名（图片）: image_batch_20260502_210025_123_info.json
    # 旧格式JSON文件名: batch_20260430_224207_708_info.json
    json_filename = f"{batch_id}_info.json"
    json_path = os.path.join(Config.CAPTURE_DIR, json_filename)
    
    # 如果直接匹配失败，尝试查找新格式
    if not os.path.exists(json_path):
        # 扫描目录查找匹配的JSON文件
        if os.path.exists(Config.CAPTURE_DIR):
            for f in os.listdir(Config.CAPTURE_DIR):
                if f.endswith('_info.json'):
                    # 先尝试匹配带缺陷名的格式: batch_{defect_name}_{timestamp}_info.json
                    json_match = re.match(r'batch_([a-zA-Z0-9_-]+?)_(\d{8}_\d{6}_\d+?)_info\.json', f)
                    if json_match:
                        defect_name = json_match.group(1)
                        ts = json_match.group(2)
                        expected_id = f"batch_{defect_name}_{ts}"
                        if expected_id == batch_id:
                            json_path = os.path.join(Config.CAPTURE_DIR, f)
                            break
                    # 尝试匹配图片格式: image_batch_{timestamp}_info.json
                    elif re.match(r'(image_batch)_(\d{8}_\d{6}_\d+?)_info\.json', f):
                        json_match = re.match(r'(image_batch)_(\d{8}_\d{6}_\d+?)_info\.json', f)
                        ts = json_match.group(2)
                        expected_id = f"image_batch_{ts}"
                        if expected_id == batch_id:
                            json_path = os.path.join(Config.CAPTURE_DIR, f)
                            break
                    # 尝试匹配摄像头格式: camera_batch_{timestamp}_{ms}_{index}_info.json
                    elif re.match(r'(camera_batch|ip_batch)_(\d{8}_\d{6})_(\d+)_(\d+)_info\.json', f):
                        json_match = re.match(r'(camera_batch|ip_batch)_(\d{8}_\d{6})_(\d+)_(\d+)_info\.json', f)
                        source = json_match.group(1)
                        ts = json_match.group(2)
                        ms = json_match.group(3)
                        idx = int(json_match.group(4))
                        expected_id = f"{source}_{ts}_{idx:03d}"
                        if expected_id == batch_id:
                            json_path = os.path.join(Config.CAPTURE_DIR, f)
                            break
    
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                info_data = json.load(f)
                batch_info['defects'] = info_data.get('defects', [])
                batch_info['detection_params'] = info_data.get('detection_params', {})
                batch_info['timestamp'] = _extract_timestamp_from_batch_id(batch_id) or info_data.get('timestamp_short', '')
                # 关键：读取AI分析结果
                batch_info['ai_analysis'] = info_data.get('ai_analysis', None)
                print(f"[批次详情] 加载批次 {batch_id}, ai_analysis存在: {batch_info['ai_analysis'] is not None}")
        except Exception as e:
            print(f"[读取批次详情失败] {batch_id}: {e}")
    
    # 按索引排序裁剪图
    batch_info['crops'].sort(key=lambda x: x['index'])
    
    return jsonify(batch_info)

@app.route('/captures/<filename>')
def serve_capture(filename):
    """提供截图文件"""
    import re
    
    # 安全检查：防止路径遍历攻击
    if not re.match(r'^[\w\-.]+$', filename) or '..' in filename or '/' in filename:
        return jsonify({"error": "非法文件名"}), 400
    
    filepath = os.path.join(Config.CAPTURE_DIR, filename)
    
    if not os.path.exists(filepath):
        return jsonify({"error": "文件不存在"}), 404
    
    return send_file(filepath, mimetype='image/jpeg')

@app.route('/delete_capture/<filename>', methods=['DELETE'])
def delete_capture(filename):
    """删除检测记录截图"""
    import re
    
    # 安全检查：防止路径遍历攻击
    if not re.match(r'^[\w\-.]+$', filename) or '..' in filename or '/' in filename:
        return jsonify({"success": False, "error": "非法文件名"}), 400
    
    filepath = os.path.join(Config.CAPTURE_DIR, filename)
    
    if not os.path.exists(filepath):
        return jsonify({"success": False, "error": "文件不存在"}), 404
    
    try:
        os.remove(filepath)
        # 清除缓存，确保下次加载时重新扫描
        with state.cache_lock:
            state.captures_cache['data'] = None
            state.captures_cache['date_range'] = None
            state.captures_cache['timestamp'] = 0
            state.captures_cache['file_count'] = 0
        print(f"[缓存] 删除文件 {filename}，已清除缓存")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/batch_delete_captures', methods=['POST'])
def batch_delete_captures():
    """批量删除检测记录截图（包括图片和JSON文件）"""
    import re
    
    try:
        data = request.json
        filenames = data.get('filenames', [])
        
        if not filenames:
            return jsonify({"success": False, "error": "未指定要删除的文件"}), 400
        
        deleted_count = 0
        errors = []
        deleted_batch_ids = set()  # 记录已删除的批次ID
        
        # 首先收集所有要删除的文件
        all_files_to_delete = set(filenames)
        
        # 从图片文件名中提取批次ID，并查找对应的JSON文件
        for filename in filenames:
            # 尝试提取批次ID
            # 格式1: camera_batch_20260502_111019_476_000_original.jpg
            camera_match = re.match(r'(camera_batch|ip_batch)_(\d{8}_\d{6})_(\d+)_(\d+)_(.+)', filename)
            if camera_match:
                source_prefix = camera_match.group(1)
                timestamp = camera_match.group(2)
                frame_idx = int(camera_match.group(4))
                batch_id = f"{source_prefix}_{timestamp}_{frame_idx:03d}"
                deleted_batch_ids.add(batch_id)
                
                # 查找对应的JSON文件
                json_pattern = f"{source_prefix}_{timestamp}_*_{frame_idx:03d}_info.json"
                import glob
                json_files = glob.glob(os.path.join(Config.CAPTURE_DIR, json_pattern))
                for json_file in json_files:
                    all_files_to_delete.add(os.path.basename(json_file))
                continue
            
            # 格式2: image_batch_20260502_111019_951_original.jpg
            image_match = re.match(r'(image_batch)_(\d{8}_\d{6}_\d+)_(.+)', filename)
            if image_match:
                timestamp_with_id = image_match.group(2)  # 例如: 20260503_164051_951
                batch_id = f"image_batch_{timestamp_with_id}"
                deleted_batch_ids.add(batch_id)
                
                # 查找对应的JSON文件
                json_filename = f"image_batch_{timestamp_with_id}_info.json"
                json_path = os.path.join(Config.CAPTURE_DIR, json_filename)
                if os.path.exists(json_path):
                    all_files_to_delete.add(json_filename)
                continue
            
            # 格式3: batch_20260430_224207_708_original.jpg (旧格式)
            old_match = re.match(r'(batch_\d{8}_\d{6}_\d+?)_(.+)', filename)
            if old_match:
                batch_id = old_match.group(1)
                deleted_batch_ids.add(batch_id)
                
                # 查找对应的JSON文件
                json_filename = f"{batch_id}_info.json"
                json_path = os.path.join(Config.CAPTURE_DIR, json_filename)
                if os.path.exists(json_path):
                    all_files_to_delete.add(json_filename)
                continue
        
        # 执行删除
        for filename in all_files_to_delete:
            # 安全检查
            if not re.match(r'^[\w\-.]+$', filename) or '..' in filename or '/' in filename:
                errors.append(f"非法文件名: {filename}")
                continue
            
            filepath = os.path.join(Config.CAPTURE_DIR, filename)
            
            if not os.path.exists(filepath):
                continue  # 文件不存在，跳过
            
            try:
                os.remove(filepath)
                deleted_count += 1
            except Exception as e:
                errors.append(f"{filename}: {str(e)}")
        
        # 清除缓存，确保下次加载时重新扫描
        with state.cache_lock:
            state.captures_cache['data'] = None
            state.captures_cache['date_range'] = None
            state.captures_cache['timestamp'] = 0
            state.captures_cache['file_count'] = 0
        print(f"[缓存] 批量删除 {deleted_count} 个文件，已清除缓存")
        
        return jsonify({
            "success": True,
            "deleted_count": deleted_count,
            "errors": errors
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/health')
def health_check():
    """健康检查"""
    return jsonify({"status": "healthy", "timestamp": time.time()})

@app.route('/favicon.ico')
def favicon():
    """处理favicon请求，返回空响应避免404"""
    from flask import make_response
    response = make_response('', 204)
    response.headers['Content-Type'] = 'image/x-icon'
    response.headers['Cache-Control'] = 'public, max-age=86400'
    return response

@app.route('/analyze_with_llm', methods=['POST'])
def analyze_with_llm():
    """使用大模型分析检测结果（使用讯飞星火图片理解API）"""
    import base64
    import cv2
    import numpy as np
    
    if not spark_image_service:
        return jsonify({"success": False, "error": "图片理解服务未初始化"}), 500
    
    try:
        data = request.json
        
        # 获取带标注的图片base64
        image_base64 = data.get('image_base64')
        if not image_base64:
            return jsonify({"success": False, "error": "未提供图片数据"}), 400
        
        # 获取检测结果
        detections = data.get('detections', [])
        model_type = data.get('model_type', 'yolo')
        conf_threshold = data.get('conf_threshold', 0.25)
        iou_threshold = data.get('iou_threshold', 0.45)
        batch_id = data.get('batch_id', None)  # 获取批次ID
        
        # 构建提示词（包含检测参数合理性评估）
        prompt = f"""你是钢材质量检测专家。请结合标注图片和检测数据，对钢材缺陷进行专业分析。

当前检测参数设置：
- 置信度阈值 (Confidence Threshold): {conf_threshold}
- IOU阈值 (NMS Threshold): {iou_threshold}

请按以下8个部分输出分析报告：

【危险程度评估】
- 综合判断缺陷的危险等级（安全/轻微/中等/严重/危险）
- 说明判断依据

【缺陷详细分析】
- 缺陷类型及成因说明
- 缺陷在钢材表面可能出现的位置特征
- 缺陷的发展趋势预测

【尺寸与影响范围】
- 缺陷尺寸评估
- 对钢材性能的影响程度
- 可能波及的范围

【质量评级】
- 给出质量等级（优/良/中/差/不合格）
- 评级依据说明

【处理措施建议】
- 紧急处理措施（如有危险）
- 修复方案（如可修复）
- 后续监测建议

【预防建议】
- 生产过程中如何避免此类缺陷
- 质量控制改进建议

【可能漏检提醒】
- 根据缺陷特征，提醒可能存在的其他隐患
- 建议重点检测的区域

【检测参数合理性评估】
- 分析当前置信度阈值({conf_threshold})设置是否合理
  * 如果检测到缺陷但置信度普遍较低，可能需要降低阈值
  * 如果误检较多，可能需要提高阈值
- 分析当前IOU阈值({iou_threshold})设置是否合理
  * 如果有重叠框未被合并，可能需要提高阈值
  * 如果有目标被过度合并，可能需要降低阈值
- 给出明确的调整建议（如需要）

要求：
- 直接给出分析结果，不要开场白
- 每部分控制在80-100字以内
- 使用专业术语但要易懂
- 不要使用Markdown标题符号(####、**等)
- 重点突出关键信息
- 结合图片中的缺陷形态给出更准确的判断"""
        
        # 调用图片理解API
        result = spark_image_service.analyze_image(
            image_base64=image_base64,
            prompt=prompt,
            detections=detections,
            conf_threshold=conf_threshold,
            iou_threshold=iou_threshold,
            timeout=120
        )
        
        # 如果AI分析成功且有批次ID，保存AI分析结果到对应的JSON文件
        if result.get('success') and batch_id:
            try:
                json_path = os.path.join(Config.CAPTURE_DIR, f"{batch_id}_info.json")
                if os.path.exists(json_path):
                    # 读取现有的批次信息
                    with open(json_path, 'r', encoding='utf-8') as f:
                        batch_info = json.load(f)
                    
                    # 添加AI分析结果
                    batch_info['ai_analysis'] = {
                        'timestamp': datetime.now().isoformat(),
                        'analysis': result.get('analysis', ''),
                        'detection_count': result.get('detection_count', 0),
                        'model_type': result.get('model_type', 'unknown'),
                        'conf_threshold': conf_threshold,
                        'iou_threshold': iou_threshold
                    }
                    
                    # 写回JSON文件
                    with open(json_path, 'w', encoding='utf-8') as f:
                        json.dump(batch_info, f, ensure_ascii=False, indent=2)
                    
                    print(f"[AI分析] 已保存分析结果到批次: {batch_id}")
                else:
                    print(f"[AI分析警告] 批次JSON文件不存在: {json_path}")
            except Exception as e:
                print(f"[AI分析保存失败] {e}")
                import traceback
                traceback.print_exc()
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[LLM分析接口错误] {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/llm_status')
def llm_status():
    """检查LLM服务状态"""
    if not spark_image_service:
        return jsonify({"available": False, "error": "图片理解服务未初始化"})
    
    # 检查认证信息是否配置
    if not all([spark_image_service.app_id, spark_image_service.api_key, spark_image_service.api_secret]):
        return jsonify({
            "available": True,
            "connected": False,
            "error": "讯飞星火图片理解API认证信息未配置"
        })
    
    is_connected = spark_image_service.check_connection()
    return jsonify({
        "available": True,
        "connected": is_connected,
        "service": "Spark Image Understanding API"
    })

@app.route('/analyze_defect_data', methods=['POST'])
def analyze_defect_data():
    """使用Spark Lite分析缺陷数据并提供建议"""
    if not spark_lite_service:
        return jsonify({"success": False, "error": "Spark Lite服务未初始化"}), 500
    
    try:
        data = request.json
        
        # 获取缺陷统计数据
        defect_stats = data.get('defect_stats', {})
        daily_stats = data.get('daily_stats', {})
        damage_ratio = data.get('damage_ratio', {})  # 损伤占比数据
        confidence_distribution = data.get('confidence_distribution', [])  # 置信分布数据
        total_defects = data.get('total_defects', 0)  # 总缺陷数
        custom_prompt = data.get('prompt', None)  # 可选的自定义提示词
        
        if not defect_stats and not daily_stats:
            return jsonify({"success": False, "error": "未提供检测数据"}), 400
        
        print(f"[AI分析] 开始分析缺陷数据...")
        print(f"  - 缺陷类型数: {len(defect_stats)}")
        print(f"  - 统计天数: {len(daily_stats)}")
        print(f"  - 损伤占比类型数: {len(damage_ratio)}")
        print(f"  - 置信分布区间数: {len(confidence_distribution)}")
        print(f"  - 总缺陷数: {total_defects}")
        
        # 调用Spark Lite API
        result = spark_lite_service.analyze_defect_data(
            defect_stats=defect_stats,
            daily_stats=daily_stats,
            damage_ratio=damage_ratio,
            confidence_distribution=confidence_distribution,
            total_defects=total_defects,
            prompt=custom_prompt,
            timeout=90
        )
        
        if result.get('success'):
            print(f"[AI分析] ✅ 分析完成")
        else:
            print(f"[AI分析] ❌ 分析失败: {result.get('error')}")
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[AI分析接口错误] {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/spark_lite_status')
def spark_lite_status():
    """检查Spark Lite服务状态"""
    if not spark_lite_service:
        return jsonify({"available": False, "error": "Spark Lite服务未初始化"})
    
    is_connected = spark_lite_service.check_connection()
    return jsonify({
        "available": True,
        "connected": is_connected,
        "service": "Spark Lite Chat API",
        "model": "lite"
    })

@app.route('/recent_events')
def recent_events():
    """获取最近的检测事件"""
    import glob
    
    events = []
    
    # 读取最近的检测记录（最多100条）
    if os.path.exists(Config.RECORDS_PATH):
        with open(Config.RECORDS_PATH, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            # 取最后100条记录
            for line in lines[-100:]:
                line = line.strip()
                if line:
                    try:
                        record = json.loads(line)
                        # 添加类别名称
                        if state.model and 'class' in record:
                            class_id = record['class']
                            if isinstance(state.model.class_names, dict):
                                record['class_name'] = state.model.class_names.get(class_id, f'类别{class_id}')
                            else:
                                record['class_name'] = f'类别{class_id}'
                        events.append(record)
                    except:
                        pass
    
    # 按时间倒序排列
    events.reverse()
    
    return jsonify(events)

# ==================== 全局错误处理 ====================
@app.errorhandler(404)
def not_found(error):
    return jsonify({"code": 404, "message": "资源未找到"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"code": 500, "message": "服务器内部错误"}), 500

# ==================== 启动入口 ====================
if __name__ == '__main__':
    print("=" * 50)
    print("  钢材缺陷检测系统")
    print("=" * 50)
    print(f"\n[启动] 访问地址: http://{Config.HOST}:{Config.PORT}")
    print(f"[模式] {state.mode.upper()}")
    print(f"[提示] Ctrl+C 停止服务\n")
    
    # 预加载模型
    init_model()

    # 后台预热检测记录缓存（启动后1秒自动触发首次数据扫描）
    def _warm_captures_cache():
        import time as time_module
        time_module.sleep(1.5)  # 等待 Flask 完全启动
        try:
            with app.test_client() as client:
                print("[预热] 开始预加载检测记录数据...")
                resp = client.get('/captures_data')
                if resp.status_code == 200:
                    print(f"[预热] 检测记录缓存预热完成")
                else:
                    print(f"[预热] 缓存预热返回状态: {resp.status_code}")
        except Exception as e:
            print(f"[预热] 缓存预热失败: {e}")

    threading.Thread(target=_warm_captures_cache, daemon=True).start()

    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG,
        threaded=True
    )
