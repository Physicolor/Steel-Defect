#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库初始化脚本
功能：创建默认管理员账户，初始化数据库
"""

import os
import sys
import asyncio
from datetime import datetime
from passlib.context import CryptContext
from loguru import logger

# 添加项目根目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from config import settings
from database.sqlite_client import DatabaseClient


# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def init_database():
    """初始化数据库"""
    try:
        logger.info("正在初始化数据库...")

        # 创建SQLite客户端
        db_client = DatabaseClient()
        await db_client.initialize()

        logger.info("SQLite数据库初始化成功")

        # 创建默认管理员账户
        await create_default_admin(db_client)

        # 创建示例数据（可选）
        if settings.DEBUG:
            await create_sample_data(db_client)

        logger.info("数据库初始化完成")

    except Exception as e:
        logger.error(f"数据库初始化失败: {e}")
        raise


async def create_default_admin(db_client: DatabaseClient):
    """创建默认管理员账户"""
    try:
        # 检查管理员是否已存在
        existing_admin = await db_client.get_user_by_username(settings.ADMIN_USERNAME)
        if existing_admin:
            logger.info(f"管理员账户已存在: {settings.ADMIN_USERNAME}")
            return

        # 创建管理员用户
        admin_data = {
            "id": "admin_001",
            "username": settings.ADMIN_USERNAME,
            "password": pwd_context.hash(settings.ADMIN_PASSWORD),
            "email": settings.ADMIN_EMAIL,
            "user_type": "admin",
            "is_active": True,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }

        await db_client.create_user(admin_data)

        logger.info(f"默认管理员账户创建成功: {settings.ADMIN_USERNAME}")
        logger.info(f"管理员密码: {settings.ADMIN_PASSWORD}")
        logger.info("请在生产环境中修改默认密码！")

    except Exception as e:
        logger.error(f"创建管理员账户失败: {e}")
        raise


async def create_sample_data(db_client: DatabaseClient):
    """创建示例数据"""
    try:
        logger.info("正在创建示例数据...")

        # 创建示例用户
        sample_users = [
            {
                "id": "user_001",
                "username": "personal_user",
                "password": pwd_context.hash("password123"),
                "email": "personal@example.com",
                "phone": "13800138001",
                "user_type": "personal",
                "is_active": True
            },
            {
                "id": "user_002",
                "username": "enterprise_user",
                "password": pwd_context.hash("password123"),
                "email": "enterprise@example.com",
                "phone": "13800138002",
                "company_name": "示例企业",
                "user_type": "enterprise",
                "is_active": True
            }
        ]

        for user_data in sample_users:
            existing_user = await db_client.get_user_by_username(user_data["username"])
            if not existing_user:
                await db_client.create_user(user_data)
                logger.info(f"示例用户创建成功: {user_data['username']}")

        # 创建示例检测记录
        sample_records = [
            {
                "id": "record_001",
                "user_id": "user_001",
                "batch_id": "batch_20260601_001",
                "source_type": "image",
                "conf_threshold": 0.25,
                "iou_threshold": 0.45,
                "image_width": 640,
                "image_height": 640,
                "defect_count": 2,
                "original_image": "captures/batch_20260601_001_original.jpg",
                "annotated_image": "captures/batch_20260601_001_annotated.jpg",
                "heatmap_image": "captures/batch_20260601_001_heatmap.jpg",
                "status": "completed"
            },
            {
                "id": "record_002",
                "user_id": "user_002",
                "batch_id": "batch_20260601_002",
                "source_type": "camera",
                "conf_threshold": 0.30,
                "iou_threshold": 0.50,
                "image_width": 1280,
                "image_height": 720,
                "defect_count": 1,
                "original_image": "captures/batch_20260601_002_original.jpg",
                "annotated_image": "captures/batch_20260601_002_annotated.jpg",
                "heatmap_image": "captures/batch_20260601_002_heatmap.jpg",
                "status": "completed"
            }
        ]

        for record_data in sample_records:
            existing_record = await db_client.get_detection_record(record_data["id"])
            if not existing_record:
                await db_client.create_detection_record(record_data)
                logger.info(f"示例检测记录创建成功: {record_data['batch_id']}")

        # 创建示例检测事件
        sample_events = [
            {
                "id": "event_001",
                "record_id": "record_001",
                "user_id": "user_001",
                "class_name": "scratch",
                "confidence": 0.92,
                "bbox_x1": 100,
                "bbox_y1": 150,
                "bbox_x2": 200,
                "bbox_y2": 180
            },
            {
                "id": "event_002",
                "record_id": "record_001",
                "user_id": "user_001",
                "class_name": "dent",
                "confidence": 0.85,
                "bbox_x1": 300,
                "bbox_y1": 200,
                "bbox_x2": 400,
                "bbox_y2": 250
            },
            {
                "id": "event_003",
                "record_id": "record_002",
                "user_id": "user_002",
                "class_name": "rust",
                "confidence": 0.78,
                "bbox_x1": 500,
                "bbox_y1": 300,
                "bbox_x2": 600,
                "bbox_y2": 350
            }
        ]

        for event_data in sample_events:
            await db_client.create_detection_event(event_data)
            logger.info(f"示例检测事件创建成功: {event_data['class_name']}")

        logger.info("示例数据创建完成")

    except Exception as e:
        logger.error(f"创建示例数据失败: {e}")
        raise


async def reset_database():
    """重置数据库"""
    try:
        logger.warning("正在重置数据库...")

        # 删除SQLite数据库文件
        import os
        db_url = settings.DATABASE_URL
        if db_url.startswith("sqlite:///"):
            db_path = db_url.replace("sqlite:///", "")
        else:
            db_path = db_url

        if os.path.exists(db_path):
            os.remove(db_path)
            logger.info(f"数据库文件已删除: {db_path}")

        # 重新初始化
        await init_database()

    except Exception as e:
        logger.error(f"重置数据库失败: {e}")
        raise


def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description="数据库初始化脚本")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="重置数据库（删除所有数据）"
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="创建示例数据"
    )

    args = parser.parse_args()

    # 配置日志
    logger.add(
        "logs/init_db.log",
        rotation="10 MB",
        retention="7 days",
        level="INFO"
    )

    # 运行初始化
    if args.reset:
        asyncio.run(reset_database())
    else:
        asyncio.run(init_database())


if __name__ == "__main__":
    main()
