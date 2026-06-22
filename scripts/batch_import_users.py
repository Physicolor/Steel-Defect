#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量导入检测记录脚本 - 为每个用户导入不同数量的检测记录
个人用户: 20-30 张图片
企业用户: 100-200 张图片
时间戳平均分配到最近30天
"""

import os
import sys
import json
import random
import asyncio
import cv2
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from database.sqlite_client import DatabaseClient
from database.models import UserModel
from services.model_service import ModelService
from services.record_service import RecordService

# 配置
IMAGES_DIR = os.environ.get("STEEL_DEFECT_IMAGES_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "IMAGES"))
CAPTURE_DIR = os.path.join(os.path.dirname(__file__), '..', 'captures')
RECORD_PATH = os.path.join(os.path.dirname(__file__), '..', 'records.json')

# 用户类型对应的图片数量范围
USER_TYPE_LIMITS = {
    'personal': (20, 30),
    'enterprise': (100, 200),
    'admin': (0, 0)  # 管理员不导入
}

# 缺陷类别映射
CLASS_NAMES = {
    'crazing': 0,
    'inclusion': 1,
    'patches': 2,
    'pitted_surface': 3,
    'rolled-in_scale': 4,
    'scratches': 5
}


def get_images_by_category():
    """按类别获取所有图片"""
    images = {}
    for category in CLASS_NAMES.keys():
        cat_images = []
        for f in os.listdir(IMAGES_DIR):
            if f.startswith(category + '_') and f.endswith('.jpg'):
                cat_images.append(os.path.join(IMAGES_DIR, f))
        images[category] = sorted(cat_images)
    return images


def generate_timestamps(count, days=30):
    """生成最近N天内均匀分布的时间戳"""
    timestamps = []
    now = datetime.now()
    start_time = now - timedelta(days=days)

    for i in range(count):
        # 在30天内均匀分布
        offset = timedelta(
            days=random.uniform(0, days),
            hours=random.randint(6, 22),  # 工作时间
            minutes=random.randint(0, 59),
            seconds=random.randint(0, 59)
        )
        ts = start_time + offset
        timestamps.append(ts.strftime('%Y%m%d_%H%M%S_%f')[:-3])

    return sorted(timestamps)


def select_images(images_by_category, count):
    """从每个类别均匀选择图片"""
    categories = list(images_by_category.keys())
    per_category = max(1, count // len(categories))
    selected = []

    for cat in categories:
        cat_images = images_by_category[cat]
        if not cat_images:
            continue
        # 随机选择，但不超过该类别的图片数
        n = min(per_category, len(cat_images))
        selected.extend(random.sample(cat_images, n))

    # 如果不够，从所有图片中随机补充
    if len(selected) < count:
        all_images = []
        for imgs in images_by_category.values():
            all_images.extend(imgs)
        remaining = [img for img in all_images if img not in selected]
        if remaining:
            extra = min(count - len(selected), len(remaining))
            selected.extend(random.sample(remaining, extra))

    # 如果多了，随机裁剪
    if len(selected) > count:
        selected = random.sample(selected, count)

    random.shuffle(selected)
    return selected


async def import_for_user(user, model_service, record_service, images_by_category):
    """为单个用户导入检测记录"""
    user_type = user.get('user_type', 'personal')
    user_id = user.get('id', '')
    username = user.get('username', 'unknown')

    limits = USER_TYPE_LIMITS.get(user_type, (0, 0))
    if limits[1] == 0:
        print(f"  跳过管理员用户: {username}")
        return 0

    count = random.randint(limits[0], limits[1])
    print(f"  用户 {username} ({user_type}): 导入 {count} 张图片...")

    # 选择图片
    selected_images = select_images(images_by_category, count)
    if not selected_images:
        print(f"  警告: 没有可用的图片")
        return 0

    # 生成时间戳
    timestamps = generate_timestamps(len(selected_images))

    imported = 0
    for idx, (img_path, ts) in enumerate(zip(selected_images, timestamps)):
        try:
            # 读取图片
            frame = cv2.imread(img_path)
            if frame is None:
                continue

            # 运行YOLO检测
            results = model_service.model(frame, conf=0.25, iou=0.45, verbose=False)
            if not results or len(results) == 0:
                continue

            result = results[0]
            detections = []
            if result.boxes is not None:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    cls_name = model_service.class_names.get(cls_id, f'class_{cls_id}')
                    detections.append({
                        'bbox': [int(x1), int(y1), int(x2), int(y2)],
                        'confidence': conf,
                        'class_id': cls_id,
                        'class_name': cls_name
                    })

            # 绘制标注图
            annotated = frame.copy()
            for det in detections:
                x1, y1, x2, y2 = det['bbox']
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
                label = f"{det['class_name']} {det['confidence']:.2f}"
                cv2.putText(annotated, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

            # 使用自定义时间戳保存
            batch_id = f"image_batch_{ts}"

            # 保存图片
            orig_path = os.path.join(CAPTURE_DIR, f"{batch_id}_original.jpg")
            anno_path = os.path.join(CAPTURE_DIR, f"{batch_id}_annotated.jpg")
            cv2.imwrite(orig_path, frame)
            cv2.imwrite(anno_path, annotated)

            # 保存批次信息
            batch_info = {
                'batch_id': batch_id,
                'timestamp': datetime.now().isoformat(),
                'timestamp_short': ts,
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
                    'class_id': det['class_id'],
                    'class_name': det['class_name'],
                    'confidence': det['confidence'],
                    'bbox': det['bbox']
                })

            # 保存info JSON
            info_path = os.path.join(CAPTURE_DIR, f"{batch_id}_info.json")
            with open(info_path, 'w', encoding='utf-8') as f:
                json.dump(batch_info, f, ensure_ascii=False, indent=2)

            imported += 1

            if (idx + 1) % 10 == 0:
                print(f"    已导入 {idx + 1}/{len(selected_images)}...")

        except Exception as e:
            print(f"    错误: {e}")
            continue

    print(f"  完成: {username} 导入了 {imported} 条记录")
    return imported


async def create_test_users(db_client):
    """创建测试用户"""
    import hashlib
    user_model = UserModel(db_client)

    test_users = [
        {"username": "personal1", "password": hashlib.sha256("123456".encode()).hexdigest(), "user_type": "personal", "company_name": ""},
        {"username": "personal2", "password": hashlib.sha256("123456".encode()).hexdigest(), "user_type": "personal", "company_name": ""},
        {"username": "enterprise1", "password": hashlib.sha256("123456".encode()).hexdigest(), "user_type": "enterprise", "company_name": "宝钢集团"},
        {"username": "enterprise2", "password": hashlib.sha256("123456".encode()).hexdigest(), "user_type": "enterprise", "company_name": "鞍钢股份"},
    ]

    created = []
    for u in test_users:
        existing = await user_model.get_by_username(u["username"])
        if existing:
            print(f"   用户已存在: {u['username']} (ID: {existing.get('id')})")
            created.append(existing)
        else:
            from database.models import UserCreate
            user_data = UserCreate(**u)
            user_id = await user_model.create(user_data)
            print(f"   创建用户: {u['username']} ({u['user_type']}) -> {user_id}")
            u['id'] = user_id
            created.append(u)

    return created


async def main():
    print("=" * 60)
    print("钢材缺陷检测系统 - 批量导入检测记录")
    print("=" * 60)

    # 确保目录存在
    os.makedirs(CAPTURE_DIR, exist_ok=True)

    # 初始化SQLite数据库
    print("\n1. 连接数据库...")
    db_client = DatabaseClient()
    await db_client.initialize()
    print("   数据库连接成功")

    # 创建测试用户
    print("\n2. 创建测试用户...")
    await create_test_users(db_client)

    # 获取所有用户
    print("\n3. 获取用户列表...")
    user_model = UserModel(db_client)
    users = await user_model.list()
    print(f"   找到 {len(users)} 个用户")

    for u in users:
        print(f"   - {u.get('username')} ({u.get('user_type')})")

    # 初始化YOLO模型
    print("\n4. 加载YOLO模型...")
    model_path = os.path.join(os.path.dirname(__file__), '..', 'models', 'best.pt')
    if not os.path.exists(model_path):
        print(f"   错误: 模型文件不存在: {model_path}")
        return
    model_service = ModelService(model_path, 'cpu')
    print(f"   模型加载成功，类别: {model_service.class_names}")

    # 初始化记录服务
    print("\n5. 初始化记录服务...")
    record_service = RecordService(RECORD_PATH, CAPTURE_DIR)
    print("   记录服务初始化成功")

    # 获取图片列表
    print("\n6. 扫描图片目录...")
    images_by_category = get_images_by_category()
    for cat, imgs in images_by_category.items():
        print(f"   {cat}: {len(imgs)} 张图片")

    # 为每个用户导入记录
    print("\n7. 开始导入检测记录...")
    total_imported = 0
    for user in users:
        count = await import_for_user(user, model_service, record_service, images_by_category)
        total_imported += count

    print("\n" + "=" * 60)
    print(f"导入完成! 共导入 {total_imported} 条检测记录")
    print("=" * 60)

    # 关闭数据库
    await db_client.close()


if __name__ == '__main__':
    asyncio.run(main())
