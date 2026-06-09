#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检测API - 图片检测、摄像头检测
"""

import os
import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse, FileResponse
from loguru import logger

from config import settings
from database.models import (
    DetectionRecordCreate, DetectionRecordResponse,
    DetectionEventCreate, DetectionEventResponse,
    DetectionModel, DetectionEventModel
)
from api.auth import get_current_active_user, TokenData

router = APIRouter()


@router.post("/image", response_model=DetectionRecordResponse)
async def detect_image(
    file: UploadFile = File(...),
    conf_threshold: float = Form(default=0.25),
    iou_threshold: float = Form(default=0.45),
    current_user: TokenData = Depends(get_current_active_user)
):
    """图片检测"""
    try:
        # 验证文件类型
        allowed_types = ["image/jpeg", "image/png", "image/bmp", "image/webp"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的文件类型: {file.content_type}"
            )

        # 验证文件大小
        file_size = 0
        file_content = await file.read()
        file_size = len(file_content)
        if file_size > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"文件大小超过限制: {file_size} > {settings.MAX_UPLOAD_SIZE}"
            )

        # 生成批次ID
        batch_id = f"batch_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"

        # 保存上传文件
        upload_dir = settings.UPLOAD_DIR
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, f"{batch_id}_{file.filename}")

        with open(file_path, "wb") as f:
            f.write(file_content)

        # 获取模型服务
        from main import get_model_service
        model_service = get_model_service()

        # 执行检测
        detection_result = await model_service.detect_image(
            image_path=file_path,
            conf_threshold=conf_threshold,
            iou_threshold=iou_threshold
        )

        # 保存检测结果图片
        capture_dir = settings.CAPTURE_DIR
        os.makedirs(capture_dir, exist_ok=True)

        original_image_path = os.path.join(capture_dir, f"{batch_id}_original.jpg")
        annotated_image_path = os.path.join(capture_dir, f"{batch_id}_annotated.jpg")
        heatmap_image_path = os.path.join(capture_dir, f"{batch_id}_heatmap.jpg")

        # 这里应该调用模型服务保存图片
        # 临时方案：直接复制文件
        import shutil
        shutil.copy(file_path, original_image_path)

        # 创建检测记录
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        record_data = DetectionRecordCreate(
            user_id=current_user.user_id,
            batch_id=batch_id,
            source_type="image",
            conf_threshold=conf_threshold,
            iou_threshold=iou_threshold,
            image_width=detection_result.get("image_width", 0),
            image_height=detection_result.get("image_height", 0),
            defect_count=detection_result.get("defect_count", 0),
            original_image=original_image_path,
            annotated_image=annotated_image_path,
            heatmap_image=heatmap_image_path
        )

        record_id = await detection_model.create(record_data)

        # 创建检测事件
        event_model = DetectionEventModel(db_client)
        for event in detection_result.get("events", []):
            event_data = DetectionEventCreate(
                record_id=record_id,
                user_id=current_user.user_id,
                class_name=event["class_name"],
                confidence=event["confidence"],
                bbox_x1=event["bbox"][0],
                bbox_y1=event["bbox"][1],
                bbox_x2=event["bbox"][2],
                bbox_y2=event["bbox"][3]
            )
            await event_model.create(event_data)

        # 获取创建的记录
        record = await detection_model.get(record_id)

        logger.info(f"图片检测完成: {batch_id}, 缺陷数量: {detection_result.get('defect_count', 0)}")
        return DetectionRecordResponse(**record)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"图片检测失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="图片检测失败，请稍后重试"
        )


@router.get("/camera/stream")
async def camera_stream(
    camera_source: str = "0",
    current_user: TokenData = Depends(get_current_active_user)
):
    """摄像头实时检测流"""
    try:
        # 获取视频服务
        from main import get_video_service
        video_service = get_video_service()

        # 开始视频流
        async def generate_frames():
            async for frame in video_service.stream_camera(camera_source):
                yield frame

        return StreamingResponse(
            generate_frames(),
            media_type="multipart/x-mixed-replace; boundary=frame"
        )

    except Exception as e:
        logger.error(f"摄像头流失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="摄像头连接失败"
        )


@router.post("/camera/capture", response_model=DetectionRecordResponse)
async def capture_from_camera(
    camera_source: str = "0",
    conf_threshold: float = 0.25,
    iou_threshold: float = 0.45,
    current_user: TokenData = Depends(get_current_active_user)
):
    """从摄像头捕获并检测"""
    try:
        # 获取视频服务
        from main import get_video_service
        video_service = get_video_service()

        # 捕获帧
        frame = await video_service.capture_frame(camera_source)
        if frame is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法从摄像头捕获图像"
            )

        # 保存捕获的图像
        batch_id = f"capture_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
        capture_dir = settings.CAPTURE_DIR
        os.makedirs(capture_dir, exist_ok=True)

        original_image_path = os.path.join(capture_dir, f"{batch_id}_original.jpg")

        # 这里应该保存帧图像
        # 临时方案：创建空文件
        with open(original_image_path, "wb") as f:
            f.write(b"placeholder")

        # 获取模型服务
        from main import get_model_service
        model_service = get_model_service()

        # 执行检测
        detection_result = await model_service.detect_image(
            image_path=original_image_path,
            conf_threshold=conf_threshold,
            iou_threshold=iou_threshold
        )

        # 创建检测记录
        from main import get_db_client
        db_client = get_db_client()
        detection_model = DetectionModel(db_client)

        record_data = DetectionRecordCreate(
            user_id=current_user.user_id,
            batch_id=batch_id,
            source_type="camera",
            conf_threshold=conf_threshold,
            iou_threshold=iou_threshold,
            image_width=detection_result.get("image_width", 0),
            image_height=detection_result.get("image_height", 0),
            defect_count=detection_result.get("defect_count", 0),
            original_image=original_image_path,
            annotated_image="",
            heatmap_image=""
        )

        record_id = await detection_model.create(record_data)

        # 获取创建的记录
        record = await detection_model.get(record_id)

        logger.info(f"摄像头捕获检测完成: {batch_id}")
        return DetectionRecordResponse(**record)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"摄像头捕获检测失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="摄像头捕获检测失败"
        )


@router.get("/models")
async def list_models(current_user: TokenData = Depends(get_current_active_user)):
    """列出可用的检测模型"""
    try:
        # 获取模型服务
        from main import get_model_service
        model_service = get_model_service()

        models = await model_service.list_models()
        return {"models": models}

    except Exception as e:
        logger.error(f"列出模型失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取模型列表失败"
        )


@router.post("/models/{model_name}/load")
async def load_model(
    model_name: str,
    current_user: TokenData = Depends(get_current_active_user)
):
    """加载指定模型"""
    try:
        # 获取模型服务
        from main import get_model_service
        model_service = get_model_service()

        success = await model_service.load_model(model_name)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"加载模型失败: {model_name}"
            )

        return {"message": f"模型 {model_name} 加载成功"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"加载模型失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="加载模型失败"
        )


@router.get("/image/{image_path}")
async def get_detection_image(
    image_path: str,
    current_user: TokenData = Depends(get_current_active_user)
):
    """获取检测结果图片"""
    try:
        # 构建完整的图片路径
        full_path = os.path.join(settings.CAPTURE_DIR, image_path)

        # 检查文件是否存在
        if not os.path.exists(full_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="图片不存在"
            )

        # 返回图片
        return FileResponse(full_path)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取图片失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取图片失败"
        )
