#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MySQL数据库客户端 - 与 sqlite_client.py 接口完全一致
支持一键切换：只需修改 .env 中的 DATABASE_URL 即可
"""

import os
import aiomysql
from typing import List, Dict, Any, Optional
from datetime import datetime
from loguru import logger
from urllib.parse import urlparse

from config import settings


class DatabaseClient:
    """MySQL数据库客户端封装（异步）"""

    def __init__(self):
        """初始化数据库客户端"""
        self.pool = None

    async def initialize(self):
        """初始化数据库连接池"""
        try:
            # 解析 DATABASE_URL
            # 格式: mysql://user:password@host:port/database
            db_url = settings.DATABASE_URL

            if db_url.startswith("mysql://"):
                parsed = urlparse(db_url)
                self.db_config = {
                    "host": parsed.hostname or "localhost",
                    "port": parsed.port or 3306,
                    "user": parsed.username or "root",
                    "password": parsed.password or "",
                    "db": parsed.path.lstrip("/") or "steel_defect",
                    "charset": "utf8mb4",
                    "autocommit": True,
                }
            else:
                # 默认配置
                self.db_config = {
                    "host": os.getenv("MYSQL_HOST", "localhost"),
                    "port": int(os.getenv("MYSQL_PORT", "3306")),
                    "user": os.getenv("MYSQL_USER", "root"),
                    "password": os.getenv("MYSQL_PASSWORD", "123456"),
                    "db": os.getenv("MYSQL_DATABASE", "steel_defect"),
                    "charset": "utf8mb4",
                    "autocommit": True,
                }

            # 创建连接池
            self.pool = await aiomysql.create_pool(
                **self.db_config,
                minsize=2,
                maxsize=10,
                pool_recycle=3600,
            )

            # 初始化表（如果需要）
            await self._init_tables()

            logger.info(f"MySQL数据库初始化成功: {self.db_config['host']}:{self.db_config['port']}/{self.db_config['db']}")

        except Exception as e:
            logger.error(f"MySQL数据库初始化失败: {e}")
            raise

    async def _init_tables(self):
        """初始化数据库表（如果不存在）"""
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                # 用户表
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id VARCHAR(50) PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        password VARCHAR(255) NOT NULL DEFAULT '',
                        user_type ENUM('personal', 'enterprise', 'admin') DEFAULT 'personal',
                        email VARCHAR(100) DEFAULT '',
                        phone VARCHAR(20) DEFAULT '',
                        company_name VARCHAR(100) DEFAULT '',
                        is_active TINYINT(1) DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_user_type (user_type),
                        INDEX idx_username (username)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)

                # 检测记录表
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS detection_records (
                        id VARCHAR(50) PRIMARY KEY,
                        user_id VARCHAR(50) NOT NULL,
                        batch_id VARCHAR(100),
                        source_type ENUM('image', 'camera', 'ip_camera') DEFAULT 'image',
                        timestamp DATETIME,
                        conf_threshold FLOAT DEFAULT 0.25,
                        iou_threshold FLOAT DEFAULT 0.45,
                        image_width INT DEFAULT 0,
                        image_height INT DEFAULT 0,
                        defect_count INT DEFAULT 0,
                        original_image VARCHAR(255) DEFAULT '',
                        annotated_image VARCHAR(255) DEFAULT '',
                        heatmap_image VARCHAR(255) DEFAULT '',
                        status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'completed',
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        INDEX idx_user_id (user_id),
                        INDEX idx_timestamp (timestamp),
                        INDEX idx_batch_id (batch_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)

                # 检测事件表
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS detection_events (
                        id VARCHAR(50) PRIMARY KEY,
                        record_id VARCHAR(50) NOT NULL,
                        user_id VARCHAR(50) NOT NULL,
                        class_name VARCHAR(50),
                        confidence FLOAT,
                        bbox_x1 FLOAT DEFAULT 0,
                        bbox_y1 FLOAT DEFAULT 0,
                        bbox_x2 FLOAT DEFAULT 0,
                        bbox_y2 FLOAT DEFAULT 0,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (record_id) REFERENCES detection_records(id) ON DELETE CASCADE,
                        INDEX idx_record_id (record_id),
                        INDEX idx_user_id (user_id),
                        INDEX idx_class_name (class_name)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)

                # 系统配置表
                await cursor.execute("""
                    CREATE TABLE IF NOT EXISTS system_config (
                        config_key VARCHAR(50) PRIMARY KEY,
                        config_value TEXT,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)

                logger.info("MySQL数据库表初始化完成")

    async def close(self):
        """关闭数据库连接池"""
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()
            logger.info("MySQL连接池已关闭")

    # ==================== 用户操作 ====================

    async def create_user(self, user_data: Dict[str, Any]) -> str:
        """创建用户"""
        try:
            import random
            user_id = user_data.get("id", f"user_{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{random.randint(1000, 9999)}")

            now = datetime.now()
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute("""
                        INSERT INTO users (id, username, password, user_type, email, phone, company_name, is_active, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        user_id,
                        user_data["username"],
                        user_data.get("password", ""),
                        user_data.get("user_type", "personal"),
                        user_data.get("email") or "",
                        user_data.get("phone") or "",
                        user_data.get("company_name") or "",
                        1 if user_data.get("is_active", True) else 0,
                        user_data.get("created_at", now),
                        user_data.get("updated_at", now)
                    ))

            logger.info(f"用户创建成功: {user_id}")
            return user_id

        except Exception as e:
            logger.error(f"创建用户失败: {e}")
            raise

    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """获取用户信息"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
                    row = await cursor.fetchone()
                    return row
        except Exception as e:
            logger.error(f"获取用户失败: {e}")
            raise

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """根据用户名获取用户"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
                    row = await cursor.fetchone()
                    return row
        except Exception as e:
            logger.error(f"获取用户失败: {e}")
            raise

    async def update_user(self, user_id: str, update_data: Dict[str, Any]) -> bool:
        """更新用户信息"""
        try:
            # 过滤不允许更新的字段
            allowed_fields = {"username", "password", "user_type", "email", "phone", "company_name", "is_active", "display_name", "company"}
            filtered_data = {k: v for k, v in update_data.items() if k in allowed_fields and v is not None}

            if not filtered_data:
                return False

            # 处理 is_active 字段（转为整数）
            if "is_active" in filtered_data:
                filtered_data["is_active"] = 1 if filtered_data["is_active"] else 0

            filtered_data["updated_at"] = datetime.now()

            set_clause = ", ".join(f"{k} = %s" for k in filtered_data.keys())
            values = list(filtered_data.values()) + [user_id]

            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute(f"UPDATE users SET {set_clause} WHERE id = %s", values)
                    return cursor.rowcount > 0

        except Exception as e:
            logger.error(f"更新用户失败: {e}")
            raise

    async def delete_user(self, user_id: str) -> bool:
        """删除用户"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
                    logger.info(f"用户删除成功: {user_id}")
                    return True
        except Exception as e:
            logger.error(f"删除用户失败: {e}")
            raise

    async def list_users(self, user_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """列出用户"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    if user_type:
                        await cursor.execute("SELECT * FROM users WHERE user_type = %s", (user_type,))
                    else:
                        await cursor.execute("SELECT * FROM users")
                    rows = await cursor.fetchall()
                    return rows
        except Exception as e:
            logger.error(f"列出用户失败: {e}")
            raise

    # ==================== 检测记录操作 ====================

    async def create_detection_record(self, record_data: Dict[str, Any]) -> str:
        """创建检测记录"""
        try:
            record_id = record_data.get("id", f"record_{datetime.now().strftime('%Y%m%d%H%M%S')}")
            now = datetime.now()

            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute("""
                        INSERT INTO detection_records
                        (id, user_id, batch_id, source_type, timestamp, conf_threshold, iou_threshold,
                         image_width, image_height, defect_count, original_image, annotated_image, heatmap_image, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        record_id,
                        record_data["user_id"],
                        record_data.get("batch_id", record_id),
                        record_data.get("source_type", "image"),
                        record_data.get("timestamp", now),
                        record_data.get("conf_threshold", 0.25),
                        record_data.get("iou_threshold", 0.45),
                        record_data.get("image_width", 0),
                        record_data.get("image_height", 0),
                        record_data.get("defect_count", 0),
                        record_data.get("original_image", ""),
                        record_data.get("annotated_image", ""),
                        record_data.get("heatmap_image", ""),
                        record_data.get("status", "completed")
                    ))

            logger.info(f"检测记录创建成功: {record_id}")
            return record_id

        except Exception as e:
            logger.error(f"创建检测记录失败: {e}")
            raise

    async def get_detection_record(self, record_id: str) -> Optional[Dict[str, Any]]:
        """获取检测记录"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute("SELECT * FROM detection_records WHERE id = %s", (record_id,))
                    row = await cursor.fetchone()
                    return row
        except Exception as e:
            logger.error(f"获取检测记录失败: {e}")
            raise

    async def get_user_detection_records(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """获取用户的检测记录"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute(
                        "SELECT * FROM detection_records WHERE user_id = %s ORDER BY timestamp DESC LIMIT %s OFFSET %s",
                        (user_id, limit, offset)
                    )
                    rows = await cursor.fetchall()
                    return rows
        except Exception as e:
            logger.error(f"获取用户检测记录失败: {e}")
            raise

    async def get_all_detection_records(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """获取所有检测记录（管理员用）"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute(
                        "SELECT * FROM detection_records ORDER BY timestamp DESC LIMIT %s OFFSET %s",
                        (limit, offset)
                    )
                    rows = await cursor.fetchall()
                    return rows
        except Exception as e:
            logger.error(f"获取所有检测记录失败: {e}")
            raise

    async def delete_detection_record(self, record_id: str) -> bool:
        """删除检测记录"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    # 级联删除关联的检测事件
                    await cursor.execute("DELETE FROM detection_events WHERE record_id = %s", (record_id,))
                    await cursor.execute("DELETE FROM detection_records WHERE id = %s", (record_id,))
                    logger.info(f"检测记录删除成功: {record_id}")
                    return True
        except Exception as e:
            logger.error(f"删除检测记录失败: {e}")
            raise

    # ==================== 检测事件操作 ====================

    async def create_detection_event(self, event_data: Dict[str, Any]) -> str:
        """创建检测事件"""
        try:
            import random
            event_id = event_data.get("id", f"event_{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{random.randint(100, 999)}")
            now = datetime.now()

            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute("""
                        INSERT INTO detection_events
                        (id, record_id, user_id, class_name, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2, timestamp)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        event_id,
                        event_data["record_id"],
                        event_data["user_id"],
                        event_data["class_name"],
                        event_data["confidence"],
                        event_data.get("bbox_x1", 0),
                        event_data.get("bbox_y1", 0),
                        event_data.get("bbox_x2", 0),
                        event_data.get("bbox_y2", 0),
                        event_data.get("timestamp", now)
                    ))

            logger.info(f"检测事件创建成功: {event_id}")
            return event_id

        except Exception as e:
            logger.error(f"创建检测事件失败: {e}")
            raise

    async def get_record_events(self, record_id: str) -> List[Dict[str, Any]]:
        """获取记录的所有检测事件"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute("SELECT * FROM detection_events WHERE record_id = %s", (record_id,))
                    rows = await cursor.fetchall()
                    return rows
        except Exception as e:
            logger.error(f"获取检测事件失败: {e}")
            raise

    # ==================== 系统配置操作 ====================

    async def get_config(self, key: str) -> Optional[str]:
        """获取系统配置"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute("SELECT config_value FROM system_config WHERE config_key = %s", (key,))
                    row = await cursor.fetchone()
                    return row[0] if row else None
        except Exception as e:
            logger.error(f"获取配置失败: {e}")
            raise

    async def set_config(self, key: str, value: str) -> bool:
        """设置系统配置"""
        try:
            now = datetime.now()
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute("""
                        INSERT INTO system_config (config_key, config_value, updated_at)
                        VALUES (%s, %s, %s)
                        ON DUPLICATE KEY UPDATE config_value = %s, updated_at = %s
                    """, (key, value, now, value, now))
                    logger.info(f"配置设置成功: {key}")
                    return True
        except Exception as e:
            logger.error(f"设置配置失败: {e}")
            raise

    # ==================== 统计功能 ====================

    async def get_detection_statistics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """获取检测统计信息（含缺陷类型分布和置信度分布）"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    # ===== 记录统计 =====
                    if user_id:
                        await cursor.execute(
                            "SELECT COUNT(*), COALESCE(SUM(defect_count), 0) FROM detection_records WHERE user_id = %s",
                            (user_id,)
                        )
                    else:
                        await cursor.execute("SELECT COUNT(*), COALESCE(SUM(defect_count), 0) FROM detection_records")
                    row = await cursor.fetchone()
                    total_records = row[0]
                    total_defects = row[1]

                    # 按来源类型统计
                    source_stats = {}
                    if user_id:
                        await cursor.execute(
                            "SELECT source_type, COUNT(*) FROM detection_records WHERE user_id = %s GROUP BY source_type",
                            (user_id,)
                        )
                    else:
                        await cursor.execute("SELECT source_type, COUNT(*) FROM detection_records GROUP BY source_type")
                    for row in await cursor.fetchall():
                        source_stats[row[0] or "unknown"] = row[1]

                    # 按日期统计
                    date_stats = {}
                    if user_id:
                        await cursor.execute(
                            "SELECT DATE(timestamp) as date, COUNT(*) FROM detection_records WHERE user_id = %s AND timestamp IS NOT NULL GROUP BY date",
                            (user_id,)
                        )
                    else:
                        await cursor.execute(
                            "SELECT DATE(timestamp) as date, COUNT(*) FROM detection_records WHERE timestamp IS NOT NULL GROUP BY date"
                        )
                    for row in await cursor.fetchall():
                        if row[0]:
                            date_stats[str(row[0])] = row[1]

                    # ===== 事件统计（缺陷类型 + 置信度 + 损伤面积） =====
                    defect_stats = {}
                    confidence_distribution = [
                        {"range": "0-20%", "count": 0, "percentage": 0},
                        {"range": "20-40%", "count": 0, "percentage": 0},
                        {"range": "40-60%", "count": 0, "percentage": 0},
                        {"range": "60-80%", "count": 0, "percentage": 0},
                        {"range": "80-100%", "count": 0, "percentage": 0},
                    ]
                    damage_ratio = {}
                    total_events = 0

                    try:
                        # 使用SQL GROUP BY直接统计缺陷类型
                        if user_id:
                            await cursor.execute("SELECT class_name, COUNT(*) FROM detection_events WHERE user_id = %s GROUP BY class_name", (user_id,))
                        else:
                            await cursor.execute("SELECT class_name, COUNT(*) FROM detection_events GROUP BY class_name")
                        for row in await cursor.fetchall():
                            defect_stats[row[0] or "未知"] = row[1]
                            total_events += row[1]

                        # 使用SQL CASE WHEN统计置信度分布
                        conf_query = """
                            SELECT
                                SUM(CASE WHEN confidence < 0.2 THEN 1 ELSE 0 END) as bin_0_20,
                                SUM(CASE WHEN confidence >= 0.2 AND confidence < 0.4 THEN 1 ELSE 0 END) as bin_20_40,
                                SUM(CASE WHEN confidence >= 0.4 AND confidence < 0.6 THEN 1 ELSE 0 END) as bin_40_60,
                                SUM(CASE WHEN confidence >= 0.6 AND confidence < 0.8 THEN 1 ELSE 0 END) as bin_60_80,
                                SUM(CASE WHEN confidence >= 0.8 THEN 1 ELSE 0 END) as bin_80_100
                            FROM detection_events
                        """
                        if user_id:
                            await cursor.execute(conf_query + " WHERE user_id = %s", (user_id,))
                        else:
                            await cursor.execute(conf_query)
                        conf_row = await cursor.fetchone()
                        if conf_row:
                            bins = [conf_row[0] or 0, conf_row[1] or 0, conf_row[2] or 0, conf_row[3] or 0, conf_row[4] or 0]
                            for i, count in enumerate(bins):
                                confidence_distribution[i]["count"] = count
                                confidence_distribution[i]["percentage"] = round(count / total_events * 100, 1) if total_events > 0 else 0

                        # 使用SQL聚合统计损伤面积
                        damage_query = """
                            SELECT class_name,
                                AVG(GREATEST(0, (bbox_x2 - bbox_x1)) * GREATEST(0, (bbox_y2 - bbox_y1))) as avg_area,
                                COUNT(*) as cnt
                            FROM detection_events
                            WHERE bbox_x2 > bbox_x1 AND bbox_y2 > bbox_y1
                        """
                        if user_id:
                            await cursor.execute(damage_query + " AND user_id = %s GROUP BY class_name", (user_id,))
                        else:
                            await cursor.execute(damage_query + " GROUP BY class_name")
                        for row in await cursor.fetchall():
                            damage_ratio[row[0] or "未知"] = {
                                "avg_area": round(row[1] or 0, 1),
                                "total_count": row[2]
                            }

                    except Exception as e:
                        logger.warning(f"获取事件统计失败（非关键）: {e}")

                    return {
                        "total_records": total_records,
                        "total_defects": total_defects,
                        "source_stats": source_stats,
                        "date_stats": date_stats,
                        "avg_defects_per_record": total_defects / total_records if total_records > 0 else 0,
                        "defect_stats": defect_stats,
                        "confidence_distribution": confidence_distribution,
                        "damage_ratio": damage_ratio,
                        "total_events": total_events,
                    }

        except Exception as e:
            logger.error(f"获取统计信息失败: {e}")
            raise

    async def get_user_statistics(self) -> Dict[str, Any]:
        """获取用户统计信息"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor() as cursor:
                    await cursor.execute("SELECT COUNT(*) FROM users")
                    total_users = (await cursor.fetchone())[0]

                    await cursor.execute("SELECT user_type, COUNT(*) FROM users GROUP BY user_type")
                    type_stats = {}
                    for row in await cursor.fetchall():
                        type_stats[row[0] or "unknown"] = row[1]

                    return {
                        "total_users": total_users,
                        "type_stats": type_stats
                    }

        except Exception as e:
            logger.error(f"获取用户统计信息失败: {e}")
            raise

    # ==================== 搜索功能 ====================

    async def search_similar_records(
        self,
        query_text: str,
        user_id: Optional[str] = None,
        n_results: int = 5
    ) -> List[Dict[str, Any]]:
        """搜索相似的检测记录（基于文本匹配）"""
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    search_pattern = f"%{query_text}%"

                    if user_id:
                        await cursor.execute("""
                            SELECT * FROM detection_records
                            WHERE user_id = %s AND (batch_id LIKE %s OR original_image LIKE %s)
                            ORDER BY timestamp DESC LIMIT %s
                        """, (user_id, search_pattern, search_pattern, n_results))
                    else:
                        await cursor.execute("""
                            SELECT * FROM detection_records
                            WHERE batch_id LIKE %s OR original_image LIKE %s
                            ORDER BY timestamp DESC LIMIT %s
                        """, (search_pattern, search_pattern, n_results))

                    rows = await cursor.fetchall()
                    return rows

        except Exception as e:
            logger.error(f"搜索相似记录失败: {e}")
            raise
