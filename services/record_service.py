#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RecordService - 检测记录与截图（支持批量图片组）"""
import os, json, cv2
from datetime import datetime
from typing import List, Dict, Optional

class RecordService:
    def __init__(self, record_path: str, capture_dir: str):
        self.record_path = record_path
        self.capture_dir = capture_dir
        os.makedirs(capture_dir, exist_ok=True)

    def save_record(self, event: str, box, cls: int, conf: float):
        """追加写入检测记录，box 可以是 list/[x1,y1,x2,y2] 或有 xyxy 属性的对象"""
        try:
            bbox = self._box(box)
            with open(self.record_path, "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "timestamp": datetime.now().isoformat(),
                    "event": event, "class": int(cls),
                    "confidence": float(conf), "box": bbox
                }, ensure_ascii=False) + "\n")
        except Exception as e:
            print("[记录异常]", e)

    def save_image_group(self, 
                        frame_original, 
                        frame_annotated: Optional = None,
                        frame_heatmap: Optional = None,
                        label: str = "det",
                        detections: List[Dict] = None,
                        conf_threshold: float = 0.25,
                        iou_threshold: float = 0.45,
                        source_type: str = None,  # 'image', 'camera', 'ip_camera'
                        frame_index: int = 0,  # 帧序号
                        batch_session_id: str = None  # 摄像头会话ID
                        ) -> Optional[str]:
        """
        保存图片组(原图+标注图+热力图+缺陷裁剪图)作为一个整体记录
        返回批次ID,用于关联同组的所有图片
            
        新增:记录检测参数(置信度阈值、IOU阈值)和缺陷详情
        新增:支持摄像头批次管理,区分image/camera/ip_camera三种来源
        """
        try:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
                
            print(f"[保存图片组] source_type: {source_type}, detections数量: {len(detections) if detections else 0}")
            if detections:
                for i, det in enumerate(detections):
                    print(f"  缺陷{i}: {det.get('class_name')}, 置信度: {det.get('confidence'):.3f}")
                
            # 根据source_type生成批次ID
            if source_type in ['camera', 'ip_camera'] and batch_session_id:
                # 摄像头模式:使用会话ID+帧序号
                prefix = 'camera_batch' if source_type == 'camera' else 'ip_batch'
                frame_num_str = str(frame_index).zfill(3)  # 001, 002, ...
                batch_id = f"{prefix}_{ts}_{frame_num_str}"
                print(f"[保存图片组] 摄像头批次ID: {batch_id}, 会话: {batch_session_id}")
            elif source_type == 'image':
                # 图片模式:使用image_batch前缀
                batch_id = f"image_batch_{ts}"
                print(f"[保存图片组] 图片批次ID: {batch_id}")
            else:
                # 旧逻辑兼容:根据缺陷名称生成批次ID
                if detections and len(detections) > 0:
                    # 提取所有缺陷名称并排序(保证一致性)
                    class_names = sorted([det.get('class_name', 'unknown') for det in detections])
                    # 去重
                    unique_names = list(dict.fromkeys(class_names))
                    # 用短横线连接,限制长度
                    name_part = '-'.join(unique_names[:3])  # 最多3个缺陷名称
                    if len(name_part) > 50:  # 限制名称长度
                        name_part = name_part[:50]
                    batch_id = f"batch_{name_part}_{ts}"
                    print(f"[保存图片组] 批次ID(旧逻辑): {batch_id}")
                else:
                    batch_id = f"batch_{ts}"
                    print(f"[保存图片组] 批次ID(无缺陷): {batch_id}")
            
            # 保存原图
            if frame_original is not None:
                orig_path = os.path.join(self.capture_dir, f"{batch_id}_original.jpg")
                success = cv2.imwrite(orig_path, frame_original)
                print(f"[保存图片组] 原图保存: {'成功' if success else '失败'}")
            
            # 保存标注图
            if frame_annotated is not None:
                anno_path = os.path.join(self.capture_dir, f"{batch_id}_annotated.jpg")
                success = cv2.imwrite(anno_path, frame_annotated)
                print(f"[保存图片组] 标注图保存: {'成功' if success else '失败'}")
            
            # 保存热力图
            if frame_heatmap is not None:
                heat_path = os.path.join(self.capture_dir, f"{batch_id}_heatmap.jpg")
                success = cv2.imwrite(heat_path, frame_heatmap)
                print(f"[保存图片组] 热力图保存: {'成功' if success else '失败'}")
            
            # 保存缺陷信息JSON
            batch_info = {
                'batch_id': batch_id,
                'timestamp': datetime.now().isoformat(),
                'timestamp_short': ts,
                'source_type': source_type,  # 新增:来源类型
                'frame_index': frame_index if source_type in ['camera', 'ip_camera'] else None,  # 新增:帧序号
                'batch_session_id': batch_session_id,  # 新增:会话ID
                'detection_params': {
                    'conf_threshold': conf_threshold,
                    'iou_threshold': iou_threshold
                },
                'defects': []
            }
            
            # 如果有检测框，保存每个缺陷的裁剪图和详细信息
            if detections and frame_original is not None:
                print(f"[保存图片组] 开始保存 {len(detections)} 个缺陷的裁剪图")
                for i, det in enumerate(detections):
                    bbox = det.get('bbox', [0, 0, 0, 0])
                    x1, y1, x2, y2 = bbox
                    padding = 20
                    h, w = frame_original.shape[:2]
                    
                    x1_crop = max(0, x1 - padding)
                    y1_crop = max(0, y1 - padding)
                    x2_crop = min(w, x2 + padding)
                    y2_crop = min(h, y2 + padding)
                    
                    if x2_crop > x1_crop and y2_crop > y1_crop:
                        crop_img = frame_original[y1_crop:y2_crop, x1_crop:x2_crop]
                        cls_name = det.get('class_name', 'unknown')
                        crop_path = os.path.join(self.capture_dir, 
                                               f"{batch_id}_crop_{i}_{cls_name}.jpg")
                        success = cv2.imwrite(crop_path, crop_img)
                        print(f"  裁剪图{i} ({cls_name}): {'成功' if success else '失败'}")
                    
                    # 记录缺陷详情
                    batch_info['defects'].append({
                        'index': i,
                        'class_id': det.get('class_id', -1),
                        'class_name': det.get('class_name', 'unknown'),
                        'confidence': det.get('confidence', 0.0),
                        'bbox': [x1, y1, x2, y2],
                        'crop_file': f"crop_{i}_{det.get('class_name', 'unknown')}.jpg" if x2_crop > x1_crop and y2_crop > y1_crop else None
                    })
                
                print(f"[保存图片组] 共保存 {len(batch_info['defects'])} 个缺陷信息")
            
            # 保存批次信息JSON
            json_path = os.path.join(self.capture_dir, f"{batch_id}_info.json")
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(batch_info, f, ensure_ascii=False, indent=2)
            
            return batch_id
        except Exception as e:
            print(f"[保存图片组异常] {e}")
            import traceback
            traceback.print_exc()
            return None

    def save_crop(self, frame, box, label: str = "det", padding: int = 20):
        """裁剪检测区域并保存截图（保留旧接口兼容性）"""
        try:
            x1, y1, x2, y2 = self._box(box)
            h, w = frame.shape[:2]
            
            # 添加边距，确保检测框完整显示
            x1 = max(0, x1 - padding)
            y1 = max(0, y1 - padding)
            x2 = min(w, x2 + padding)
            y2 = min(h, y2 + padding)
            
            if x2 <= x1 or y2 <= y1: 
                return None
            
            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            path = os.path.join(self.capture_dir, f"{label}_{ts}_{x1}_{y1}_{x2}_{y2}.jpg")
            cv2.imwrite(path, frame[y1:y2, x1:x2])
            return path
        except Exception as e:
            print(f"[截图异常] {e}")
            import traceback
            traceback.print_exc()
            return None

    def _box(self, box):
        """统一提取 [x1,y1,x2,y2]"""
        if hasattr(box, 'xyxy'): return [int(i) for i in box.xyxy[0].tolist()]
        if isinstance(box, (list, tuple)) and len(box) >= 4: return [int(i) for i in box[:4]]
        if isinstance(box, dict): return [int(box.get(k,0)) for k in ('x1','y1','x2','y2')]
        return [0,0,0,0]
