#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
钢材缺陷检测系统 v2.0 - FastAPI后端
功能：YOLO/UNet 双模检测 · 实时视频流 · 用户认证 · 检测记录
"""

import os
import sys
import json
import time
import re
import base64
import hashlib
import threading
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, status, Request, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse, Response, StreamingResponse
from fastapi.templating import Jinja2Templates
from loguru import logger
from dotenv import load_dotenv
from jose import JWTError, jwt

# 加载环境变量
load_dotenv()

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(__file__))

# 导入配置
from config import settings

# 导入数据库
from database.sqlite_client import DatabaseClient
from database.models import UserModel, LoginRequest, RegisterRequest, Token, UserCreate, UserUpdate

# 导入服务层
ModelService = None
open_camera = None
RecordService = None
SparkImageService = None
SparkLiteService = None

try:
    from services.model_service import ModelService
except ImportError as e:
    logger.warning(f"ModelService导入失败: {e}")

try:
    from services.video_service import open_camera
except ImportError as e:
    logger.warning(f"video_service导入失败: {e}")

try:
    from services.record_service import RecordService
except ImportError as e:
    logger.warning(f"RecordService导入失败: {e}")

try:
    from services.spark_image_service import SparkImageService
except ImportError as e:
    logger.warning(f"SparkImageService导入失败: {e}")

try:
    from services.spark_lite_service import SparkLiteService
except ImportError as e:
    logger.warning(f"SparkLiteService导入失败: {e}")

# ==================== 全局状态 ====================
db_client = None
model_service = None
record_service = None
spark_image_service = None
spark_lite_service = None


def get_db_client():
    """获取数据库客户端（供API路由调用）"""
    return db_client

# 视频流状态
camera_state = {
    "source": None,
    "cap": None,
    "is_running": False,
    "last_frame": None,
    "lock": threading.RLock()
}

# ==================== 捕获数据缓存 ====================
import hashlib

class CapturesCache:
    """捕获目录数据的内存缓存，基于目录文件列表的哈希判断是否需要刷新"""

    def __init__(self, ttl_seconds=5):
        self._data = None          # 缓存的完整数据（batches字典）
        self._file_hash = None     # 目录文件列表的哈希
        self._timestamp = 0        # 缓存时间戳
        self._ttl = ttl_seconds    # 缓存有效期（秒）
        self._lock = threading.Lock()

    def _get_dir_fingerprint(self, capture_dir: str) -> str:
        """获取captures目录的指纹（基于文件名+大小+修改时间）"""
        if not os.path.exists(capture_dir):
            return ""
        entries = []
        for f in os.listdir(capture_dir):
            fp = os.path.join(capture_dir, f)
            if os.path.isfile(fp):
                stat = os.stat(fp)
                entries.append(f"{f}:{stat.st_size}:{stat.st_mtime_ns}")
        entries.sort()
        return hashlib.md5("|".join(entries).encode()).hexdigest()

    def get(self, capture_dir: str):
        """获取缓存数据，如果过期或目录变化则返回None"""
        with self._lock:
            now = time.time()
            # TTL内直接返回缓存（不做任何文件系统检查）
            if self._data is not None and (now - self._timestamp) < self._ttl:
                return self._data
            # TTL过期后，检查目录指纹是否变化
            current_hash = self._get_dir_fingerprint(capture_dir)
            if self._data is not None and current_hash == self._file_hash:
                self._timestamp = now  # 刷新时间戳，延长TTL
                return self._data
            return None

    def set(self, capture_dir: str, data):
        """设置缓存数据"""
        with self._lock:
            self._data = data
            self._file_hash = self._get_dir_fingerprint(capture_dir)
            self._timestamp = time.time()

    def invalidate(self):
        """手动使缓存失效"""
        with self._lock:
            self._data = None
            self._file_hash = None
            self._timestamp = 0

# 全局缓存实例（30秒TTL，新增/删除检测时自动失效）
captures_cache = CapturesCache(ttl_seconds=30)

# 检测参数
detection_params = {
    "mode": "detection",  # detection / segmentation
    "conf_threshold": 0.25,
    "iou_threshold": 0.45,
    "screenshot_interval": 2,
    "red_box_classes": []
}


# ==================== 辅助函数 ====================
def _detect_device():
    """自动检测设备"""
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda:0"
            logger.info(f"[设备] 检测到 CUDA: {torch.cuda.get_device_name(0)}")
            return device
        else:
            logger.info("[设备] 未检测到 CUDA，使用 CPU")
            return "cpu"
    except Exception as e:
        logger.warning(f"[设备] CUDA检测失败，使用 CPU: {e}")
        return "cpu"


def verify_token(token: str) -> Optional[dict]:
    """验证JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user_from_cookie(request: Request) -> Optional[dict]:
    """从cookie或header获取当前用户"""
    # 先从 cookie 读取
    token = request.cookies.get("access_token")
    if not token:
        # 再从 Authorization header 读取
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        return None
    return verify_token(token)


# ==================== 生命周期 ====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_client, model_service, record_service, spark_image_service, spark_lite_service

    logger.info("正在启动钢材缺陷检测系统...")

    try:
        # 初始化SQLite数据库
        logger.info("正在连接数据库...")
        db_client = DatabaseClient()
        await db_client.initialize()
        logger.info("数据库连接成功")

        # 初始化AI模型
        logger.info("正在加载AI模型...")
        device = _detect_device()
        model_path = os.path.join(os.path.dirname(__file__), "models", "best.pt")
        if not os.path.exists(model_path):
            model_path = settings.YOLO_MODEL_PATH
        model_service = ModelService(model_path, device)
        logger.info("AI模型加载完成")

        # 初始化记录服务
        record_path = os.path.join(os.path.dirname(__file__), "records.json")
        capture_dir = os.path.join(os.path.dirname(__file__), "captures")
        record_service = RecordService(record_path, capture_dir)
        logger.info("记录服务初始化完成")

        # 初始化讯飞服务（非关键，失败不影响启动）
        try:
            spark_image_service = SparkImageService()
            spark_lite_service = SparkLiteService()
            logger.info("讯飞服务初始化完成")
        except Exception as e:
            logger.warning(f"讯飞服务初始化失败（非关键）: {e}")

    except Exception as e:
        logger.error(f"系统启动失败: {e}")
        raise  # 关键服务失败时阻止应用启动

    yield

    # 清理
    logger.info("正在关闭系统...")
    with camera_state["lock"]:
        if camera_state["cap"]:
            camera_state["cap"].release()
            camera_state["is_running"] = False
    if db_client:
        await db_client.close()
    logger.info("系统已关闭")


