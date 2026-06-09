#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API模块初始化
"""

from .auth import router as auth_router
from .detection import router as detection_router
from .records import router as records_router
from .admin import router as admin_router

__all__ = ["auth_router", "detection_router", "records_router", "admin_router"]
