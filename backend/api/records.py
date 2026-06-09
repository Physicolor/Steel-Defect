#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
记录API - 检测记录管理
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, status
from loguru import logger

from database.models import (
    DetectionRecordResponse, DetectionEventResponse,
    DetectionModel, DetectionEventModel
)
from api.auth import get_current_active_user, TokenData

router = APIRouter()


@router.get("/", response_model=List[DetectionRecordResponse])
async def list_records(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: TokenData = Depends(get_current_active_user)
):
    """获取当前用户的检测记录"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        # 获取用户的检测记录
        records = await detection_model.get_user_records(
            user_id=current_user.user_id,
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


@router.get("/{record_id}", response_model=DetectionRecordResponse)
async def get_record(
    record_id: str,
    current_user: TokenData = Depends(get_current_active_user)
):
    """获取指定的检测记录"""
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

        # 检查权限：只能查看自己的记录
        if record["user_id"] != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权查看此记录"
            )

        return DetectionRecordResponse(**record)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取检测记录失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取检测记录失败"
        )


@router.get("/{record_id}/events", response_model=List[DetectionEventResponse])
async def get_record_events(
    record_id: str,
    current_user: TokenData = Depends(get_current_active_user)
):
    """获取检测记录的所有事件"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)
        event_model = DetectionEventModel(db_client)

        # 获取记录
        record = await detection_model.get(record_id)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="检测记录不存在"
            )

        # 检查权限：只能查看自己的记录
        if record["user_id"] != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权查看此记录"
            )

        # 获取事件
        events = await event_model.get_record_events(record_id)

        return [DetectionEventResponse(**event) for event in events]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取检测事件失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取检测事件失败"
        )


@router.delete("/{record_id}")
async def delete_record(
    record_id: str,
    current_user: TokenData = Depends(get_current_active_user)
):
    """删除检测记录"""
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

        # 检查权限：只能删除自己的记录
        if record["user_id"] != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权删除此记录"
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

        logger.info(f"检测记录删除成功: {record_id}")
        return {"message": "检测记录删除成功"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除检测记录失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除检测记录失败"
        )


@router.get("/statistics/summary")
async def get_user_statistics(
    current_user: TokenData = Depends(get_current_active_user)
):
    """获取当前用户的检测统计信息"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        # 获取统计信息
        statistics = await detection_model.get_statistics(user_id=current_user.user_id)

        return statistics

    except Exception as e:
        logger.error(f"获取统计信息失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取统计信息失败"
        )


@router.get("/search/similar")
async def search_similar_records(
    query: str = Query(..., min_length=1),
    limit: int = Query(default=5, le=20),
    current_user: TokenData = Depends(get_current_active_user)
):
    """搜索相似的检测记录"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        # 搜索相似记录
        records = await detection_model.search_similar(
            query_text=query,
            user_id=current_user.user_id,
            n_results=limit
        )

        return [DetectionRecordResponse(**record) for record in records]

    except Exception as e:
        logger.error(f"搜索相似记录失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="搜索相似记录失败"
        )