# ==================== 创建应用 ====================
app = FastAPI(
    title="钢材缺陷检测系统",
    description="基于YOLO的实时钢材缺陷检测系统",
    version="2.0.0",
    lifespan=lifespan
)

# GZip压缩（响应>500字节时自动压缩）
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS - 使用配置中的白名单
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# 模板
templates_dir = os.path.join(os.path.dirname(__file__), "templates")
templates = Jinja2Templates(directory=templates_dir)


# ==================== 查询路由 ====================

@app.get("/class_options")
async def class_options():
    """获取模型类别选项"""
    if model_service and hasattr(model_service, 'class_names'):
        names = model_service.class_names
        if isinstance(names, dict):
            return [{"id": k, "name": v} for k, v in names.items()]
        else:
            return [{"id": i, "name": str(n)} for i, n in enumerate(names)]
    return []


@app.get("/red_box_classes")
async def get_red_box_classes():
    """获取当前红框类别"""
    return {"classes": detection_params.get("red_box_classes", [])}


@app.get("/recent_events")
async def recent_events():
    """获取最近的检测事件"""
    events = []
    records_path = os.path.join(os.path.dirname(__file__), "records.json")
    if os.path.exists(records_path):
        try:
            with open(records_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                for line in lines[-100:]:
                    line = line.strip()
                    if line:
                        try:
                            record = json.loads(line)
                            if model_service and hasattr(model_service, 'class_names') and 'class' in record:
                                class_id = record['class']
                                if isinstance(model_service.class_names, dict):
                                    record['class_name'] = model_service.class_names.get(class_id, f'类别{class_id}')
                                else:
                                    record['class_name'] = f'类别{class_id}'
                            events.append(record)
                        except Exception as e:
                            logger.debug(f"解析记录行失败: {e}")
        except Exception as e:
            logger.warning(f"读取records.json失败: {e}")
    events.reverse()
    return events


@app.get("/get_camera_status")
async def get_camera_status():
    """获取摄像头状态"""
    with camera_state["lock"]:
        return {
            "is_running": camera_state["is_running"],
            "camera_source": camera_state.get("source"),
            "mode": detection_params["mode"]
        }


@app.get("/get_detection_params")
async def get_detection_params():
    """获取当前检测参数"""
    return {
        "conf_threshold": detection_params["conf_threshold"],
        "iou_threshold": detection_params["iou_threshold"]
    }


@app.get("/get_screenshot_interval")
async def get_screenshot_interval():
    """获取当前截图间隔"""
    return {"interval": detection_params["screenshot_interval"]}


@app.get("/captures_cache_status")
async def captures_cache_status():
    """缓存状态"""
    return {"status": "ready", "progress": 100, "total_files": 0}


@app.get("/profile", response_class=HTMLResponse)
async def profile_page(request: Request):
    """个人中心页面"""
    user = await get_current_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)

    return templates.TemplateResponse("profile.html", {
        "request": request,
        "user": user
    })


@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    """管理员页面 - 仅管理员可访问"""
    user = await get_current_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    if user.get("user_type") != "admin":
        return RedirectResponse(url="/", status_code=302)

    return templates.TemplateResponse("admin.html", {
        "request": request,
        "user": user
    })


@app.get("/captures/{filename:path}")
async def serve_capture_file(filename: str):
    """提供检测截图文件（安全：防止路径遍历）"""
    capture_dir = os.path.realpath(os.path.join(os.path.dirname(__file__), "captures"))
    file_path = os.path.realpath(os.path.join(capture_dir, filename))
    # 防止路径遍历攻击
    if not file_path.startswith(capture_dir):
        raise HTTPException(status_code=403, detail="禁止访问")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    import mimetypes
    content_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    from fastapi.responses import FileResponse
    return FileResponse(file_path, media_type=content_type)


@app.post("/clear_captures_cache")
async def clear_captures_cache():
    """清除缓存"""
    return {"success": True}


# ==================== 页面路由 ====================

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """登录页面"""
    user = await get_current_user_from_cookie(request)
    if user:
        return RedirectResponse(url="/", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    """主页 - 根据角色跳转"""
    user = await get_current_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)

    # 管理员直接跳转到管理后台
    if user.get("user_type") == "admin":
        return RedirectResponse(url="/admin", status_code=302)

    return templates.TemplateResponse("index.html", {
        "request": request,
        "user": user
    })


@app.get("/captures", response_class=HTMLResponse)
async def captures_page(request: Request):
    """检测记录页面 - 所有已登录用户可访问"""
    user = await get_current_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)

    return templates.TemplateResponse("captures.html", {
        "request": request,
        "user": user
    })


@app.get("/detect", response_class=HTMLResponse)
async def detect_page(request: Request):
    """独立检测页面 - 仅非管理员"""
    user = await get_current_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    if user.get("user_type") == "admin":
        return RedirectResponse(url="/admin", status_code=302)

    return templates.TemplateResponse("detect.html", {
        "request": request,
        "user": user
    })


@app.get("/logout")
async def logout():
    """登出"""
    response = RedirectResponse(url="/login", status_code=302)
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return response


# ==================== 认证API ====================

@app.post("/api/auth/login", response_model=Token)
async def api_login(login_data: LoginRequest):
    """用户登录"""
    try:
        user_model = UserModel(db_client)
        user = await user_model.get_by_username(login_data.username)

        if not user:
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        stored_password = user.get("password", "")
        input_password = hashlib.sha256(login_data.password.encode()).hexdigest()
        if input_password != stored_password:
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="用户已被禁用")

        # 创建token
        from datetime import timedelta
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token_data = {
            "sub": user["username"],
            "user_id": user["id"],
            "user_type": user["user_type"]
        }

        to_encode = access_token_data.copy()
        to_encode["exp"] = datetime.now(timezone.utc) + access_token_expires
        access_token = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

        refresh_to_encode = access_token_data.copy()
        refresh_to_encode["exp"] = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        refresh_to_encode["type"] = "refresh"
        refresh_token = jwt.encode(refresh_to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

        logger.info(f"用户登录成功: {login_data.username}")

        response = JSONResponse(content={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        })
        response.set_cookie("access_token", access_token, httponly=True, max_age=86400)
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"登录失败: {e}")
        raise HTTPException(status_code=500, detail="登录失败")


