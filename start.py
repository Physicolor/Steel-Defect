#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
后端启动脚本
功能：启动FastAPI服务，支持开发和生产模式
"""

import os
import sys
import argparse
import uvicorn
from loguru import logger

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(__file__))

from config import settings


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="钢材缺陷检测系统后端启动脚本")
    parser.add_argument(
        "--host",
        default=settings.HOST,
        help=f"监听地址（默认: {settings.HOST}）"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=settings.PORT,
        help=f"监听端口（默认: {settings.PORT}）"
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        default=settings.DEBUG,
        help="启用热重载（开发模式）"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=settings.WORKERS,
        help=f"工作进程数（默认: {settings.WORKERS}）"
    )
    parser.add_argument(
        "--log-level",
        default=settings.LOG_LEVEL,
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help=f"日志级别（默认: {settings.LOG_LEVEL}）"
    )

    args = parser.parse_args()

    # 配置日志
    logger.add(
        settings.LOG_FILE,
        rotation="10 MB",
        retention="7 days",
        level=args.log_level
    )

    # 打印启动信息
    logger.info("=" * 50)
    logger.info("钢材缺陷检测系统 - 后端服务")
    logger.info("=" * 50)
    logger.info(f"监听地址: {args.host}:{args.port}")
    logger.info(f"热重载: {'启用' if args.reload else '禁用'}")
    logger.info(f"工作进程: {args.workers}")
    logger.info(f"日志级别: {args.log_level}")
    logger.info(f"调试模式: {'启用' if settings.DEBUG else '禁用'}")
    logger.info("=" * 50)

    # 检查模型文件
    if os.path.exists(settings.YOLO_MODEL_PATH):
        logger.info(f"YOLO模型: {settings.YOLO_MODEL_PATH}")
    else:
        logger.warning(f"YOLO模型文件不存在: {settings.YOLO_MODEL_PATH}")

    if os.path.exists(settings.UNET_MODEL_PATH):
        logger.info(f"UNet模型: {settings.UNET_MODEL_PATH}")
    else:
        logger.warning(f"UNet模型文件不存在: {settings.UNET_MODEL_PATH}")

    # 检查讯飞API配置
    if settings.SPARK_API_KEY:
        logger.info("讯飞文本对话API: 已配置")
    else:
        logger.warning("讯飞文本对话API: 未配置")

    if settings.SPARK_IMAGE_APP_ID:
        logger.info("讯飞图片理解API: 已配置")
    else:
        logger.warning("讯飞图片理解API: 未配置")

    logger.info("=" * 50)

    # 启动应用
    try:
        uvicorn.run(
            "main:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            workers=args.workers if not args.reload else 1,
            log_level=args.log_level.lower()
        )
    except KeyboardInterrupt:
        logger.info("服务已停止")
    except Exception as e:
        logger.error(f"服务启动失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
