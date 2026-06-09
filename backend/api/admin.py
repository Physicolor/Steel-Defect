#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
管理员API - 看板、统计、用户管理
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, status
from loguru import logger

from database.models import (
    UserResponse, DetectionRecordResponse,
    AdminStatistics, UserModel, DetectionModel
)
from api.auth import get_admin_user, TokenData

router = APIRouter()


@router.get("/dashboard", response_model=AdminStatistics)
async def get_admin_dashboard(
    current_user: TokenData = Depends(get_admin_user)
):
    """获取管理员看板数据"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        user_model = UserModel(db_client)
        detection_model = DetectionModel(db_client)

        # 获取用户统计
        user_stats = await db_client.get_user_statistics()

        # 获取检测统计
        detection_stats = await detection_model.get_statistics()

        # 组合统计数据
        statistics = AdminStatistics(
            total_users=user_stats["total_users"],
            total_records=detection_stats["total_records"],
            total_defects=detection_stats["total_defects"],
            user_type_stats=user_stats["type_stats"],
            source_stats=detection_stats["source_stats"],
            date_stats=detection_stats["date_stats"],
            avg_defects_per_record=detection_stats["avg_defects_per_record"]
        )

        return statistics

    except Exception as e:
        logger.error(f"获取管理员看板数据失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取看板数据失败"
        )


@router.get("/users", response_model=List[UserResponse])
async def list_all_users(
    user_type: Optional[str] = Query(None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: TokenData = Depends(get_admin_user)
):
    """列出所有用户"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        user_model = UserModel(db_client)

        # 获取用户列表
        users = await user_model.list(user_type=user_type)

        # 应用分页
        paginated_users = users[offset:offset + limit]

        return [UserResponse(**user) for user in paginated_users]

    except Exception as e:
        logger.error(f"获取用户列表失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取用户列表失败"
        )


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_detail(
    user_id: str,
    current_user: TokenData = Depends(get_admin_user)
):
    """获取用户详情"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        user_model = UserModel(db_client)

        # 获取用户
        user = await user_model.get(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )

        return UserResponse(**user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取用户详情失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取用户详情失败"
        )


@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    is_active: bool,
    current_user: TokenData = Depends(get_admin_user)
):
    """更新用户状态（启用/禁用）"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        user_model = UserModel(db_client)

        # 获取用户
        user = await user_model.get(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )

        # 不能禁用自己
        if user_id == current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不能禁用自己的账户"
            )

        # 更新状态
        success = await user_model.update(user_id, {"is_active": is_active})
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="更新用户状态失败"
            )

        status_text = "启用" if is_active else "禁用"
        logger.info(f"用户 {user_id} 已{status_text}")
        return {"message": f"用户已{status_text}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新用户状态失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新用户状态失败"
        )


@router.get("/records", response_model=List[DetectionRecordResponse])
async def list_all_records(
    user_id: Optional[str] = Query(None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: TokenData = Depends(get_admin_user)
):
    """列出所有检测记录"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        # 获取记录
        if user_id:
            records = await detection_model.get_user_records(
                user_id=user_id,
                limit=limit,
                offset=offset
            )
        else:
            records = await detection_model.get_all_records(
                limit=limit,
                offset=offset
            )

        return [DetectionRecordResponse(**record) for record in records]

    except Exception as e:
        logger.error(f"获取检测记录失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取检测记录失败"
        )


@router.get("/records/{record_id}", response_model=DetectionRecordResponse)
async def get_record_detail(
    record_id: str,
    current_user: TokenData = Depends(get_admin_user)
):
    """获取检测记录详情"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        # 获取记录
        record = await detection_model.get(record_id)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="检测记录不存在"
            )

        return DetectionRecordResponse(**record)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取检测记录详情失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取检测记录详情失败"
        )


@router.delete("/records/{record_id}")
async def delete_record_admin(
    record_id: str,
    current_user: TokenData = Depends(get_admin_user)
):
    """删除检测记录（管理员）"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        # 获取记录
        record = await detection_model.get(record_id)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="检测记录不存在"
            )

        # 删除记录
        success = await detection_model.delete(record_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="删除记录失败"
            )

        # 删除相关的图片文件
        import os
        if record.get("original_image") and os.path.exists(record["original_image"]):
            os.remove(record["original_image"])
        if record.get("annotated_image") and os.path.exists(record["annotated_image"]):
            os.remove(record["annotated_image"])
        if record.get("heatmap_image") and os.path.exists(record["heatmap_image"]):
            os.remove(record["heatmap_image"])

        logger.info(f"管理员删除检测记录: {record_id}")
        return {"message": "检测记录删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除检测记录失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除检测记录失败"
        )


@router.get("/statistics/users")
async def get_user_statistics_admin(
    current_user: TokenData = Depends(get_admin_user)
):
    """获取用户统计信息"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()

        # 获取用户统计
        user_stats = await db_client.get_user_statistics()

        return user_stats

    except Exception as e:
        logger.error(f"获取用户统计信息失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取用户统计信息失败"
        )


@router.get("/statistics/detections")
async def get_detection_statistics_admin(
    user_id: Optional[str] = Query(None),
    current_user: TokenData = Depends(get_admin_user)
):
    """获取检测统计信息"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        # 获取检测统计
        detection_stats = await detection_model.get_statistics(user_id=user_id)

        return detection_stats

    except Exception as e:
        logger.error(f"获取检测统计信息失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取检测统计信息失败"
        )


@router.get("/statistics/defect-types")
async def get_defect_type_statistics(
    current_user: TokenData = Depends(get_admin_user)
):
    """获取缺陷类型统计"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()

        # 获取检测统计（包含缺陷类型分布）
        detection_stats = await db_client.get_detection_statistics()
        defect_type_stats = detection_stats.get("defect_stats", {})

        # 按数量排序
        sorted_stats = dict(sorted(
            defect_type_stats.items(),
            key=lambda x: x[1],
            reverse=True
        ))

        return {
            "defect_type_stats": sorted_stats,
            "total_events": detection_stats.get("total_events", 0)
        }

    except Exception as e:
        logger.error(f"获取缺陷类型统计失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取缺陷类型统计失败"
        )


@router.get("/statistics/trends")
async def get_detection_trends(
    days: int = Query(default=30, le=365),
    current_user: TokenData = Depends(get_admin_user)
):
    """获取检测趋势数据"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()

        # 获取检测统计（包含日期分布）
        detection_stats = await db_client.get_detection_statistics()
        stored_date_stats = detection_stats.get("date_stats", {})

        # 按日期统计（填充最近N天）
        from datetime import datetime, timedelta
        date_stats = {}
        for i in range(days):
            date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            date_stats[date] = stored_date_stats.get(date, 0)

        # 按日期排序
        sorted_stats = dict(sorted(date_stats.items()))

        return {
            "trends": sorted_stats,
            "period_days": days
        }

    except Exception as e:
        logger.error(f"获取检测趋势失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取检测趋势失败"
        )