@app.post("/api/auth/register")
async def api_register(register_data: RegisterRequest):
    """用户注册"""
    try:
        user_model = UserModel(db_client)

        existing = await user_model.get_by_username(register_data.username)
        if existing:
            raise HTTPException(status_code=400, detail="用户名已存在")

        user_data = UserCreate(
            username=register_data.username,
            password=hashlib.sha256(register_data.password.encode()).hexdigest(),
            email=register_data.email,
            phone=register_data.phone,
            company_name=register_data.company_name,
            user_type=register_data.user_type
        )

        user_id = await user_model.create(user_data)
        logger.info(f"用户注册成功: {register_data.username}")

        return {"message": "注册成功", "user_id": user_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"注册失败: {e}")
        raise HTTPException(status_code=500, detail="注册失败")


@app.get("/api/auth/me")
async def api_get_me(request: Request):
    """获取当前用户信息"""
    user = await get_current_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")

    user_model = UserModel(db_client)
    user_data = await user_model.get(user.get("user_id"))
    if not user_data:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 过滤敏感字段
    sensitive_fields = ["password", "password_hash"]
    safe_data = {k: v for k, v in user_data.items() if k not in sensitive_fields}
    return safe_data


@app.post("/api/auth/update_profile")
async def api_update_profile(request: Request):
    """更新用户信息"""
    user = await get_current_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")

    try:
        data = await request.json()
        user_model = UserModel(db_client)
        user_id = user.get("user_id")

        # 构建更新数据
        update_dict = {}
        if "display_name" in data:
            update_dict["display_name"] = data["display_name"]
        if "company" in data:
            update_dict["company"] = data["company"]
        if "email" in data:
            update_dict["email"] = data["email"]
        if "phone" in data:
            update_dict["phone"] = data["phone"]

        if update_dict:
            update_data = UserUpdate(**update_dict)
            await user_model.update(user_id, update_data)
            logger.info(f"用户信息更新: {user.get('username')}")

        return {"message": "更新成功"}

    except Exception as e:
        logger.error(f"更新用户信息失败: {e}")
        raise HTTPException(status_code=500, detail="更新失败")


@app.post("/api/auth/change_password")
async def api_change_password(request: Request):
    """修改密码"""
    user = await get_current_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")

    try:
        data = await request.json()
        old_password = data.get("old_password", "")
        new_password = data.get("new_password", "")

        if not old_password or not new_password:
            raise HTTPException(status_code=400, detail="请填写完整")

        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="新密码至少6位")

        user_model = UserModel(db_client)
        user_data = await user_model.get(user.get("user_id"))

        # 验证旧密码
        old_hash = hashlib.sha256(old_password.encode()).hexdigest()
        if user_data.get("password") != old_hash:
            raise HTTPException(status_code=400, detail="原密码错误")

        # 更新密码
        new_hash = hashlib.sha256(new_password.encode()).hexdigest()
        await user_model.update(user.get("user_id"), {"password": new_hash})

        logger.info(f"密码修改成功: {user.get('username')}")
        return {"message": "密码修改成功"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"修改密码失败: {e}")
        raise HTTPException(status_code=500, detail="修改失败")


# ==================== 兼容路由（原 app.js / captures.js 调用） ====================

@app.get("/api/status")
async def api_status():
    """系统状态"""
    with camera_state["lock"]:
        camera_open = camera_state["is_running"]

    return {
        "camera_open": camera_open,
        "mode": detection_params["mode"],
        "model_loaded": model_service is not None and model_service.model is not None,
        "device": getattr(model_service, 'device', 'cpu') if model_service else 'cpu',
        "conf_threshold": detection_params["conf_threshold"],
        "iou_threshold": detection_params["iou_threshold"]
    }


@app.get("/model_status")
async def model_status():
    """模型状态"""
    if not model_service:
        return {"loaded": False, "model_type": None, "device": "cpu", "class_count": 0}

    return {
        "loaded": model_service.model is not None,
        "model_type": getattr(model_service, 'model_type', 'YOLO'),
        "device": getattr(model_service, 'device', 'cpu'),
        "class_count": len(getattr(model_service, 'class_names', [])),
        "class_names": getattr(model_service, 'class_names', [])
    }


@app.post("/set_mode")
async def set_mode(request: Request):
    """设置检测模式"""
    data = await request.json()
    mode = data.get("mode", "detection")
    detection_params["mode"] = mode
    logger.info(f"检测模式切换为: {mode}")
    return {"success": True, "mode": mode}


@app.post("/set_conf_threshold")
async def set_conf_threshold(request: Request):
    """设置置信度阈值"""
    data = await request.json()
    threshold = float(data.get("threshold", 0.25))
    detection_params["conf_threshold"] = threshold
    return {"success": True, "threshold": threshold}


@app.post("/set_iou_threshold")
async def set_iou_threshold(request: Request):
    """设置IOU阈值"""
    data = await request.json()
    threshold = float(data.get("threshold", 0.45))
    detection_params["iou_threshold"] = threshold
    return {"success": True, "threshold": threshold}


@app.post("/set_model_weights")
async def set_model_weights(request: Request):
    """切换模型（安全：限制模型路径在models/目录下）"""
    data = await request.json()
    model_path = data.get("model_path", "")
    if model_service and model_path:
        # 安全：限制模型路径必须在models目录下
        models_dir = os.path.realpath(os.path.join(os.path.dirname(__file__), "models"))
        real_model_path = os.path.realpath(model_path)
        if not real_model_path.startswith(models_dir):
            return {"success": False, "error": "模型路径必须在models目录下"}
        if not real_model_path.endswith(('.pt', '.pth', '.onnx')):
            return {"success": False, "error": "不支持的模型格式"}
        try:
            model_service.load_model(real_model_path)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    return {"success": False, "error": "模型服务未就绪"}


@app.post("/set_camera")
async def set_camera(request: Request):
    """开启摄像头"""
    data = await request.json()
    source = data.get("source", 0)

    with camera_state["lock"]:
        if camera_state["is_running"]:
            return {"success": False, "error": "摄像头已在运行"}

        try:
            cap = open_camera(source)
            camera_state["source"] = source
            camera_state["cap"] = cap
            camera_state["is_running"] = True

            # 启动帧捕获线程
            def capture_frames():
                import cv2
                while camera_state["is_running"]:
                    ret, frame = cap.read()
                    if ret:
                        camera_state["last_frame"] = frame
                    time.sleep(0.03)

            thread = threading.Thread(target=capture_frames, daemon=True)
            thread.start()

            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}


