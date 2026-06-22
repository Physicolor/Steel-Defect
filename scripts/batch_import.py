#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量导入检测记录脚本
从指定图片目录读取钢材缺陷图片，通过YOLO模型执行检测，保存结果到系统中。
用法: python batch_import.py [--limit N]
"""
import os
import sys
import json
import time
import argparse
from datetime import datetime

# 添加项目根目录到路径
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, '..')
sys.path.insert(0, PROJECT_ROOT)

from services.model_service import ModelService
from services.record_service import RecordService

# 配置
IMAGES_DIR = os.environ.get("STEEL_DEFECT_IMAGES_DIR", os.path.join(SCRIPT_DIR, "IMAGES"))
MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "best.pt")
RECORDS_PATH = os.path.join(PROJECT_ROOT, "records.json")
CAPTURE_DIR = os.path.join(PROJECT_ROOT, "captures")

# 缺陷类别映射
CLASS_MAP = {
    "crazing": 0,
    "inclusion": 1,
    "patches": 2,
    "pitted_surface": 3,
    "rolled-in_scale": 4,
    "scratches": 5
}

CLASS_NAMES = {
    0: "crazing",
    1: "inclusion",
    2: "patches",
    3: "pitted_surface",
    4: "rolled-in_scale",
    5: "scratches"
}

def get_image_list():
    """获取所有图片文件列表，按类别分组"""
    images_by_class = {}
    if not os.path.exists(IMAGES_DIR):
        print(f"[错误] 图片目录不存在: {IMAGES_DIR}")
        return images_by_class

    for filename in os.listdir(IMAGES_DIR):
        if not filename.lower().endswith('.jpg'):
            continue
        parts = filename.rsplit('.', 1)[0]
        for class_name in CLASS_MAP:
            if parts.startswith(class_name):
                if class_name not in images_by_class:
                    images_by_class[class_name] = []
                images_by_class[class_name].append(filename)
                break

    return images_by_class

def run_inference(model_service, image_path, conf_threshold=0.25):
    """对单张图片执行推理"""
    import cv2
    frame = cv2.imread(image_path)
    if frame is None:
        return None, None

    results = model_service.predict(
        frame,
        conf=conf_threshold,
        imgsz=640,
        iou=0.45
    )

    detections = []
    annotated_frame = frame.copy()

    if results and len(results) > 0:
        result = results[0]
        if hasattr(result, 'boxes') and result.boxes is not None:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = model_service.class_names.get(cls_id, f"类别{cls_id}")

                detections.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": conf,
                    "bbox": [x1, y1, x2, y2]
                })

                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                label = f"{cls_name} {conf:.2f}"
                cv2.putText(annotated_frame, label, (x1, y1 - 10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

    return annotated_frame, detections

def batch_import(limit_per_class=None):
    """批量导入检测记录"""
    print("=" * 60)
    print("  钢材缺陷检测 - 批量导入工具")
    print("=" * 60)

    # 加载模型
    print(f"\n[1/4] 加载模型: {MODEL_PATH}")
    try:
        model_service = ModelService(MODEL_PATH, "cpu")
        print(f"  模型类型: {model_service.model_type}")
        print(f"  类别: {model_service.class_names}")
    except Exception as e:
        print(f"[错误] 模型加载失败: {e}")
        return

    # 初始化记录服务
    record_service = RecordService(RECORDS_PATH, CAPTURE_DIR)

    # 获取图片列表
    print(f"\n[2/4] 扫描图片目录: {IMAGES_DIR}")
    images_by_class = get_image_list()
    total_images = sum(len(v) for v in images_by_class.values())
    print(f"  找到 {total_images} 张图片，{len(images_by_class)} 个类别")
    for cls_name, files in images_by_class.items():
        print(f"    {cls_name}: {len(files)} 张")

    # 确定每个类别导入数量
    if limit_per_class:
        import_counts = {cls: min(limit_per_class, len(files)) for cls, files in images_by_class.items()}
    else:
        import_counts = {cls: len(files) for cls, files in images_by_class.items()}

    total_to_import = sum(import_counts.values())
    print(f"\n[3/4] 开始检测 ({total_to_import} 张图片)")
    print("-" * 40)

    imported = 0
    failed = 0
    start_time = time.time()

    for cls_name, files in images_by_class.items():
        cls_id = CLASS_MAP[cls_name]
        count = import_counts[cls_name]
        selected_files = files[:count]

        print(f"\n  处理 {cls_name} (类别{cls_id}): {count} 张")

        for i, filename in enumerate(selected_files):
            image_path = os.path.join(IMAGES_DIR, filename)
            try:
                annotated_frame, detections = run_inference(model_service, image_path)

                if annotated_frame is None:
                    print(f"    [{i+1}/{count}] {filename} - 读取失败")
                    failed += 1
                    continue

                import cv2
                if detections:
                    for det in detections:
                        record_service.save_record(
                            event=f"检测到钢材缺陷: {det['class_name']}",
                            box=det['bbox'],
                            cls=det['class_id'],
                            conf=det['confidence']
                        )

                    original_frame = cv2.imread(image_path)
                    record_service.save_image_group(
                        frame_original=original_frame,
                        frame_annotated=annotated_frame,
                        label=cls_name,
                        detections=detections,
                        source_type='image'
                    )
                    imported += 1
                    if (i + 1) % 10 == 0 or i == 0:
                        print(f"    [{i+1}/{count}] {filename} - 检测到 {len(detections)} 个缺陷")
                else:
                    original_frame = cv2.imread(image_path)
                    record_service.save_image_group(
                        frame_original=original_frame,
                        label=cls_name,
                        detections=[],
                        source_type='image'
                    )
                    imported += 1
                    if (i + 1) % 50 == 0:
                        print(f"    [{i+1}/{count}] {filename} - 无缺陷")

            except Exception as e:
                print(f"    [{i+1}/{count}] {filename} - 错误: {e}")
                failed += 1

    elapsed = time.time() - start_time

    print("\n" + "=" * 60)
    print(f"[4/4] 导入完成!")
    print(f"  成功: {imported} 张")
    print(f"  失败: {failed} 张")
    print(f"  耗时: {elapsed:.1f} 秒")
    if elapsed > 0:
        print(f"  速度: {imported/elapsed:.1f} 张/秒")
    print("=" * 60)

def main():
    parser = argparse.ArgumentParser(description='批量导入钢材缺陷检测记录')
    parser.add_argument('--limit', type=int, default=None,
                       help='每个类别导入的图片数量限制 (默认: 全部)')
    args = parser.parse_args()

    batch_import(limit_per_class=args.limit)

if __name__ == '__main__':
    main()
