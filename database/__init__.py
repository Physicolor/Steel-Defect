#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库模块初始化 - 支持 SQLite 和 MySQL 自动切换

使用方式：
    # 方式1：直接导入（推荐）
    from database import get_database_client
    db = await get_database_client()

    # 方式2：导入模型
    from database import UserModel, DetectionModel
"""

from config import settings


def get_database_client():
    """根据 DATABASE_URL 自动选择数据库客户端"""
    db_url = settings.DATABASE_URL

    if db_url.startswith("mysql://"):
        from .mysql_client import DatabaseClient
        return DatabaseClient()
    else:
        from .sqlite_client import DatabaseClient
        return DatabaseClient()


# 导出模型
from .models import UserModel, DetectionModel, DetectionEventModel

__all__ = ["get_database_client", "UserModel", "DetectionModel", "DetectionEventModel"]