@app.post("/stop_camera")
async def stop_camera():
    """关闭摄像头"""
    with camera_state["lock"]:
        if camera_state["cap"]:
            camera_state["cap"].release()
        camera_state["cap"] = None
        camera_state["is_running"] = False
        camera_state["last_frame"] = None
    return {"success": True}


@app.post("/set_red_box_classes")
async def set_red_box_classes(request: Request):
    """设置红框类别"""
    data = await request.json()
    detection_params["red_box_classes"] = data.get("classes", [])
    return {"success": True}


@app.post("/set_screenshot_interval")
async def set_screenshot_interval(request: Request):
    """设置截图间隔（POST）"""
    data = await request.json()
    interval = int(data.get("interval", 2))
    detection_params["screenshot_interval"] = interval
    return {"success": True, "interval": interval}


def generate_frames():
    """生成视频帧"""
    import cv2
    while camera_state["is_running"]:
        if camera_state["last_frame"] is not None:
            ret, buffer = cv2.imencode('.jpg', camera_state["last_frame"], [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        time.sleep(0.03)


@app.get("/video_feed")
async def video_feed():
    """视频流端点"""
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


def draw_detections(frame, detections):
    """在帧上绘制检测结果"""
    import cv2
    annotated = frame.copy()

    for det in detections:
        x1, y1, x2, y2 = det['bbox']
        conf = det['confidence']
        cls_id = det.get('class_id', 0)

        if cls_id in detection_params.get("red_box_classes", []):
            color = (0, 0, 255)
        else:
            color = (0, 255, 0)

        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

        label = f"{det.get('class_name', 'defect')} {conf:.2f}"
        font_scale = 0.5
        thickness = 2
        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)

        tx = x1 + 5
        ty = y1 + th + 5
        if tx + tw > x2:
            tx = x2 - tw - 5
        if y1 < th + 10:
            ty = y1 + th + 10
        if ty > y2:
            ty = y2 - 5

        bg_x1 = max(0, tx - 2)
        bg_y1 = max(0, ty - th - 2)
        bg_x2 = min(annotated.shape[1], tx + tw + 2)
        bg_y2 = min(annotated.shape[0], ty + 2)
        cv2.rectangle(annotated, (bg_x1, bg_y1), (bg_x2, bg_y2), color, -1)
        cv2.putText(annotated, label, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)

    return annotated


def generate_heatmap(frame, detections):
    """生成热力图"""
    import cv2
    import numpy as np

    heatmap = np.zeros_like(frame, dtype=np.uint8)

    for det in detections:
        x1, y1, x2, y2 = det['bbox']
        conf = det['confidence']
        red_intensity = int(255 * conf)
        green_intensity = int(255 * (1 - conf))
        color = (0, green_intensity, red_intensity)

        overlay = heatmap.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
        alpha = 0.4 + (conf * 0.3)
        cv2.addWeighted(overlay, alpha, heatmap, 1 - alpha, 0, heatmap)

    if detections:
        return cv2.addWeighted(frame, 0.6, heatmap, 0.4, 0)
    return frame.copy()


@app.post("/detect_image")
async def detect_image(file: UploadFile = File(...)):
    """图片检测"""
    if not model_service or not model_service.model:
        return JSONResponse({"success": False, "error": "模型未加载"}, status_code=500)

    try:
        import cv2
        import numpy as np

        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return JSONResponse({"success": False, "error": "无法解码图片"}, status_code=400)

        # 执行推理
        results = model_service.predict(
            frame,
            conf=detection_params["conf_threshold"],
            imgsz=640,
            iou=detection_params["iou_threshold"]
        )

        # 处理检测结果
        detections = []
        if hasattr(results, 'boxes') and results.boxes is not None:
            boxes = results.boxes.xyxy.cpu().numpy()
            confs = results.boxes.conf.cpu().numpy()
            classes = results.boxes.cls.cpu().numpy().astype(int)

            for box, conf, cls_id in zip(boxes, confs, classes):
                x1, y1, x2, y2 = map(int, box[:4])
                detections.append({
                    'bbox': [x1, y1, x2, y2],
                    'confidence': float(conf),
                    'class_id': int(cls_id),
                    'class_name': model_service.class_names.get(cls_id, f'class_{cls_id}')
                })

        # 绘制检测结果
        annotated_frame = draw_detections(frame, detections)

        # 生成热力图
        heatmap = generate_heatmap(frame, detections)

        # 保存图片组
        batch_id = None
        if record_service:
            batch_id = record_service.save_image_group(
                frame_original=frame,
                frame_annotated=annotated_frame,
                frame_heatmap=heatmap,
                label="image",
                detections=detections,
                conf_threshold=detection_params["conf_threshold"],
                iou_threshold=detection_params["iou_threshold"],
                source_type='image'
            )
            # 新检测保存后使缓存失效
            captures_cache.invalidate()

        # 转换为 base64
        _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        img_base64 = base64.b64encode(buffer).decode('utf-8')

        _, orig_buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        orig_base64 = base64.b64encode(orig_buffer).decode('utf-8')

        _, heatmap_buffer = cv2.imencode('.jpg', heatmap, [cv2.IMWRITE_JPEG_QUALITY, 85])
        heatmap_base64 = base64.b64encode(heatmap_buffer).decode('utf-8')

        return {
            "success": True,
            "image_base64": img_base64,
            "original_image_base64": orig_base64,
            "heatmap_base64": heatmap_base64,
            "detections": detections,
            "model_type": model_service.model_type,
            "image_size": [int(frame.shape[1]), int(frame.shape[0])],
            "batch_id": batch_id
        }

    except Exception as e:
        logger.error(f"检测失败: {e}")
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


def _scan_captures_directory(capture_dir: str) -> dict:
    """扫描captures目录，返回批次数据和日期范围（供缓存使用）"""
    import glob

    if not os.path.exists(capture_dir):
        return {"batches": {}, "min_time": None, "max_time": None}

    capture_files = glob.glob(os.path.join(capture_dir, '*.jpg')) + \
                    glob.glob(os.path.join(capture_dir, '*.json'))

    batches = {}
    min_time = None
    max_time = None

    for img_path in capture_files:
        filename = os.path.basename(img_path)
        mtime = os.path.getmtime(img_path)

        # 匹配 image_batch 格式
        image_match = re.match(r'(image_batch)_(\d{8}_\d{6}_\d+?)_(.+)', filename)
        if image_match:
            timestamp_part = image_match.group(2)
            image_type = image_match.group(3).replace('.jpg', '').replace('.json', '')
            batch_id = f"image_batch_{timestamp_part}"
            timestamp_str = timestamp_part

            try:
                parts = timestamp_str.split('_')
                if len(parts) >= 2:
                    date_str, time_str = parts[0], parts[1]
                    file_time = time.mktime((int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]),
                                                  int(time_str[:2]), int(time_str[2:4]), int(time_str[4:6]), 0, 0, -1))
                    if min_time is None or file_time < min_time: min_time = file_time
                    if max_time is None or file_time > max_time: max_time = file_time
            except:
                if min_time is None or mtime < min_time: min_time = mtime
                if max_time is None or mtime > max_time: max_time = mtime

            if batch_id not in batches:
                batches[batch_id] = {'batch_id': batch_id, 'source_type': 'image', 'timestamp': timestamp_str,
                                     'mtime': mtime, 'images': {}, 'crops': [], 'defects': [], 'detection_params': {}}

            if image_type == 'original':
                batches[batch_id]['images']['original'] = filename
            elif image_type == 'annotated':
                batches[batch_id]['images']['annotated'] = filename
            elif image_type == 'heatmap':
                batches[batch_id]['images']['heatmap'] = filename
            elif image_type.startswith('crop_'):
                crop_parts = image_type.split('_', 2)
                if len(crop_parts) >= 3:
                    batches[batch_id]['crops'].append({'filename': filename, 'index': int(crop_parts[1]), 'class_name': crop_parts[2]})
            elif image_type == 'info':
                try:
                    with open(os.path.join(capture_dir, filename), 'r', encoding='utf-8') as f:
                        info_data = json.load(f)
                        batches[batch_id]['defects'] = info_data.get('defects', [])
                        batches[batch_id]['detection_params'] = info_data.get('detection_params', {})
                except Exception as e:
                    logger.debug(f"解析info文件失败: {e}")
            continue

        # 匹配旧格式 batch_*_*_*.jpg
        old_match = re.match(r'batch_(\d{8}_\d{6}_\d+?)_(.+)', filename)
        if old_match:
            timestamp_part = old_match.group(1)
            image_type = old_match.group(2).replace('.jpg', '').replace('.json', '')
            batch_id = f"batch_{timestamp_part}"
            timestamp_str = timestamp_part
        else:
            continue

        try:
            parts = timestamp_str.split('_')
            if len(parts) >= 2:
                date_str, time_str = parts[0], parts[1]
                import time as time_mod
                file_time = time_mod.mktime((int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]),
                                              int(time_str[:2]), int(time_str[2:4]), int(time_str[4:6]), 0, 0, -1))
                if min_time is None or file_time < min_time: min_time = file_time
                if max_time is None or file_time > max_time: max_time = file_time
        except:
            if min_time is None or mtime < min_time: min_time = mtime
            if max_time is None or mtime > max_time: max_time = mtime

        if batch_id not in batches:
            batches[batch_id] = {'batch_id': batch_id, 'source_type': 'legacy', 'timestamp': timestamp_str,
                                 'mtime': mtime, 'images': {}, 'crops': [], 'defects': [], 'detection_params': {}}

        if image_type == 'original':
            batches[batch_id]['images']['original'] = filename
        elif image_type == 'annotated':
            batches[batch_id]['images']['annotated'] = filename
        elif image_type == 'heatmap':
            batches[batch_id]['images']['heatmap'] = filename
        elif image_type.startswith('crop_'):
            crop_parts = image_type.split('_', 2)
            if len(crop_parts) >= 3:
                batches[batch_id]['crops'].append({'filename': filename, 'index': int(crop_parts[1]), 'class_name': crop_parts[2]})
        elif image_type == 'info':
            try:
                with open(os.path.join(capture_dir, filename), 'r', encoding='utf-8') as f:
                    info_data = json.load(f)
                    batches[batch_id]['defects'] = info_data.get('defects', [])
            except Exception as e:
                logger.debug(f"解析info文件失败: {e}")

    return {"batches": batches, "min_time": min_time, "max_time": max_time}


