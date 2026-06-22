#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Spark Image Understanding Service - 讯飞星火图片理解API服务
功能：通过 WebSocket 调用讯飞星火图片理解API，实现图文混合分析
"""
import os
import json
import base64
import hashlib
import hmac
import websocket
import threading
from datetime import datetime
from time import mktime
from wsgiref.handlers import format_date_time
from urllib.parse import urlparse, urlencode
from typing import List, Dict, Optional

# 加载 .env 文件（如果存在）
try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
except ImportError:
    pass  # python-dotenv 未安装，使用系统环境变量


class SparkImageService:
    """讯飞星火图片理解服务"""

    def __init__(self, app_id: str = None, api_key: str = None, api_secret: str = None):
        # 从环境变量读取认证信息（必须配置）
        self.app_id = app_id or os.environ.get('SPARK_IMAGE_APP_ID')
        self.api_key = api_key or os.environ.get('SPARK_IMAGE_API_KEY')
        self.api_secret = api_secret or os.environ.get('SPARK_IMAGE_API_SECRET')
        
        if not all([self.app_id, self.api_key, self.api_secret]):
            print("[警告] 讯飞星火图片理解API认证信息未配置，请设置环境变量:")
            print("  - SPARK_IMAGE_APP_ID")
            print("  - SPARK_IMAGE_API_KEY")
            print("  - SPARK_IMAGE_API_SECRET")
        
        # WebSocket 服务地址
        self.host = "spark-api.cn-huabei-1.xf-yun.com"
        self.path = "/v2.1/image"
        self.url = f"wss://{self.host}{self.path}"

    def _create_url(self) -> str:
        """生成带鉴权签名的WebSocket URL"""
        # 检查认证信息是否已配置（包括空字符串检查）
        if not self.app_id or not self.api_key or not self.api_secret:
            raise ValueError("讯飞星火图片理解API认证信息未配置，请设置环境变量: SPARK_IMAGE_APP_ID, SPARK_IMAGE_API_KEY, SPARK_IMAGE_API_SECRET")

        # 生成RFC1123格式的日期
        now = datetime.now()
        date = format_date_time(mktime(now.timetuple()))

        # 拼接签名原始字符串
        signature_origin = f"host: {self.host}\ndate: {date}\nGET {self.path} HTTP/1.1"

        # HMAC-SHA256 加密
        signature_sha = hmac.new(
            self.api_secret.encode('utf-8'),
            signature_origin.encode('utf-8'),
            digestmod=hashlib.sha256
        ).digest()

        # base64 编码
        signature_sha_base64 = base64.b64encode(signature_sha).decode('utf-8')

        # 拼接authorization参数
        authorization_origin = (
            f'api_key="{self.api_key}", '
            f'algorithm="hmac-sha256", '
            f'headers="host date request-line", '
            f'signature="{signature_sha_base64}"'
        )
        authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode('utf-8')

        # 生成最终URL
        v = {
            "authorization": authorization,
            "date": date,
            "host": self.host
        }
        url = self.url + "?" + urlencode(v)
        return url

    def analyze_image(self, image_base64: str, prompt: str, 
                     detections: List[Dict] = None,
                     conf_threshold: float = 0.25,
                     iou_threshold: float = 0.45,
                     timeout: int = 120) -> Dict:
        """
        分析图片（结合检测结果和提示词）

        Args:
            image_base64: 图片base64编码
            prompt: 分析提示词
            detections: 检测结果列表（可选）
            conf_threshold: 置信度阈值
            iou_threshold: IOU阈值
            timeout: 超时时间（秒）

        Returns:
            分析结果字典
        """
        try:
            # 检查认证信息是否已配置（包括空字符串检查）
            if not self.app_id or not self.api_key or not self.api_secret:
                raise ValueError("讯飞星火图片理解API认证信息未配置，请设置环境变量: SPARK_IMAGE_APP_ID, SPARK_IMAGE_API_KEY, SPARK_IMAGE_API_SECRET")
            
            # 构建消息内容
            messages = [
                {
                    "role": "user",
                    "content": image_base64,  # 首个必须是图片
                    "content_type": "image"
                }
            ]

            # 如果有检测结果，添加到提示词中
            if detections:
                detection_summary = self._build_detection_summary(detections)
                full_prompt = f"{prompt}\n\n检测数据：\n{detection_summary}\n\n当前检测参数：\n- 置信度阈值: {conf_threshold}\n- IOU阈值: {iou_threshold}"
            else:
                full_prompt = prompt

            # 添加文本问题
            messages.append({
                "role": "user",
                "content": full_prompt,
                "content_type": "text"
            })

            # 构建请求参数
            request_data = {
                "header": {
                    "app_id": self.app_id
                },
                "parameter": {
                    "chat": {
                        "domain": "imagev3",  # 使用高级版
                        "temperature": 0.5,
                        "top_k": 4,
                        "max_tokens": 4096
                    }
                },
                "payload": {
                    "message": {
                        "text": messages
                    }
                }
            }

            # 通过WebSocket发送请求
            result = self._call_websocket(request_data, timeout)

            return {
                "success": True,
                "analysis": result,
                "detection_count": len(detections) if detections else 0
            }

        except Exception as e:
            print(f"[图片理解API调用失败] {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "detection_count": len(detections) if detections else 0
            }

    def _build_detection_summary(self, detections: List[Dict]) -> str:
        """构建检测结果的文本描述"""
        if not detections:
            return "未检测到任何缺陷。"

        summary = f"检测到 {len(detections)} 个缺陷区域：\n\n"

        for i, det in enumerate(detections, 1):
            class_name = det.get('class_name', '未知缺陷')
            confidence = det.get('confidence', 0)
            bbox = det.get('bbox', [])
            area = det.get('area', 0)

            summary += f"缺陷 {i}:\n"
            summary += f"  - 类型: {class_name}\n"
            summary += f"  - 置信度: {confidence:.2%}\n"

            if bbox and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
                width = x2 - x1
                height = y2 - y1
                summary += f"  - 位置: ({x1}, {y1}) 到 ({x2}, {y2})\n"
                summary += f"  - 尺寸: 宽{width}px × 高{height}px\n"

            if area > 0:
                summary += f"  - 面积: {area} 像素²\n"

            summary += "\n"

        return summary

    def _call_websocket(self, request_data: Dict, timeout: int = 120) -> str:
        """
        通过WebSocket调用API

        Args:
            request_data: 请求数据
            timeout: 超时时间

        Returns:
            AI回复的文本内容
        """
        result = {"content": "", "error": None}
        ws_url = self._create_url()

        def on_message(ws, message):
            """接收消息回调"""
            try:
                data = json.loads(message)
                
                # 检查错误
                if data.get("header", {}).get("code") != 0:
                    result["error"] = data["header"].get("message", "未知错误")
                    ws.close()
                    return

                # 提取文本内容
                choices = data.get("payload", {}).get("choices", {})
                text_list = choices.get("text", [])
                
                for text_item in text_list:
                    content = text_item.get("content", "")
                    result["content"] += content

                # 检查是否结束
                if choices.get("status") == 2:
                    ws.close()

            except Exception as e:
                result["error"] = str(e)
                ws.close()

        def on_error(ws, error):
            """错误回调"""
            result["error"] = str(error)

        def on_close(ws, close_status_code, close_msg):
            """连接关闭回调"""
            pass

        def on_open(ws):
            """连接建立回调"""
            # 发送请求数据
            ws.send(json.dumps(request_data))

        # 创建WebSocket连接
        websocket.enableTrace(False)
        ws = websocket.WebSocketApp(
            ws_url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )

        # 启动WebSocket连接（在子线程中运行）
        ws_thread = threading.Thread(target=ws.run_forever)
        ws_thread.daemon = True
        ws_thread.start()

        # 等待结果或超时
        ws_thread.join(timeout=timeout)

        # 如果还有错误，抛出异常
        if result["error"]:
            raise Exception(result["error"])

        return result["content"]

    def check_connection(self) -> bool:
        """检查API连接是否正常"""
        try:
            # 首先检查认证信息是否已配置（包括空字符串检查）
            if not self.app_id or not self.api_key or not self.api_secret:
                print("[警告] 讯飞星火图片理解API认证信息未配置")
                return False
            
            # 发送一个简单的测试请求
            test_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            result = self.analyze_image(
                image_base64=test_image,
                prompt="你好",
                timeout=10
            )
            return result.get("success", False)
        except Exception as e:
            print(f"[图片理解API连接检查失败] {e}")
            return False
