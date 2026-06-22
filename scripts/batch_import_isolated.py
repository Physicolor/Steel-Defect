#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量导入检测记录脚本（用户隔离版本）
为每个用户生成独立的检测记录，覆盖最近15天，均衡分布6种缺陷类型
"""
import os
import sys
import json
import time
import random
import shutil
import sqlite3
from datetime import datetime, timedelta

# 添加项目根目录到路径
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, '..')
sys.path.insert(0, PROJECT_ROOT)

from services.model_service import ModelService
from services.record_service import RecordService

# 配置
IMAGES_DIR = r"D:\Users\12404\Documents\钢材检测系统\flask-system-status - 副本\IMAGES"
MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "best.pt")
CAPTURE_DIR = os.path.join(PROJECT_ROOT, "captures")
DB_PATH = os.path.join(PROJECT_ROOT, "data", "steel_defect.db")

# 缺陷类别
DEFECT_TYPES = ["crazing", "inclusion", "patches", "pitted_surface", "rolled-in_scale", "scratches"]

# 用户配置：每人每天的检测数量
USER_CONFIG = {
    "user_personal_001": {"name": "zhangsan", "type": "personal", "daily_range": (2, 4)},
    "user_personal_002": {"name": "lisi", "type": "personal", "daily_range": (2, 4)},
    "user_personal_003": {"name": "wangwu", "type": "personal", "daily_range": (1, 3)},
    "user_enterprise_001": {"name": "baosteel", "type": "enterprise", "daily_range": (5, 8)},
    "user_enterprise_002": {"name": "wisco", "type": "enterprise", "daily_range": (4, 7)},
}

DAYS = 15  # 覆盖天数


def get_images_by_class():
    """获取图片列表，按类别分组"""
    images = {cls: [] for cls in DEFECT_TYPES}
    for f in os.listdir(IMAGES_DIR):
        if not f.lower().endswith('.jpg'):
            continue
        for cls in DEFECT_TYPES:
            if f.startswith(cls + '_'):
                images[cls].append(f)
                break
    for cls in images:
        random.shuffle(images[cls])
    return images


def clear_all_data():
    """清空所有旧数据"""
    print("\n[1/5] 清空旧数据...")

    # 清空 captures 目录
    if os.path.exists(CAPTURE_DIR):
        shutil.rmtree(CAPTURE_DIR)
        os.makedirs(CAPTURE_DIR, exist_ok=True)
        print(f"  ✓ 已清空 captures 目录")
    else:
        os.makedirs(CAPTURE_DIR, exist_ok=True)

    # 清空数据库中的检测记录和事件
    if os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM detection_events")
        cursor.execute("DELETE FROM detection_records")
        conn.commit()
        conn.close()
        print(f"  ✓ 已清空数据库中的检测记录")

    # 清空 records.json
    records_path = os.path.join(BACKEND_DIR, "records.json")
    if os.path.exists(records_path):
        with open(records_path, 'w') as f:
            f.write('')
        print(f"  ✓ 已清空 records.json")


def run_inference(model_service, image_path, conf_threshold=0.25):
    """对单张图片执行推理"""
    import cv2
    frame = cv2.imread(image_path)
    if frame is None:
        return None, None, None

    results = model_service.predict(frame, conf=conf_threshold, imgsz=640, iou=0.45)

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
                    "class_id": cls_id, "class_name": cls_name,
                    "confidence": conf, "bbox": [x1, y1, x2, y2]
                })
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                label = f"{cls_name} {conf:.2f}"
                cv2.putText(annotated_frame, label, (x1, y1 - 10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

    # 生成热力图
    heatmap = frame.copy()
    if detections:
        import numpy as np
        overlay = frame.copy()
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            conf = det['confidence']
            color = (0, int(255 * (1 - conf)), int(255 * conf))
            cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
        cv2.addWeighted(overlay, 0.4, heatmap, 0.6, 0, heatmap)

    return annotated_frame, detections, heatmap


def generate_records_for_user(model_service, record_service, user_id, user_cfg, images_by_class, db_cursor):
    """为单个用户生成15天的检测记录"""
    import cv2

    user_name = user_cfg["name"]
    daily_min, daily_max = user_cfg["daily_range"]
    total_records = 0

    # 为每天生成记录
    for day_offset in range(DAYS):
        target_date = datetime.now() - timedelta(days=DAYS - 1 - day_offset)
        date_str = target_date.strftime("%Y%m%d")

        # 当天检测数量
        daily_count = random.randint(daily_min, daily_max)

        # 均衡选择缺陷类型（确保每天覆盖多种类型）
        daily_defects = []
        for _ in range(daily_count):
            daily_defects.append(random.choice(DEFECT_TYPES))

        for idx, defect_type in enumerate(daily_defects):
            # 从该类型中选择一张图片
            available = images_by_class.get(defect_type, [])
            if not available:
                continue
            image_file = available[total_records % len(available)]
            image_path = os.path.join(IMAGES_DIR, image_file)

            # 生成时间戳（当天的随机时间）
            hour = random.randint(8, 18)
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            ms = random.randint(100, 999)
            ts_str = f"{date_str}_{hour:02d}{minute:02d}{second:02d}_{ms}"

            # 执行推理
            try:
                annotated, detections, heatmap = run_inference(model_service, image_path)
                if annotated is None:
                    continue
            except Exception as e:
                print(f"    推理失败 {image_file}: {e}")
                continue

            # 读取原图
            original = cv2.imread(image_path)

            # 保存图片组（使用自定义 batch_id 包含日期）
            batch_id = f"image_batch_{ts_str}"

            # 保存图片文件
            orig_path = os.path.join(CAPTURE_DIR, f"{batch_id}_original.jpg")
            anno_path = os.path.join(CAPTURE_DIR, f"{batch_id}_annotated.jpg")
            heat_path = os.path.join(CAPTURE_DIR, f"{batch_id}_heatmap.jpg")

            cv2.imwrite(orig_path, original)
            cv2.imwrite(anno_path, annotated)
            if detections:
                cv2.imwrite(heat_path, heatmap)

            # 保存裁剪图
            for i, det in enumerate(detections):
                bbox = det.get('bbox', [0, 0, 0, 0])
                x1, y1, x2, y2 = bbox
                h, w = original.shape[:2]
                x1c, y1c = max(0, x1 - 20), max(0, y1 - 20)
                x2c, y2c = min(w, x2 + 20), min(h, y2 + 20)
                if x2c > x1c and y2c > y1c:
                    crop = original[y1c:y2c, x1c:x2c]
                    crop_path = os.path.join(CAPTURE_DIR, f"{batch_id}_crop_{i}_{det['class_name']}.jpg")
                    cv2.imwrite(crop_path, crop)

            # 保存 info.json（包含 user_id）
            batch_info = {
                'batch_id': batch_id,
                'timestamp': target_date.replace(hour=hour, minute=minute, second=second).isoformat(),
                'timestamp_short': ts_str,
                'source_type': 'image',
                'user_id': user_id,
                'detection_params': {
                    'conf_threshold': 0.25,
                    'iou_threshold': 0.45
                },
                'defects': []
            }

            for i, det in enumerate(detections):
                batch_info['defects'].append({
                    'index': i,
                    'class_id': det.get('class_id', -1),
                    'class_name': det.get('class_name', 'unknown'),
                    'confidence': det.get('confidence', 0.0),
                    'bbox': det.get('bbox', [0, 0, 0, 0]),
                    'crop_file': f"crop_{i}_{det.get('class_name', 'unknown')}.jpg" if detections else None
                })

            json_path = os.path.join(CAPTURE_DIR, f"{batch_id}_info.json")
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(batch_info, f, ensure_ascii=False, indent=2)

            # 写入数据库
            record_id = f"record_{ts_str}_{user_id[:8]}"
            db_cursor.execute("""
                INSERT INTO detection_records
                (id, user_id, batch_id, source_type, timestamp, conf_threshold, iou_threshold,
                 image_width, image_height, defect_count, original_image, annotated_image, heatmap_image, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record_id, user_id, batch_id, 'image',
                target_date.replace(hour=hour, minute=minute, second=second).isoformat(),
                0.25, 0.45,
                original.shape[1], original.shape[0],
                len(detections),
                f"{batch_id}_original.jpg",
                f"{batch_id}_annotated.jpg",
                f"{batch_id}_heatmap.jpg" if detections else "",
                'completed'
            ))

            # 写入检测事件
            for det in detections:
                event_id = f"event_{ts_str}_{random.randint(100, 999)}_{det['class_name']}"
                db_cursor.execute("""
                    INSERT INTO detection_events
                    (id, record_id, user_id, class_name, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    event_id, record_id, user_id,
                    det['class_name'], det['confidence'],
                    det['bbox'][0], det['bbox'][1], det['bbox'][2], det['bbox'][3],
                    target_date.replace(hour=hour, minute=minute, second=second).isoformat()
                ))

            total_records += 1

        # 每天结束后打印进度
        defect_summary = {}
        for d in daily_defects:
            defect_summary[d] = defect_summary.get(d, 0) + 1
        summary_str = ", ".join(f"{k}:{v}" for k, v in defect_summary.items())
        print(f"    {target_date.strftime('%Y-%m-%d')}: {daily_count} 条 ({summary_str})")

    return total_records


def main():
    print("=" * 60)
    print("  钢材缺陷检测 - 批量导入（用户隔离版）")
    print("  覆盖最近15天 · 6种缺陷均衡 · 多用户隔离")
    print("=" * 60)

    # 检查图片目录
    if not os.path.exists(IMAGES_DIR):
        print(f"[错误] 图片目录不存在: {IMAGES_DIR}")
        return

    # 加载模型
    print(f"\n[加载模型] {MODEL_PATH}")
    try:
        model_service = ModelService(MODEL_PATH, "cpu")
        print(f"  模型类型: {model_service.model_type}")
        print(f"  类别: {model_service.class_names}")
    except Exception as e:
        print(f"[错误] 模型加载失败: {e}")
        return

    # 获取图片列表
    images_by_class = get_images_by_class()
    for cls, files in images_by_class.items():
        print(f"  {cls}: {len(files)} 张")

    # 清空旧数据
    clear_all_data()

    # 初始化服务
    record_service = RecordService(os.path.join(BACKEND_DIR, "records.json"), CAPTURE_DIR)

    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 为每个用户生成记录
    print(f"\n[2/5] 为 {len(USER_CONFIG)} 个用户生成检测记录（最近 {DAYS} 天）")
    print("-" * 60)

    total_all = 0
    user_stats = {}

    for user_id, user_cfg in USER_CONFIG.items():
        print(f"\n  ▶ 用户: {user_cfg['name']} ({user_cfg['type']}) - 每天 {user_cfg['daily_range'][0]}~{user_cfg['daily_range'][1]} 条")
        count = generate_records_for_user(
            model_service, record_service, user_id, user_cfg, images_by_class, cursor
        )
        user_stats[user_cfg['name']] = count
        total_all += count
        print(f"    ✓ 共生成 {count} 条记录")

    conn.commit()
    conn.close()

    # 统计
    print("\n" + "=" * 60)
    print("[完成] 导入统计:")
    print(f"  总记录数: {total_all}")
    print(f"  用户数: {len(USER_CONFIG)}")
    print(f"  天数: {DAYS}")
    print(f"  缺陷类型: {len(DEFECT_TYPES)}")
    print()
    for name, count in user_stats.items():
        print(f"  {name}: {count} 条 (平均 {count/DAYS:.1f} 条/天)")
    print("=" * 60)


if __name__ == '__main__':
    main()