def _get_cached_batches(capture_dir: str) -> tuple:
    """获取缓存的批次数据，返回 (sorted_result, min_time, max_time)"""
    cached = captures_cache.get(capture_dir)
    if cached is None:
        raw = _scan_captures_directory(capture_dir)
        batches = raw["batches"]

        # 添加缩略图和图片计数
        result = sorted(batches.values(), key=lambda x: x['mtime'], reverse=True)
        for batch in result:
            if 'annotated' in batch.get('images', {}):
                batch['thumbnail'] = batch['images']['annotated']
            elif 'heatmap' in batch.get('images', {}):
                batch['thumbnail'] = batch['images']['heatmap']
            elif 'original' in batch.get('images', {}):
                batch['thumbnail'] = batch['images']['original']
            elif batch.get('crops'):
                batch['thumbnail'] = batch['crops'][0].get('filename', '')
            else:
                batch['thumbnail'] = ''
            batch['image_count'] = len(batch.get('images', {})) + len(batch.get('crops', []))

        cached = {"result": result, "min_time": raw["min_time"], "max_time": raw["max_time"]}
        captures_cache.set(capture_dir, cached)

    return cached["result"], cached["min_time"], cached["max_time"]


@app.get("/captures_data")
async def captures_data(
    page: int = Query(1, ge=1),
    per_page: int = Query(12, ge=1, le=100),
    defect_class: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    filter_type: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    cls: Optional[str] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None)
):
    """获取检测记录数据 - 使用内存缓存，毫秒级响应"""
    capture_dir = os.path.join(os.path.dirname(__file__), "captures")
    result, min_time, max_time = _get_cached_batches(capture_dir)
    # 返回全量数据（前端需要全量数据用于筛选和分页）
    return {"data": result, "date_range": {"min": min_time, "max": max_time}, "cached": True}


