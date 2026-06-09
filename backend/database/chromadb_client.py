#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ChromaDB客户端 - 向量数据库管理
"""

import os
from typing import List, Dict, Any, Optional
from datetime import datetime
import chromadb
from chromadb.config import Settings as ChromaSettings
from loguru import logger

from config import settings


class ChromaDBClient:
    """ChromaDB客户端封装"""

    def __init__(self):
        """初始化ChromaDB客户端"""
        self.client = None
        self.collections = {}

    async def initialize(self):
        """初始化数据库连接和集合"""
        try:
            # 创建持久化目录
            persist_dir = settings.CHROMADB_PERSIST_DIR
            os.makedirs(persist_dir, exist_ok=True)

            # 初始化ChromaDB客户端
            self.client = chromadb.PersistentClient(
                path=persist_dir,
                settings=ChromaSettings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )

            # 初始化集合
            await self._init_collections()

            logger.info(f"ChromaDB初始化成功，持久化目录: {persist_dir}")

        except Exception as e:
            logger.error(f"ChromaDB初始化失败: {e}")
            raise

    async def _init_collections(self):
        """初始化数据库集合"""
        # 用户集合
        self.collections["users"] = self.client.get_or_create_collection(
            name="users",
            metadata={"description": "用户信息集合"}
        )

        # 检测记录集合
        self.collections["detection_records"] = self.client.get_or_create_collection(
            name="detection_records",
            metadata={"description": "检测记录集合"}
        )

        # 检测事件集合
        self.collections["detection_events"] = self.client.get_or_create_collection(
            name="detection_events",
            metadata={"description": "检测事件集合"}
        )

        # 系统配置集合
        self.collections["system_config"] = self.client.get_or_create_collection(
            name="system_config",
            metadata={"description": "系统配置集合"}
        )

        logger.info("数据库集合初始化完成")

    async def close(self):
        """关闭数据库连接"""
        if self.client:
            # ChromaDB PersistentClient 不需要显式关闭
            logger.info("ChromaDB连接已关闭")

    def get_collection(self, name: str):
        """获取集合"""
        if name not in self.collections:
            raise ValueError(f"集合 {name} 不存在")
        return self.collections[name]

    # ==================== 用户操作 ====================

    async def create_user(self, user_data: Dict[str, Any]) -> str:
        """创建用户"""
        try:
            collection = self.collections["users"]

            # 生成用户ID（使用微秒+随机数避免冲突）
            import random
            user_id = user_data.get("id", f"user_{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{random.randint(1000, 9999)}")

            # 准备元数据（过滤None值，ChromaDB不支持None）
            raw_metadata = {
                "username": user_data["username"],
                "password": user_data.get("password", ""),
                "user_type": user_data.get("user_type", "personal"),
                "email": user_data.get("email") or "",
                "phone": user_data.get("phone") or "",
                "company_name": user_data.get("company_name") or "",
                "is_active": user_data.get("is_active", True),
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            metadata = {k: v for k, v in raw_metadata.items() if v is not None}

            # 存储用户（使用空嵌入避免下载模型）
            collection.add(
                ids=[user_id],
                metadatas=[metadata],
                documents=[f"用户: {user_data['username']}"],
                embeddings=[[0.0] * 384]
            )

            logger.info(f"用户创建成功: {user_id}")
            return user_id

        except Exception as e:
            logger.error(f"创建用户失败: {e}")
            raise

    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """获取用户信息"""
        try:
            collection = self.collections["users"]

            result = collection.get(
                ids=[user_id],
                include=["metadatas", "documents"]
            )

            if result["ids"]:
                user_data = result["metadatas"][0]
                user_data["id"] = result["ids"][0]
                return user_data

            return None

        except Exception as e:
            logger.error(f"获取用户失败: {e}")
            raise

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """根据用户名获取用户"""
        try:
            collection = self.collections["users"]

            result = collection.get(
                where={"username": username},
                include=["metadatas", "documents"]
            )

            if result["ids"]:
                user_data = result["metadatas"][0]
                user_data["id"] = result["ids"][0]
                return user_data

            return None

        except Exception as e:
            logger.error(f"获取用户失败: {e}")
            raise

    async def update_user(self, user_id: str, update_data: Dict[str, Any]) -> bool:
        """更新用户信息"""
        try:
            collection = self.collections["users"]

            # 获取现有用户
            existing = await self.get_user(user_id)
            if not existing:
                return False

            # 更新元数据
            metadata = existing
            metadata.update(update_data)
            metadata["updated_at"] = datetime.now().isoformat()

            # 更新集合
            collection.update(
                ids=[user_id],
                metadatas=[metadata]
            )

            logger.info(f"用户更新成功: {user_id}")
            return True

        except Exception as e:
            logger.error(f"更新用户失败: {e}")
            raise

    async def delete_user(self, user_id: str) -> bool:
        """删除用户"""
        try:
            collection = self.collections["users"]

            collection.delete(ids=[user_id])

            logger.info(f"用户删除成功: {user_id}")
            return True

        except Exception as e:
            logger.error(f"删除用户失败: {e}")
            raise

    async def list_users(self, user_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """列出用户"""
        try:
            collection = self.collections["users"]

            where_filter = {}
            if user_type:
                where_filter["user_type"] = user_type

            result = collection.get(
                where=where_filter if where_filter else None,
                include=["metadatas", "documents"]
            )

            users = []
            for i, user_id in enumerate(result["ids"]):
                user_data = result["metadatas"][i]
                user_data["id"] = user_id
                users.append(user_data)

            return users

        except Exception as e:
            logger.error(f"列出用户失败: {e}")
            raise

    # ==================== 检测记录操作 ====================

    async def create_detection_record(self, record_data: Dict[str, Any]) -> str:
        """创建检测记录"""
        try:
            collection = self.collections["detection_records"]

            # 生成记录ID
            record_id = record_data.get("id", f"record_{datetime.now().strftime('%Y%m%d%H%M%S')}")

            # 准备元数据
            metadata = {
                "user_id": record_data["user_id"],
                "batch_id": record_data.get("batch_id", record_id),
                "source_type": record_data.get("source_type", "image"),
                "timestamp": datetime.now().isoformat(),
                "conf_threshold": record_data.get("conf_threshold", 0.25),
                "iou_threshold": record_data.get("iou_threshold", 0.45),
                "image_width": record_data.get("image_width", 0),
                "image_height": record_data.get("image_height", 0),
                "defect_count": record_data.get("defect_count", 0),
                "original_image": record_data.get("original_image", ""),
                "annotated_image": record_data.get("annotated_image", ""),
                "heatmap_image": record_data.get("heatmap_image", ""),
                "status": record_data.get("status", "completed")
            }

            # 生成文档描述
            document = f"检测记录: {record_data.get('batch_id', record_id)}, 缺陷数量: {record_data.get('defect_count', 0)}"

            # 存储记录（使用空嵌入避免下载模型）
            collection.add(
                ids=[record_id],
                metadatas=[metadata],
                documents=[document],
                embeddings=[[0.0] * 384]
            )

            logger.info(f"检测记录创建成功: {record_id}")
            return record_id

        except Exception as e:
            logger.error(f"创建检测记录失败: {e}")
            raise

    async def get_detection_record(self, record_id: str) -> Optional[Dict[str, Any]]:
        """获取检测记录"""
        try:
            collection = self.collections["detection_records"]

            result = collection.get(
                ids=[record_id],
                include=["metadatas", "documents"]
            )

            if result["ids"]:
                record_data = result["metadatas"][0]
                record_data["id"] = result["ids"][0]
                return record_data

            return None

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
            collection = self.collections["detection_records"]

            result = collection.get(
                where={"user_id": user_id},
                include=["metadatas", "documents"],
                limit=limit,
                offset=offset
            )

            records = []
            for i, record_id in enumerate(result["ids"]):
                record_data = result["metadatas"][i]
                record_data["id"] = record_id
                records.append(record_data)

            return records

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
            collection = self.collections["detection_records"]

            result = collection.get(
                include=["metadatas", "documents"],
                limit=limit,
                offset=offset
            )

            records = []
            for i, record_id in enumerate(result["ids"]):
                record_data = result["metadatas"][i]
                record_data["id"] = record_id
                records.append(record_data)

            return records

        except Exception as e:
            logger.error(f"获取所有检测记录失败: {e}")
            raise

    async def delete_detection_record(self, record_id: str) -> bool:
        """删除检测记录"""
        try:
            collection = self.collections["detection_records"]

            collection.delete(ids=[record_id])

            logger.info(f"检测记录删除成功: {record_id}")
            return True

        except Exception as e:
            logger.error(f"删除检测记录失败: {e}")
            raise

    # ==================== 检测事件操作 ====================

    async def create_detection_event(self, event_data: Dict[str, Any]) -> str:
        """创建检测事件"""
        try:
            collection = self.collections["detection_events"]

            # 生成事件ID
            event_id = event_data.get("id", f"event_{datetime.now().strftime('%Y%m%d%H%M%S%f')}")

            # 准备元数据
            metadata = {
                "record_id": event_data["record_id"],
                "user_id": event_data["user_id"],
                "class_name": event_data["class_name"],
                "confidence": event_data["confidence"],
                "bbox_x1": event_data.get("bbox_x1", 0),
                "bbox_y1": event_data.get("bbox_y1", 0),
                "bbox_x2": event_data.get("bbox_x2", 0),
                "bbox_y2": event_data.get("bbox_y2", 0),
                "timestamp": datetime.now().isoformat()
            }

            # 生成文档描述
            document = f"缺陷: {event_data['class_name']}, 置信度: {event_data['confidence']:.2f}"

            # 存储事件（使用空嵌入避免下载模型）
            collection.add(
                ids=[event_id],
                metadatas=[metadata],
                documents=[document],
                embeddings=[[0.0] * 384]
            )

            logger.info(f"检测事件创建成功: {event_id}")
            return event_id

        except Exception as e:
            logger.error(f"创建检测事件失败: {e}")
            raise

    async def get_record_events(self, record_id: str) -> List[Dict[str, Any]]:
        """获取记录的所有检测事件"""
        try:
            collection = self.collections["detection_events"]

            result = collection.get(
                where={"record_id": record_id},
                include=["metadatas", "documents"]
            )

            events = []
            for i, event_id in enumerate(result["ids"]):
                event_data = result["metadatas"][i]
                event_data["id"] = event_id
                events.append(event_data)

            return events

        except Exception as e:
            logger.error(f"获取检测事件失败: {e}")
            raise

    # ==================== 系统配置操作 ====================

    async def get_config(self, key: str) -> Optional[str]:
        """获取系统配置"""
        try:
            collection = self.collections["system_config"]

            result = collection.get(
                ids=[key],
                include=["metadatas", "documents"]
            )

            if result["ids"]:
                return result["metadatas"][0].get("value")

            return None

        except Exception as e:
            logger.error(f"获取配置失败: {e}")
            raise

    async def set_config(self, key: str, value: str) -> bool:
        """设置系统配置"""
        try:
            collection = self.collections["system_config"]

            metadata = {
                "key": key,
                "value": value,
                "updated_at": datetime.now().isoformat()
            }

            # 使用upsert（使用空嵌入避免下载模型）
            collection.upsert(
                ids=[key],
                metadatas=[metadata],
                documents=[f"配置: {key}"],
                embeddings=[[0.0] * 384]
            )

            logger.info(f"配置设置成功: {key}")
            return True

        except Exception as e:
            logger.error(f"设置配置失败: {e}")
            raise

    # ==================== 统计功能 ====================

    async def get_detection_statistics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """获取检测统计信息（含缺陷类型分布和置信度分布）"""
        try:
            # ===== 记录统计 =====
            collection = self.collections["detection_records"]
            where_filter = {"user_id": user_id} if user_id else None
            result = collection.get(where=where_filter, include=["metadatas"])
            records = result["metadatas"]

            total_records = len(records)
            total_defects = sum(r.get("defect_count", 0) for r in records)

            # 按来源类型统计
            source_stats = {}
            for r in records:
                source_type = r.get("source_type", "unknown")
                source_stats[source_type] = source_stats.get(source_type, 0) + 1

            # 按日期统计
            date_stats = {}
            for r in records:
                timestamp = r.get("timestamp", "")
                if timestamp:
                    date = timestamp[:10]
                    date_stats[date] = date_stats.get(date, 0) + 1

            # ===== 事件统计（缺陷类型 + 置信度 + 损伤面积） =====
            defect_stats = {}
            confidence_distribution = [
                {"range": "0-20%", "count": 0, "percentage": 0},
                {"range": "20-40%", "count": 0, "percentage": 0},
                {"range": "40-60%", "count": 0, "percentage": 0},
                {"range": "60-80%", "count": 0, "percentage": 0},
                {"range": "80-100%", "count": 0, "percentage": 0},
            ]
            damage_stats = {}  # 按缺陷类型的损伤面积统计
            total_events = 0

            try:
                events_collection = self.collections["detection_events"]
                event_where = {"user_id": user_id} if user_id else None
                events_result = events_collection.get(where=event_where, include=["metadatas"])
                events = events_result["metadatas"]
                total_events = len(events)

                for ev in events:
                    # 缺陷类型统计
                    class_name = ev.get("class_name", "未知")
                    defect_stats[class_name] = defect_stats.get(class_name, 0) + 1

                    # 置信度分布
                    conf = ev.get("confidence", 0)
                    if conf < 0.2:
                        confidence_distribution[0]["count"] += 1
                    elif conf < 0.4:
                        confidence_distribution[1]["count"] += 1
                    elif conf < 0.6:
                        confidence_distribution[2]["count"] += 1
                    elif conf < 0.8:
                        confidence_distribution[3]["count"] += 1
                    else:
                        confidence_distribution[4]["count"] += 1

                    # 损伤面积统计（bbox面积）
                    x1 = ev.get("bbox_x1", 0)
                    y1 = ev.get("bbox_y1", 0)
                    x2 = ev.get("bbox_x2", 0)
                    y2 = ev.get("bbox_y2", 0)
                    area = max(0, (x2 - x1)) * max(0, (y2 - y1))
                    if class_name not in damage_stats:
                        damage_stats[class_name] = {"total_area": 0, "count": 0}
                    damage_stats[class_name]["total_area"] += area
                    damage_stats[class_name]["count"] += 1

                # 计算置信度百分比
                if total_events > 0:
                    for item in confidence_distribution:
                        item["percentage"] = round(item["count"] / total_events * 100, 1)

                # 计算损伤占比（平均面积）
                damage_ratio = {}
                for class_name, stats in damage_stats.items():
                    avg_area = stats["total_area"] / stats["count"] if stats["count"] > 0 else 0
                    damage_ratio[class_name] = {
                        "avg_area": round(avg_area, 1),
                        "total_count": stats["count"]
                    }

            except Exception as e:
                logger.warning(f"获取事件统计失败（非关键）: {e}")
                damage_ratio = {}

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
            collection = self.collections["users"]

            result = collection.get(include=["metadatas"])

            users = result["metadatas"]

            # 按用户类型统计
            type_stats = {}
            for u in users:
                user_type = u.get("user_type", "unknown")
                type_stats[user_type] = type_stats.get(user_type, 0) + 1

            return {
                "total_users": len(users),
                "type_stats": type_stats
            }

        except Exception as e:
            logger.error(f"获取用户统计信息失败: {e}")
            raise

    # ==================== 向量搜索 ====================

    async def search_similar_records(
        self,
        query_text: str,
        user_id: Optional[str] = None,
        n_results: int = 5
    ) -> List[Dict[str, Any]]:
        """搜索相似的检测记录"""
        try:
            collection = self.collections["detection_records"]

            where_filter = {"user_id": user_id} if user_id else None

            results = collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where=where_filter,
                include=["metadatas", "documents", "distances"]
            )

            records = []
            if results["ids"][0]:
                for i, record_id in enumerate(results["ids"][0]):
                    record_data = results["metadatas"][0][i]
                    record_data["id"] = record_id
                    record_data["distance"] = results["distances"][0][i]
                    records.append(record_data)

            return records

        except Exception as e:
            logger.error(f"搜索相似记录失败: {e}")
            raise
