#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simplified database initialization script
"""

import os
import sys
import asyncio
import hashlib
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from config import settings
from database.sqlite_client import DatabaseClient


def hash_password(password: str) -> str:
    """Simple password hashing using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


async def create_users():
    """Create test users"""
    print("Initializing database...")

    db_client = DatabaseClient()
    await db_client.initialize()
    print("SQLite database initialized successfully")

    # Create admin user
    admin_data = {
        "id": "admin_001",
        "username": "admin",
        "password": hash_password("admin123"),
        "email": "admin@steeldefect.com",
        "user_type": "admin",
        "is_active": True,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }

    try:
        await db_client.create_user(admin_data)
        print("Admin user created: admin / admin123")
    except Exception as e:
        print(f"Admin user may already exist: {e}")

    # Create personal users
    personal_users = [
        {
            "id": "user_personal_001",
            "username": "zhangsan",
            "password": hash_password("123456"),
            "email": "zhangsan@example.com",
            "phone": "13800138001",
            "user_type": "personal",
            "is_active": True
        },
        {
            "id": "user_personal_002",
            "username": "lisi",
            "password": hash_password("123456"),
            "email": "lisi@example.com",
            "phone": "13800138002",
            "user_type": "personal",
            "is_active": True
        },
        {
            "id": "user_personal_003",
            "username": "wangwu",
            "password": hash_password("123456"),
            "email": "wangwu@example.com",
            "phone": "13800138003",
            "user_type": "personal",
            "is_active": True
        }
    ]

    for user_data in personal_users:
        try:
            await db_client.create_user(user_data)
            print(f"Personal user created: {user_data['username']} / 123456")
        except Exception as e:
            print(f"User {user_data['username']} may already exist")

    # Create enterprise users
    enterprise_users = [
        {
            "id": "user_enterprise_001",
            "username": "baosteel",
            "password": hash_password("123456"),
            "email": "baosteel@example.com",
            "phone": "13800138010",
            "company_name": "Baoshan Iron & Steel Co.",
            "user_type": "enterprise",
            "is_active": True
        },
        {
            "id": "user_enterprise_002",
            "username": "wisco",
            "password": hash_password("123456"),
            "email": "wisco@example.com",
            "phone": "13800138011",
            "company_name": "Wuhan Iron & Steel Co.",
            "user_type": "enterprise",
            "is_active": True
        }
    ]

    for user_data in enterprise_users:
        try:
            await db_client.create_user(user_data)
            print(f"Enterprise user created: {user_data['username']} / 123456")
        except Exception as e:
            print(f"User {user_data['username']} may already exist")

    print("\n=== User Accounts Created ===")
    print("Admin: admin / admin123")
    print("Personal: zhangsan, lisi, wangwu / 123456")
    print("Enterprise: baosteel, wisco / 123456")

    return db_client


async def create_detection_records(db_client):
    """Create sample detection records"""
    print("\nCreating sample detection records...")

    records = [
        {
            "id": "record_001",
            "user_id": "user_personal_001",
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
            "user_id": "user_personal_002",
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
        },
        {
            "id": "record_003",
            "user_id": "user_enterprise_001",
            "batch_id": "batch_20260601_003",
            "source_type": "image",
            "conf_threshold": 0.25,
            "iou_threshold": 0.45,
            "image_width": 1920,
            "image_height": 1080,
            "defect_count": 3,
            "original_image": "captures/batch_20260601_003_original.jpg",
            "annotated_image": "captures/batch_20260601_003_annotated.jpg",
            "heatmap_image": "captures/batch_20260601_003_heatmap.jpg",
            "status": "completed"
        },
        {
            "id": "record_004",
            "user_id": "user_enterprise_002",
            "batch_id": "batch_20260602_001",
            "source_type": "ip_camera",
            "conf_threshold": 0.35,
            "iou_threshold": 0.55,
            "image_width": 1920,
            "image_height": 1080,
            "defect_count": 0,
            "original_image": "captures/batch_20260602_001_original.jpg",
            "annotated_image": "captures/batch_20260602_001_annotated.jpg",
            "heatmap_image": "captures/batch_20260602_001_heatmap.jpg",
            "status": "completed"
        }
    ]

    for record in records:
        try:
            await db_client.create_detection_record(record)
            print(f"Record created: {record['batch_id']} (user: {record['user_id']}, defects: {record['defect_count']})")
        except Exception as e:
            print(f"Record {record['batch_id']} may already exist")

    # Create detection events
    events = [
        {
            "id": "event_001",
            "record_id": "record_001",
            "user_id": "user_personal_001",
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
            "user_id": "user_personal_001",
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
            "user_id": "user_personal_002",
            "class_name": "rust",
            "confidence": 0.78,
            "bbox_x1": 500,
            "bbox_y1": 300,
            "bbox_x2": 600,
            "bbox_y2": 350
        },
        {
            "id": "event_004",
            "record_id": "record_003",
            "user_id": "user_enterprise_001",
            "class_name": "scratch",
            "confidence": 0.95,
            "bbox_x1": 200,
            "bbox_y1": 250,
            "bbox_x2": 350,
            "bbox_y2": 300
        },
        {
            "id": "event_005",
            "record_id": "record_003",
            "user_id": "user_enterprise_001",
            "class_name": "crack",
            "confidence": 0.88,
            "bbox_x1": 600,
            "bbox_y1": 400,
            "bbox_x2": 750,
            "bbox_y2": 450
        },
        {
            "id": "event_006",
            "record_id": "record_003",
            "user_id": "user_enterprise_001",
            "class_name": "hole",
            "confidence": 0.72,
            "bbox_x1": 900,
            "bbox_y1": 600,
            "bbox_x2": 1000,
            "bbox_y2": 680
        }
    ]

    for event in events:
        try:
            await db_client.create_detection_event(event)
            print(f"Event created: {event['class_name']} (confidence: {event['confidence']})")
        except Exception as e:
            print(f"Event {event['id']} may already exist")


async def main():
    """Main function"""
    print("=" * 50)
    print("Steel Defect Detection System - Database Init")
    print("=" * 50)

    db_client = await create_users()
    await create_detection_records(db_client)

    print("\n" + "=" * 50)
    print("Database initialization completed!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
