#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
认证API - 用户登录、注册、令牌管理
"""

from datetime import datetime, timedelta
from typing import Optional
import hashlib
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from loguru import logger

from config import settings
from database.models import (
    Token, TokenData, LoginRequest, RegisterRequest,
    UserCreate, UserResponse, UserModel
)
from database.sqlite_client import DatabaseClient

router = APIRouter()

# OAuth2密码Bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password


def get_password_hash(password: str) -> str:
    """获取密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """创建刷新令牌"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    """获取当前用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        user_id: str = payload.get("user_id")
        user_type: str = payload.get("user_type")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username, user_id=user_id, user_type=user_type)
    except JWTError:
        raise credentials_exception

    return token_data


async def get_current_active_user(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """获取当前活跃用户"""
    # 这里可以添加用户是否被禁用的检查
    return current_user


async def get_admin_user(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """获取管理员用户"""
    if current_user.user_type != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，需要管理员权限"
        )
    return current_user


@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest):
    """用户登录"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        user_model = UserModel(db_client)

        # 查找用户
        user = await user_model.get_by_username(login_data.username)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误"
            )

        # 验证密码（这里需要存储密码哈希）
        # 临时方案：使用明文密码比较（生产环境应使用哈希）
        stored_password = user.get("password", "")
        if not verify_password(login_data.password, stored_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误"
            )

        # 检查用户是否激活
        if not user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="用户已被禁用"
            )

        # 创建令牌
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={
                "sub": user["username"],
                "user_id": user["id"],
                "user_type": user["user_type"]
            },
            expires_delta=access_token_expires
        )
        refresh_token = create_refresh_token(
            data={
                "sub": user["username"],
                "user_id": user["id"],
                "user_type": user["user_type"]
            }
        )

        logger.info(f"用户登录成功: {login_data.username}")
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"登录失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="登录失败，请稍后重试"
        )


@router.post("/register", response_model=UserResponse)
async def register(register_data: RegisterRequest):
    """用户注册"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        user_model = UserModel(db_client)

        # 检查用户名是否已存在
        existing_user = await user_model.get_by_username(register_data.username)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户名已存在"
            )

        # 创建用户
        user_data = UserCreate(
            username=register_data.username,
            password=get_password_hash(register_data.password),
            email=register_data.email,
            phone=register_data.phone,
            company_name=register_data.company_name,
            user_type=register_data.user_type
        )

        user_id = await user_model.create(user_data)

        # 获取创建的用户
        user = await user_model.get(user_id)

        logger.info(f"用户注册成功: {register_data.username}")
        return UserResponse(**user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"注册失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="注册失败，请稍后重试"
        )


@router.post("/refresh", response_model=Token)
async def refresh_token(refresh_token: str):
    """刷新令牌"""
    try:
        # 解码刷新令牌
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        user_id: str = payload.get("user_id")
        user_type: str = payload.get("user_type")
        token_type: str = payload.get("type")

        if token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无效的刷新令牌"
            )

        # 创建新的访问令牌
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={
                "sub": username,
                "user_id": user_id,
                "user_type": user_type
            },
            expires_delta=access_token_expires
        )

        # 创建新的刷新令牌
        new_refresh_token = create_refresh_token(
            data={
                "sub": username,
                "user_id": user_id,
                "user_type": user_type
            }
        )

        return Token(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer"
        )

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: TokenData = Depends(get_current_active_user)):
    """获取当前用户信息"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        user_model = UserModel(db_client)

        # 获取用户信息
        user = await user_model.get(current_user.user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="用户不存在"
            )

        return UserResponse(**user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取用户信息失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取用户信息失败"
        )


@router.put("/me", response_model=UserResponse)
async def update_current_user_info(
    update_data: dict,
    current_user: TokenData = Depends(get_current_active_user)
):
    """更新当前用户信息"""
    try:
        # 获取数据库客户端
        from main import get_db_client
        db_client = get_db_client()
        user_model = UserModel(db_client)

        # 更新用户信息
        success = await user_model.update(current_user.user_id, update_data)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="更新失败"
            )

        # 获取更新后的用户信息
        user = await user_model.get(current_user.user_id)

        logger.info(f"用户信息更新成功: {current_user.username}")
        return UserResponse(**user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新用户信息失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新用户信息失败"
        )
