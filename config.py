#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
钢材缺陷检测系统 - 配置管理
"""

import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """系统配置"""

    # 应用配置
    APP_NAME: str = "钢材缺陷检测系统"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = Field(default=False, env="DEBUG")
    HOST: str = Field(default="0.0.0.0", env="HOST")
    PORT: int = Field(default=8000, env="PORT")
    WORKERS: int = Field(default=1, env="WORKERS")

    # 安全配置
    SECRET_KEY: str = Field(
        default="steel-defect-secret-key-2026-change-in-production",
        env="SECRET_KEY"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS配置
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:8000",
    ]

    # 数据库配置（SQLite）
    DATABASE_URL: str = Field(default="sqlite:///./data/steel_defect.db", env="DATABASE_URL")

    # AI模型配置
    YOLO_MODEL_PATH: str = Field(default="./models/best.pt", env="YOLO_MODEL_PATH")
    UNET_MODEL_PATH: str = Field(default="./models/unet.pth", env="UNET_MODEL_PATH")
    USE_CUDA: bool = Field(default=True, env="USE_CUDA")
    CONF_THRESHOLD: float = Field(default=0.25, env="CONF_THRESHOLD")
    IOU_THRESHOLD: float = Field(default=0.45, env="IOU_THRESHOLD")
    IMG_SIZE: int = Field(default=640, env="IMG_SIZE")

    # 讯飞星火API配置
    SPARK_API_KEY: str = Field(default="", env="SPARK_API_KEY")
    SPARK_MODEL: str = Field(default="4.0Ultra", env="SPARK_MODEL")
    SPARK_IMAGE_APP_ID: str = Field(default="", env="SPARK_IMAGE_APP_ID")
    SPARK_IMAGE_API_KEY: str = Field(default="", env="SPARK_IMAGE_API_KEY")
    SPARK_IMAGE_API_SECRET: str = Field(default="", env="SPARK_IMAGE_API_SECRET")

    # 文件存储配置
    UPLOAD_DIR: str = Field(default="./uploads", env="UPLOAD_DIR")
    CAPTURE_DIR: str = Field(default="./captures", env="CAPTURE_DIR")
    MAX_UPLOAD_SIZE: int = Field(default=10 * 1024 * 1024, env="MAX_UPLOAD_SIZE")  # 10MB

    # 用户配置
    USER_TYPES: List[str] = ["personal", "enterprise", "admin"]
    DEFAULT_USER_TYPE: str = "personal"

    # 管理员配置
    ADMIN_USERNAME: str = Field(default="admin", env="ADMIN_USERNAME")
    ADMIN_PASSWORD: str = Field(default="admin123", env="ADMIN_PASSWORD")
    ADMIN_EMAIL: str = Field(default="admin@steeldefect.com", env="ADMIN_EMAIL")

    # 日志配置
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    LOG_FILE: str = Field(default="./logs/app.log", env="LOG_FILE")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


# 创建全局配置实例
settings = Settings()

# 确保必要的目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.CAPTURE_DIR, exist_ok=True)
os.makedirs(os.path.dirname(settings.LOG_FILE), exist_ok=True)
os.makedirs(os.path.dirname(settings.YOLO_MODEL_PATH), exist_ok=True)


def get_device():
    """获取计算设备"""
    if settings.USE_CUDA:
        try:
            import torch
            if torch.cuda.is_available():
                device = "cuda:0"
                print(f"[设备] 检测到 CUDA: {torch.cuda.get_device_name(0)}")
                return device
        except Exception as e:
            print(f"[设备] CUDA检测失败: {e}")

    print("[设备] 使用 CPU")
    return "cpu"


# 设备配置
DEVICE = get_device()
