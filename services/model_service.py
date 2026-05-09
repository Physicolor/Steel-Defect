#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ModelService - 模型加载与推理服务
支持 YOLO 检测模型 和 UNet 分割模型
"""
import os
import sys
import cv2
import torch
import threading
import numpy as np
from ultralytics import YOLO

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class ModelService:
    """统一模型服务：自动识别 .pt(YOLO) / .pth(UNet)"""

    def __init__(self, weights_path: str, device_cfg="cpu"):
        self.device = self._resolve_device(device_cfg)
        self._lock = threading.RLock()
        self.weights_path = os.path.abspath(weights_path)
        self.model_type = self._detect_type(self.weights_path)
        self.model = self._load(self.weights_path)
        self.class_names = self._init_names()

    # ---- 设备解析 ----
    def _resolve_device(self, dev):
        if isinstance(dev, str):
            d = dev.strip().lower()
            if d in ('cpu', 'cuda'):
                return d
        if isinstance(dev, int):
            return f"cuda:{dev}" if torch.cuda.is_available() else "cpu"
        return "cuda:0" if torch.cuda.is_available() else "cpu"

    # ---- 类型检测 ----
    def _detect_type(self, path: str) -> str:
        ext = os.path.splitext(path)[1].lower()
        if ext == '.pth':
            print(f"[模型] 检测到 UNet 分割模型 (.pth)")
            return 'unet'
        if ext == '.pt':
            print(f"[模型] 检测到 YOLO 检测模型 (.pt)")
            return 'yolo'
        raise ValueError(f"不支持的格式: {ext}，仅支持 .pt(YOLO) / .pth(UNet)")

    # ---- 模型加载 ----
    def _load(self, path: str, model_type: str = None):
        t = model_type or self.model_type
        if t == 'yolo':
            return YOLO(path).to(self.device)
        if t == 'unet':
            return self._load_unet(path)
        raise ValueError(f"未知模型类型: {t}")

    def _load_unet(self, path: str):
        from segmentation.unet.channel_unet_models import load_unet_model
        model, arch = load_unet_model(path, self.device)
        self.unet_arch = arch
        print(f"[模型] UNet 加载成功，架构={arch}")
        return model

    # ---- 类别初始化 ----
    def _init_names(self):
        if self.model_type == 'yolo':
            names = self.model.model.names
            return dict(names) if isinstance(names, dict) else list(names)
        # UNet 二分类：缺陷 / 背景
        return {0: '缺陷区域', 1: 'background'}

    # ---- 推理入口 ----
    def predict(self, frame, conf: float, imgsz: int, iou: float = 0.45):
        with self._lock:
            if self.model_type == 'yolo':
                return self._predict_yolo(frame, conf, imgsz, iou)
            if self.model_type == 'unet':
                return self._predict_unet(frame, imgsz)
            raise ValueError(f"不支持的模型类型: {self.model_type}")

    def _predict_yolo(self, frame, conf: float, imgsz: int, iou: float = 0.45):
        return self.model(frame, conf=conf, iou=iou, imgsz=imgsz, verbose=False)[0]

    def _predict_unet(self, frame, imgsz: int):
        """UNet 分割推理：预处理 → 推理 → 掩码后处理 → 模拟 Boxes"""
        h, w = frame.shape[:2]
        ts = 256 if max(w, h) <= 300 else (320 if max(w, h) <= 400 else 512)
        ts = (ts // 32) * 32  # UNet 需要 32 倍数

        img = cv2.resize(frame, (ts, ts))
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        # 归一化: [0,255]→[0,1]→[-1,1]（与训练时 Normalize 对应）
        arr = img_rgb.astype(np.float32) / 255.0
        arr = (arr - 0.5) / 0.5
        tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(self.device)

        with torch.no_grad():
            mask_out = self.model(tensor)[0, 0].cpu().numpy()  # [H,W], sigmoid 后

        # 多阈值尝试，取第一个有效结果
        for thresh in (0.1, 0.15, 0.2, 0.3, 0.4, 0.5):
            mask = (mask_out > thresh).astype(np.uint8)
            if mask.sum() > 0:
                break

        # 形态学去噪
        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)

        # 缩放到原始尺寸
        mask_rs = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
        # mask_out 也要同步 resize，才能和 mask_rs 的 labels 索引对齐
        mask_out_rs = cv2.resize(mask_out, (w, h), interpolation=cv2.INTER_LINEAR)

        # 连通域分析 → 检测框
        detections = []
        num_labs, labels, stats, cents = cv2.connectedComponentsWithStats(mask_rs, connectivity=8)
        min_area = max(50, int(w * h * 0.0005))

        for i in range(1, num_labs):
            x, y, bw, bh, area = stats[i]
            if area < min_area:
                continue
            # 长宽比过滤
            ar = max(bw, bh) / (min(bw, bh) + 1e-6)
            if ar > 10:
                continue
            # 紧凑度
            if area / (bw * bh + 1e-6) < 0.05:
                continue
            x1, y1 = max(0, x), max(0, y)
            x2, y2 = min(w, x + bw), min(h, y + bh)
            region_conf = mask_out_rs[labels == i].mean() if (labels == i).sum() > 0 else 0.5
            detections.append({
                'bbox': [int(x1), int(y1), int(x2), int(y2)],
                'confidence': float(region_conf),
                'class_id': 0,
                'area': int(area)
            })

        return self._mask_to_result(frame, detections, mask_rs)

    def _mask_to_result(self, frame, detections, valid_mask):
        """将检测结果封装为类 YOLO Results 对象"""
        from ultralytics.engine.results import Results, Boxes
        results = Results(orig_img=frame, path='', names=self.class_names)
        if detections:
            boxes_data = [[d['bbox'][0], d['bbox'][1], d['bbox'][2], d['bbox'][3],
                           d['confidence'], d['class_id']] for d in detections]
            results.boxes = Boxes(torch.tensor(boxes_data, device=self.device),
                                  orig_shape=frame.shape[:2])
        if valid_mask is not None:
            results.masks = valid_mask
        return results

    # ---- 公共接口 ----
    def get_names(self):
        return self.class_names

    def reload_weights(self, path: str) -> str:
        """热更新模型权重"""
        new_path = os.path.abspath(path)
        if not os.path.isfile(new_path):
            raise FileNotFoundError(new_path)
        new_type = self._detect_type(new_path)
        new_model = self._load(new_path, new_type)
        with self._lock:
            self.model = new_model
            self.weights_path = new_path
            self.model_type = new_type
            self.class_names = self._init_names()
        print(f"[模型] 热更新成功: {os.path.basename(new_path)} ({new_type})")
        return new_path

    def get_status(self):
        return {
            "device": self.device,
            "weights_path": self.weights_path,
            "model_type": self.model_type,
            "class_count": len(self.class_names) if isinstance(self.class_names, dict) else 0
        }