@app.get("/api/captures/all_stats")
async def captures_all_stats():
    """获取所有统计数据（合并端点，减少前端请求次数）"""
    try:
        from datetime import datetime, timedelta
        capture_dir = os.path.join(os.path.dirname(__file__), "captures")
        batches, _, _ = _get_cached_batches(capture_dir)

        # 1. 缺陷统计
        defects = {}
        total_defects = 0
        for batch in batches:
            for defect in batch.get('defects', []):
                cls_name = defect.get('class_name', '未知')
                defects[cls_name] = defects.get(cls_name, 0) + 1
                total_defects += 1

        # 2. 最近7天统计
        today = datetime.now()
        daily_stats = {}
        for i in range(7):
            d = today - timedelta(days=i)
            daily_stats[d.strftime('%Y-%m-%d')] = {'total': 0, 'defect': 0}
        for batch in batches:
            ts = batch.get('timestamp', '')
            if ts and len(ts) >= 8:
                if 'T' in ts:
                    try: date_str = ts[:10]
                    except: continue
                else:
                    ymd = ts[:8]
                    date_str = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}"
                if date_str in daily_stats:
                    daily_stats[date_str]['total'] += 1
                    if batch.get('defects') and len(batch['defects']) > 0:
                        daily_stats[date_str]['defect'] += 1

        # 3. 损伤占比
        damage = {}
        for batch in batches:
            for defect in batch.get('defects', []):
                cls_name = defect.get('class_name', '未知')
                bbox = defect.get('bbox', [0, 0, 0, 0])
                if len(bbox) == 4:
                    defect_area = max(0, (bbox[2] - bbox[0])) * max(0, (bbox[3] - bbox[1]))
                else:
                    defect_area = 0
                image_area = 640 * 480
                area_ratio = (defect_area / image_area) * 100 if image_area > 0 else 0
                if cls_name not in damage:
                    damage[cls_name] = {'total_area_ratio': 0.0, 'count': 0}
                damage[cls_name]['total_area_ratio'] += area_ratio
                damage[cls_name]['count'] += 1
        damage_ratio_result = {}
        for name, stats in damage.items():
            if stats['count'] > 0:
                damage_ratio_result[name] = {
                    'avg_area_ratio': round(stats['total_area_ratio'] / stats['count'], 2),
                    'total_count': stats['count']
                }

        # 4. 置信度分布
        bins = [
            {'range': '0-20%', 'min': 0, 'max': 0.2, 'count': 0},
            {'range': '20-40%', 'min': 0.2, 'max': 0.4, 'count': 0},
            {'range': '40-60%', 'min': 0.4, 'max': 0.6, 'count': 0},
            {'range': '60-80%', 'min': 0.6, 'max': 0.8, 'count': 0},
            {'range': '80-100%', 'min': 0.8, 'max': 1.01, 'count': 0},
        ]
        total_events = 0
        for batch in batches:
            for defect in batch.get('defects', []):
                conf = defect.get('confidence', 0)
                total_events += 1
                for b in bins:
                    if b['min'] <= conf < b['max']:
                        b['count'] += 1
                        break
        distribution = []
        for b in bins:
            pct = round(b['count'] / total_events * 100, 1) if total_events > 0 else 0
            distribution.append({'range': b['range'], 'count': b['count'], 'percentage': pct})

        return {
            "success": True,
            "data": {
                "defects": defects,
                "total_records": len(batches),
                "total_defects": total_defects,
                "daily_stats": daily_stats,
                "damage_ratio": damage_ratio_result,
                "distribution": distribution,
                "total_events": total_events,
            }
        }
    except Exception as e:
        return {"success": False, "data": {}}


@app.get("/api/captures/stats")
async def captures_stats():
    """缺陷统计 - 使用缓存数据"""
    try:
        capture_dir = os.path.join(os.path.dirname(__file__), "captures")
        batches, _, _ = _get_cached_batches(capture_dir)
        defects = {}
        total_defects = 0
        for batch in batches:
            for defect in batch.get('defects', []):
                cls_name = defect.get('class_name', '未知')
                defects[cls_name] = defects.get(cls_name, 0) + 1
                total_defects += 1
        return {"success": True, "data": {
            'total_records': len(batches),
            'total_defects': total_defects,
            'defects': defects
        }}
    except Exception as e:
        return {"success": False, "data": {}}


@app.get("/api/captures/recent_stats")
async def recent_stats():
    """近期统计 - 使用缓存数据"""
    try:
        from datetime import datetime, timedelta
        capture_dir = os.path.join(os.path.dirname(__file__), "captures")
        batches, _, _ = _get_cached_batches(capture_dir)
        today = datetime.now()
        daily_stats = {}
        for i in range(7):
            d = today - timedelta(days=i)
            date_str = d.strftime('%Y-%m-%d')
            daily_stats[date_str] = {'total': 0, 'defect': 0}
        for batch in batches:
            ts = batch.get('timestamp', '')
            if ts and len(ts) >= 8:
                # timestamp 格式: YYYYMMDD_HHMMSS_fff 或 ISO 格式
                if 'T' in ts:
                    try:
                        date_str = ts[:10]
                    except:
                        continue
                else:
                    ymd = ts[:8]
                    date_str = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}"
                if date_str in daily_stats:
                    daily_stats[date_str]['total'] += 1
                    if batch.get('defects') and len(batch['defects']) > 0:
                        daily_stats[date_str]['defect'] += 1
        return {"success": True, "data": {'daily_stats': daily_stats}}
    except Exception as e:
        return {"success": False, "data": {}}


@app.get("/api/captures/damage_ratio")
async def damage_ratio():
    """损伤占比 - 使用缓存数据（不再每次打开图片文件）"""
    try:
        capture_dir = os.path.join(os.path.dirname(__file__), "captures")
        batches, _, _ = _get_cached_batches(capture_dir)
        damage = {}
        for batch in batches:
            for defect in batch.get('defects', []):
                cls_name = defect.get('class_name', '未知')
                bbox = defect.get('bbox', [0, 0, 0, 0])
                if len(bbox) == 4:
                    defect_area = max(0, (bbox[2] - bbox[0])) * max(0, (bbox[3] - bbox[1]))
                else:
                    defect_area = 0
                # 使用默认图片尺寸估算（避免打开文件）
                # 钢材检测典型尺寸 640x480
                image_area = 640 * 480
                area_ratio = (defect_area / image_area) * 100 if image_area > 0 else 0
                if cls_name not in damage:
                    damage[cls_name] = {'total_area_ratio': 0.0, 'count': 0}
                damage[cls_name]['total_area_ratio'] += area_ratio
                damage[cls_name]['count'] += 1
        damage_ratio_result = {}
        for name, stats in damage.items():
            if stats['count'] > 0:
                avg_ratio = stats['total_area_ratio'] / stats['count']
                damage_ratio_result[name] = {
                    'avg_area_ratio': round(avg_ratio, 2),
                    'total_count': stats['count']
                }
        return {"success": True, "data": {'damage_ratio': damage_ratio_result}}
    except Exception as e:
        return {"success": False, "data": {}}


