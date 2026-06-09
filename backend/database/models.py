#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据模型定义
"""

from typing import Optional, List, Dict
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr


# ==================== 用户模型 ====================

class UserBase(BaseModel):
    """用户基础模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: Optional[str] = Field(None, description="邮箱")
    phone: Optional[str] = Field(None, description="手机号")
    company_name: Optional[str] = Field(None, description="企业名称")


class UserCreate(UserBase):
    """创建用户模型"""
    password: str = Field(..., min_length=6, description="密码")
    user_type: str = Field(default="personal", description="用户类型: personal, enterprise, admin")


class UserUpdate(BaseModel):
    """更新用户模型"""
    display_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    company: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    """用户响应模型"""
    id: str = Field(..., description="用户ID")
    user_type: str = Field(..., description="用户类型")
    is_active: bool = Field(..., description="是否激活")
    created_at: str = Field(..., description="创建时间")
    updated_at: str = Field(..., description="更新时间")


class UserModel:
    """用户数据访问模型"""

    def __init__(self, db_client):
        self.db_client = db_client

    async def create(self, user_data: UserCreate) -> str:
        """创建用户"""
        data = user_data.dict()
        return await self.db_client.create_user(data)

    async def get(self, user_id: str) -> Optional[Dict]:
        """获取用户"""
        return await self.db_client.get_user(user_id)

    async def get_by_username(self, username: str) -> Optional[Dict]:
        """根据用户名获取用户"""
        return await self.db_client.get_user_by_username(username)

    async def update(self, user_id: str, update_data: UserUpdate) -> bool:
        """更新用户"""
        return await self.db_client.update_user(user_id, update_data.dict(exclude_unset=True))

    async def delete(self, user_id: str) -> bool:
        """删除用户"""
        return await self.db_client.delete_user(user_id)

    async def list(self, user_type: Optional[str] = None) -> List[Dict]:
        """列出用户"""
        return await self.db_client.list_users(user_type)


# ==================== 检测记录模型 ====================

class DetectionRecordBase(BaseModel):
    """检测记录基础模型"""
    batch_id: Optional[str] = Field(None, description="批次ID")
    source_type: str = Field(default="image", description="来源类型: image, camera, ip_camera")
    conf_threshold: float = Field(default=0.25, description="置信度阈值")
    iou_threshold: float = Field(default=0.45, description="IOU阈值")
    image_width: int = Field(default=0, description="图片宽度")
    image_height: int = Field(default=0, description="图片高度")
    defect_count: int = Field(default=0, description="缺陷数量")


class DetectionRecordCreate(DetectionRecordBase):
    """创建检测记录模型"""
    user_id: str = Field(..., description="用户ID")
    original_image: Optional[str] = Field(None, description="原始图片路径")
    annotated_image: Optional[str] = Field(None, description="标注图片路径")
    heatmap_image: Optional[str] = Field(None, description="热力图路径")


class DetectionRecordResponse(DetectionRecordBase):
    """检测记录响应模型"""
    id: str = Field(..., description="记录ID")
    user_id: str = Field(..., description="用户ID")
    timestamp: str = Field(..., description="检测时间")
    original_image: Optional[str] = Field(None, description="原始图片路径")
    annotated_image: Optional[str] = Field(None, description="标注图片路径")
    heatmap_image: Optional[str] = Field(None, description="热力图路径")
    status: str = Field(..., description="状态")


class DetectionModel:
    """检测记录数据访问模型"""

    def __init__(self, db_client):
        self.db_client = db_client

    async def create(self, record_data: DetectionRecordCreate) -> str:
        """创建检测记录"""
        data = record_data.dict()
        return await self.db_client.create_detection_record(data)

    async def get(self, record_id: str) -> Optional[Dict]:
        """获取检测记录"""
        return await self.db_client.get_detection_record(record_id)

    async def get_user_records(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict]:
        """获取用户的检测记录"""
        return await self.db_client.get_user_detection_records(user_id, limit, offset)

    async def get_all_records(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """获取所有检测记录"""
        return await self.db_client.get_all_detection_records(limit, offset)

    async def delete(self, record_id: str) -> bool:
        """删除检测记录"""
        return await self.db_client.delete_detection_record(record_id)

    async def get_statistics(self, user_id: Optional[str] = None) -> Dict:
        """获取统计信息"""
        return await self.db_client.get_detection_statistics(user_id)

    async def search_similar(
        self,
        query_text: str,
        user_id: Optional[str] = None,
        n_results: int = 5
    ) -> List[Dict]:
        """搜索相似记录"""
        return await self.db_client.search_similar_records(query_text, user_id, n_results)


# ==================== 检测事件模型 ====================

class DetectionEventBase(BaseModel):
    """检测事件基础模型"""
    class_name: str = Field(..., description="缺陷类型")
    confidence: float = Field(..., description="置信度")
    bbox_x1: int = Field(default=0, description="边界框X1")
    bbox_y1: int = Field(default=0, description="边界框Y1")
    bbox_x2: int = Field(default=0, description="边界框X2")
    bbox_y2: int = Field(default=0, description="边界框Y2")


class DetectionEventCreate(DetectionEventBase):
    """创建检测事件模型"""
    record_id: str = Field(..., description="记录ID")
    user_id: str = Field(..., description="用户ID")


class DetectionEventResponse(DetectionEventBase):
    """检测事件响应模型"""
    id: str = Field(..., description="事件ID")
    record_id: str = Field(..., description="记录ID")
    user_id: str = Field(..., description="用户ID")
    timestamp: str = Field(..., description="检测时间")


class DetectionEventModel:
    """检测事件数据访问模型"""

    def __init__(self, db_client):
        self.db_client = db_client

    async def create(self, event_data: DetectionEventCreate) -> str:
        """创建检测事件"""
        data = event_data.dict()
        return await self.db_client.create_detection_event(data)

    async def get_record_events(self, record_id: str) -> List[Dict]:
        """获取记录的所有检测事件"""
        return await self.db_client.get_record_events(record_id)


# ==================== 认证模型 ====================

class Token(BaseModel):
    """令牌模型"""
    access_token: str = Field(..., description="访问令牌")
    refresh_token: str = Field(..., description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")


class TokenData(BaseModel):
    """令牌数据模型"""
    username: Optional[str] = None
    user_id: Optional[str] = None
    user_type: Optional[str] = None


class LoginRequest(BaseModel):
    """登录请求模型"""
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


class RegisterRequest(BaseModel):
    """注册请求模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    password: str = Field(..., min_length=6, description="密码")
    email: Optional[str] = Field(None, description="邮箱")
    phone: Optional[str] = Field(None, description="手机号")
    company_name: Optional[str] = Field(None, description="企业名称")
    user_type: str = Field(default="personal", description="用户类型")


# ==================== 管理员统计模型 ====================

class AdminStatistics(BaseModel):
    """管理员统计模型"""
    total_users: int = Field(..., description="总用户数")
    total_records: int = Field(..., description="总记录数")
    total_defects: int = Field(..., description="总缺陷数")
    user_type_stats: Dict[str, int] = Field(..., description="用户类型统计")
    source_stats: Dict[str, int] = Field(..., description="来源类型统计")
    date_stats: Dict[str, int] = Field(..., description="日期统计")
    avg_defects_per_record: float = Field(..., description="平均缺陷数")


# 导入Dict类型
from typing import Dict
