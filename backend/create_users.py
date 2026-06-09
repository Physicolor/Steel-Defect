#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Create test users directly
"""

import os
import sys
import hashlib
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))


def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def main():
    """Main function"""
    print("=" * 50)
    print("Creating Test Users")
    print("=" * 50)

    # User data
    users = [
        {
            "id": "admin_001",
            "username": "admin",
            "password": hash_password("admin123"),
            "email": "admin@steeldefect.com",
            "user_type": "admin",
            "is_active": True
        },
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
        },
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

    # Save to JSON file
    output_file = os.path.join(os.path.dirname(__file__), "data", "users.json")
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

    print(f"Users saved to: {output_file}")
    print("\nCreated users:")
    for user in users:
        print(f"  - {user['username']} ({user['user_type']}): {user['password'][:8]}...")

    # Create detection records
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
            "status": "completed",
            "timestamp": datetime.now().isoformat()
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
            "status": "completed",
            "timestamp": datetime.now().isoformat()
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
            "status": "completed",
            "timestamp": datetime.now().isoformat()
        }
    ]

    records_file = os.path.join(os.path.dirname(__file__), "data", "records.json")
    with open(records_file, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"\nRecords saved to: {records_file}")

    # Create detection events
    events = [
        {
            "id": "event_001",
            "record_id": "record_001",
            "user_id": "user_personal_001",
            "class_name": "scratch",
            "confidence": 0.92,
            "bbox": [100, 150, 200, 180]
        },
        {
            "id": "event_002",
            "record_id": "record_001",
            "user_id": "user_personal_001",
            "class_name": "dent",
            "confidence": 0.85,
            "bbox": [300, 200, 400, 250]
        },
        {
            "id": "event_003",
            "record_id": "record_002",
            "user_id": "user_personal_002",
            "class_name": "rust",
            "confidence": 0.78,
            "bbox": [500, 300, 600, 350]
        },
        {
            "id": "event_004",
            "record_id": "record_003",
            "user_id": "user_enterprise_001",
            "class_name": "scratch",
            "confidence": 0.95,
            "bbox": [200, 250, 350, 300]
        },
        {
            "id": "event_005",
            "record_id": "record_003",
            "user_id": "user_enterprise_001",
            "class_name": "crack",
            "confidence": 0.88,
            "bbox": [600, 400, 750, 450]
        }
    ]

    events_file = os.path.join(os.path.dirname(__file__), "data", "events.json")
    with open(events_file, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)

    print(f"Events saved to: {events_file}")

    print("\n" + "=" * 50)
    print("Test data created successfully!")
    print("=" * 50)


if __name__ == "__main__":
    main()