@app.get("/api/captures/confidence_distribution")
async def confidence_distribution():
    """置信度分布 - 使用缓存数据"""
    try:
        capture_dir = os.path.join(os.path.dirname(__file__), "captures")
        batches, _, _ = _get_cached_batches(capture_dir)
        bins = [
            {'range': '0-20%', 'min': 0, 'max': 0.2, 'count': 0},
            {'range': '20-40%', 'min': 0.2, 'max': 0.4, 'count': 0},
            {'range': '40-60%', 'min': 0.4, 'max': 0.6, 'count': 0},
            {'range': '60-80%', 'min': 0.6, 'max': 0.8, 'count': 0},
            {'range': '80-100%', 'min': 0.8, 'max': 1.01, 'count': 0},
        ]
        total = 0
        for batch in batches:
            for defect in batch.get('defects', []):
                conf = defect.get('confidence', 0)
                total += 1
                for b in bins:
                    if b['min'] <= conf < b['max']:
                        b['count'] += 1
                        break
        distribution = []
        for b in bins:
            pct = round(b['count'] / total * 100, 1) if total > 0 else 0
            distribution.append({'range': b['range'], 'count': b['count'], 'percentage': pct})
        return {"success": True, "data": {'distribution': distribution, 'total_defects': total}}
    except Exception as e:
        return {"success": False, "data": {}}


@app.get("/batch_detail/{batch_id}")
async def batch_detail(batch_id: str):
    """获取单个批次的详细信息"""
    # re already imported at top level

    capture_dir = os.path.join(os.path.dirname(__file__), "captures")
    if not os.path.exists(capture_dir):
        return {"batch_id": batch_id, "images": {}, "crops": []}

    batch_info = {'batch_id': batch_id, 'images': {}, 'crops': [], 'defects': [], 'detection_params': {}}

    for filename in os.listdir(capture_dir):
        if not filename.endswith('.jpg') and not filename.endswith('.json'):
            continue

        # 检查文件是否属于这个批次
        if filename.startswith(batch_id + '_'):
            image_type = filename[len(batch_id)+1:].replace('.jpg', '').replace('.json', '')
        else:
            # 尝试匹配 image_batch 格式
            image_match = re.match(r'(image_batch)_(\d{8}_\d{6}_\d+?)_(.+)', filename)
            if image_match:
                timestamp = image_match.group(2)
                image_type = image_match.group(3).replace('.jpg', '').replace('.json', '')
                expected_batch_id = f"image_batch_{timestamp}"
                if expected_batch_id != batch_id:
                    continue
            else:
                continue

        if filename.endswith('.json'):
            try:
                with open(os.path.join(capture_dir, filename), 'r', encoding='utf-8') as f:
                    info_data = json.load(f)
                    batch_info['defects'] = info_data.get('defects', [])
                    batch_info['detection_params'] = info_data.get('detection_params', {})
            except Exception as e:
                logger.debug(f"解析info文件失败: {e}")
        elif image_type == 'original':
            batch_info['images']['original'] = filename
        elif image_type == 'annotated':
            batch_info['images']['annotated'] = filename
        elif image_type == 'heatmap':
            batch_info['images']['heatmap'] = filename
        elif image_type.startswith('crop_'):
            crop_parts = image_type.split('_', 2)
            if len(crop_parts) >= 3:
                batch_info['crops'].append({'filename': filename, 'index': int(crop_parts[1]), 'class_name': crop_parts[2]})

    return batch_info


@app.post("/analyze_with_llm")
async def analyze_with_llm(request: Request):
    """AI图片分析（讯飞星火图片理解）"""
    if not spark_image_service:
        return {"success": False, "error": "AI分析服务未配置，请在 backend/.env 中配置 SPARK_IMAGE_APP_ID、SPARK_IMAGE_API_KEY、SPARK_IMAGE_API_SECRET"}
    try:
        data = await request.json()
        image_base64 = data.get("image_base64", "") or data.get("image", "")
        detections = data.get("detections", [])
        prompt = data.get("prompt", "请分析这张钢材检测图片中的缺陷情况，给出专业的质量评估和改进建议。")
        result = spark_image_service.analyze_image(
            image_base64=image_base64,
            prompt=prompt,
            detections=detections
        )
        # analyze_image 返回 {"success": True/False, "analysis": "文本", ...}
        if isinstance(result, dict):
            if not result.get("success", False):
                return {"success": False, "error": result.get("error", "AI分析失败")}
            analysis_text = result.get("analysis", "")
        else:
            analysis_text = str(result)
        return {"success": True, "analysis": analysis_text}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/analyze_defect_data")
async def analyze_defect_data(request: Request):
    """缺陷数据分析（讯飞星火Lite文本对话）"""
    if not spark_lite_service:
        return {"success": False, "error": "AI分析服务未配置，请在 backend/.env 中配置 SPARK_LITE_APP_ID、SPARK_LITE_API_KEY、SPARK_LITE_API_SECRET"}
    try:
        data = await request.json()
        defect_stats = data.get("defect_stats", {})
        daily_stats = data.get("daily_stats", {})
        damage_ratio = data.get("damage_ratio", None)
        confidence_distribution = data.get("confidence_distribution", None)
        total_defects = data.get("total_defects", 0)
        result = spark_lite_service.analyze_defect_data(
            defect_stats=defect_stats,
            daily_stats=daily_stats,
            damage_ratio=damage_ratio,
            confidence_distribution=confidence_distribution,
            total_defects=total_defects
        )
        # analyze_defect_data 返回 {"success": True/False, "analysis": "文本", ...}
        if isinstance(result, dict):
            if not result.get("success", False):
                return {"success": False, "error": result.get("error", "AI分析失败")}
            analysis_text = result.get("analysis", "")
        else:
            analysis_text = str(result)
        return {"success": True, "analysis": analysis_text}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.delete("/delete_capture/{filename}")
async def delete_capture(filename: str):
    """删除检测记录（安全：防止路径遍历）"""
    # 防止路径遍历
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="无效的文件名")
    if not record_service:
        return {"success": False, "error": "记录服务未就绪"}
    try:
        record_service.delete_capture(filename)
        captures_cache.invalidate()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/batch_delete_captures")
async def batch_delete_captures(request: Request):
    """批量删除（安全：防止路径遍历）"""
    if not record_service:
        return {"success": False, "error": "记录服务未就绪"}
    try:
        data = await request.json()
        filenames = data.get("filenames", [])
        # 验证每个文件名
        for fn in filenames:
            if ".." in fn or "/" in fn or "\\" in fn:
                raise HTTPException(status_code=400, detail=f"无效的文件名: {fn}")
        record_service.batch_delete(filenames)
        captures_cache.invalidate()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/download_records")
async def download_records():
    """下载记录"""
    if not record_service:
        return JSONResponse({"success": False, "error": "记录服务未就绪"})
    try:
        records = record_service.get_all_records_json()
        return Response(
            content=records,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=records.json"}
        )
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)})


# ==================== 管理员API ====================

@app.get("/api/admin/users")
async def admin_get_users(request: Request):
    """管理员获取所有用户"""
    user = await get_current_user_from_cookie(request)
    if not user or user.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="权限不足")

    user_model = UserModel(db_client)
    users = await user_model.list()
    return {"users": users}


@app.get("/api/admin/statistics")
async def admin_statistics(request: Request):
    """管理员统计"""
    user = await get_current_user_from_cookie(request)
    if not user or user.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="权限不足")

    user_model = UserModel(db_client)
    user_stats = await db_client.get_user_statistics()
    detection_stats = await db_client.get_detection_statistics() if db_client else {}

    return {
        "user_stats": user_stats,
        "detection_stats": detection_stats
    }


@app.get("/api/admin/detection_records")
async def admin_detection_records(request: Request):
    """管理员获取所有检测记录（带用户信息）"""
    user = await get_current_user_from_cookie(request)
    if not user or user.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="权限不足")

    try:
        # 获取所有用户信息
        user_model = UserModel(db_client)
        users = await user_model.list()
        user_map = {u.get("id"): u for u in users}

        # 从captures目录获取记录
        import glob
        capture_dir = os.path.join(os.path.dirname(__file__), "captures")
        records = []

        if os.path.exists(capture_dir):
            # 扫描所有批次信息文件
            for info_file in glob.glob(os.path.join(capture_dir, '*_info.json')):
                try:
                    with open(info_file, 'r', encoding='utf-8') as f:
                        info_data = json.load(f)
                    batch_id = info_data.get('batch_id', '')
                    user_id = info_data.get('user_id', '')
                    user_info = user_map.get(user_id, {})

                    # 查找对应的图片文件
                    original_files = glob.glob(os.path.join(capture_dir, f'{batch_id}_original.*'))
                    annotated_files = glob.glob(os.path.join(capture_dir, f'{batch_id}_annotated.*'))

                    # 确定缩略图：优先 annotated > original
                    thumbnail = ''
                    if annotated_files:
                        thumbnail = os.path.basename(annotated_files[0])
                    elif original_files:
                        thumbnail = os.path.basename(original_files[0])

                    # 确定来源类型
                    if batch_id.startswith('image_batch_'):
                        source_type = 'image'
                    elif 'ip_camera' in batch_id:
                        source_type = 'ip_camera'
                    elif 'camera' in batch_id:
                        source_type = 'local_camera'
                    else:
                        source_type = 'legacy'

                    records.append({
                        'batch_id': batch_id,
                        'user_id': user_id,
                        'username': user_info.get('username', '未知用户'),
                        'display_name': user_info.get('display_name', user_info.get('username', '未知用户')),
                        'user_type': user_info.get('user_type', 'personal'),
                        'company': user_info.get('company', ''),
                        'defects': info_data.get('defects', []),
                        'detection_params': info_data.get('detection_params', {}),
                        'timestamp': info_data.get('timestamp', ''),
                        'has_original': len(original_files) > 0,
                        'has_annotated': len(annotated_files) > 0,
                        'thumbnail': thumbnail,
                        'source_type': source_type
                    })
                except Exception as e:
                    logger.debug(f"解析info文件失败: {e}")

        # 按时间倒序排列
        records.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        return {"records": records, "total": len(records)}

    except Exception as e:
        logger.error(f"获取检测记录失败: {e}")
        raise HTTPException(status_code=500, detail="获取记录失败")


# ==================== 前端缺失API补充 ====================

@app.get("/api/records/")
async def api_get_records(request: Request, limit: int = 50, offset: int = 0):
    """获取当前用户的检测记录列表"""
    user = await get_current_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")

    try:
        if user.get("user_type") == "admin":
            records = await db_client.get_all_detection_records(limit=limit, offset=offset)
        else:
            records = await db_client.get_user_detection_records(
                user_id=user.get("user_id", ""), limit=limit, offset=offset
            )
        return records
    except Exception as e:
        logger.error(f"获取记录列表失败: {e}")
        return []


@app.get("/api/records/statistics/summary")
async def api_records_statistics_summary(request: Request):
    """获取当前用户的检测统计摘要"""
    user = await get_current_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail="未登录")

    try:
        if user.get("user_type") == "admin":
            stats = await db_client.get_detection_statistics()
        else:
            stats = await db_client.get_detection_statistics(user_id=user.get("user_id", ""))
        return stats
    except Exception as e:
        logger.error(f"获取统计摘要失败: {e}")
        return {
            "total_records": 0,
            "total_defects": 0,
            "source_stats": {},
            "date_stats": {},
            "avg_defects_per_record": 0
        }


@app.get("/api/admin/dashboard")
async def api_admin_dashboard(request: Request):
    """管理员看板数据"""
    user = await get_current_user_from_cookie(request)
    if not user or user.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="权限不足")

    try:
        user_stats = await db_client.get_user_statistics()
        detection_stats = await db_client.get_detection_statistics()

        return {
            "total_users": user_stats.get("total_users", 0),
            "total_records": detection_stats.get("total_records", 0),
            "total_defects": detection_stats.get("total_defects", 0),
            "avg_defects_per_record": detection_stats.get("avg_defects_per_record", 0),
            "user_type_stats": user_stats.get("type_stats", {}),
            "source_stats": detection_stats.get("source_stats", {}),
            "date_stats": detection_stats.get("date_stats", {})
        }
    except Exception as e:
        logger.error(f"获取管理员看板数据失败: {e}")
        return {
            "total_users": 0,
            "total_records": 0,
            "total_defects": 0,
            "avg_defects_per_record": 0,
            "user_type_stats": {},
            "source_stats": {},
            "date_stats": {}
        }


# ==================== 健康检查 ====================

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "2.0.0"}


# ==================== 启动 ====================
if __name__ == "__main__":
    import uvicorn
    logger.add("logs/app.log", rotation="10 MB", retention="7 days", level="INFO")
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
