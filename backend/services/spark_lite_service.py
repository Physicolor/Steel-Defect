#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Spark Lite Chat Service - 讯飞星火Lite文本对话API服务
功能：通过 WebSocket 调用讯飞星火Lite API，提供智能分析和建议
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


class SparkLiteService:
    """讯飞星火Lite文本对话服务"""

    def __init__(self, app_id: str = None, api_key: str = None, api_secret: str = None):
        # 从环境变量或参数读取认证信息
        self.app_id = app_id or os.environ.get('SPARK_LITE_APP_ID')
        self.api_key = api_key or os.environ.get('SPARK_LITE_API_KEY')
        self.api_secret = api_secret or os.environ.get('SPARK_LITE_API_SECRET')
        
        # 检查认证信息是否配置
        if not all([self.app_id, self.api_key, self.api_secret]):
            print("[警告] 讯飞星火Lite API认证信息未配置，请设置环境变量:")
            print("  - SPARK_LITE_APP_ID")
            print("  - SPARK_LITE_API_KEY")
            print("  - SPARK_LITE_API_SECRET")
            print("  或在 .env 文件中配置")
        else:
            print(f"[Spark Lite] 服务初始化完成")
            print(f"  - APPID: {self.app_id}")
            print(f"  - API Key: {self.api_key[:8]}...")
        
        # WebSocket 服务地址（Spark Lite）
        self.host = "spark-api.xf-yun.com"
        self.path = "/v1.1/chat"
        self.url = f"wss://{self.host}{self.path}"

    def _create_url(self) -> str:
        """生成带鉴权签名的WebSocket URL"""
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

    def analyze_defect_data(self, defect_stats: Dict, daily_stats: Dict, 
                           damage_ratio: Dict = None, confidence_distribution: List = None,
                           total_defects: int = 0, prompt: str = None, timeout: int = 60) -> Dict:
        """
        分析缺陷数据并提供建议

        Args:
            defect_stats: 缺陷统计数据 {缺陷类型: 数量}
            daily_stats: 每日统计数据 {日期: {'total': 总数, 'defect': 缺陷数}}
            damage_ratio: 损伤占比数据 {缺陷类型: {'avg_area_ratio': 平均面积占比, 'total_count': 出现次数}}
            confidence_distribution: 置信分布数据 [{'range': '区间', 'count': 数量, 'percentage': 百分比}]
            total_defects: 总缺陷数
            prompt: 自定义提示词（可选）
            timeout: 超时时间（秒）

        Returns:
            分析结果字典
        """
        try:
            # 构建默认提示词
            if not prompt:
                prompt = self._build_default_prompt(defect_stats, daily_stats, 
                                                   damage_ratio, confidence_distribution, total_defects)

            # 构建消息
            messages = [
                {
                    "role": "user",
                    "content": prompt
                }
            ]

            # 构建请求参数
            request_data = {
                "header": {
                    "app_id": self.app_id,
                    "uid": "steel_defect_system"
                },
                "parameter": {
                    "chat": {
                        "domain": "lite",  # Spark Lite
                        "temperature": 0.5,
                        "max_tokens": 2048,
                        "top_k": 4
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

            # 清理返回文本
            cleaned_result = self._clean_output(result)

            return {
                "success": True,
                "analysis": cleaned_result,
                "model": "Spark Lite"
            }

        except Exception as e:
            print(f"[Spark Lite调用失败] {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "model": "Spark Lite"
            }

    def _build_default_prompt(self, defect_stats: Dict, daily_stats: Dict,
                             damage_ratio: Dict = None, confidence_distribution: List = None,
                             total_defects: int = 0) -> str:
        """构建默认的分析提示词"""
        
        # 构建缺陷统计描述
        defect_desc = "【缺陷类型统计】\n"
        if defect_stats:
            # 兼容两种格式: {name: count} 或 {name: {count, confidences}}
            normalized = {}
            for defect_type, val in defect_stats.items():
                if isinstance(val, dict):
                    normalized[defect_type] = val.get('count', 0)
                else:
                    normalized[defect_type] = int(val)
            for defect_type, count in sorted(normalized.items(), key=lambda x: x[1], reverse=True):
                defect_desc += f"- {defect_type}: {count}次\n"
        else:
            defect_desc += "- 暂无缺陷数据\n"

        # 构建每日统计描述
        daily_desc = "\n【近期每日检测统计】（最近7天）\n"
        if daily_stats:
            # 取最近7天
            recent_days = list(daily_stats.items())[-7:]
            for date, stats in recent_days:
                if isinstance(stats, dict):
                    total = stats.get('total', 0)
                    defect = stats.get('defect', 0)
                else:
                    # stats 是整数（检测次数）
                    total = int(stats)
                    defect = int(stats)  # 每次检测都算有缺陷
                defect_rate = (defect / total * 100) if total > 0 else 0
                daily_desc += f"- {date}: 检测{total}张，缺陷{defect}张，缺陷率{defect_rate:.1f}%\n"
        else:
            daily_desc += "- 暂无统计数据\n"
        
        # 构建损伤占比描述
        damage_desc = "\n【损伤占比分析】（检测框占据整张图片的面积比例）\n"
        if damage_ratio:
            for defect_type, stats in sorted(damage_ratio.items(), key=lambda x: x[1]['avg_area_ratio'], reverse=True):
                avg_ratio = stats.get('avg_area_ratio', 0)
                count = stats.get('total_count', 0)
                damage_desc += f"- {defect_type}: 平均面积占比{avg_ratio}%，出现{count}次\n"
        else:
            damage_desc += "- 暂无数据\n"
        
        # 构建置信分布描述
        confidence_desc = "\n【置信度分布】（所有缺陷的置信度在五个区间的分布）\n"
        if confidence_distribution and total_defects > 0:
            confidence_desc += f"总缺陷数: {total_defects}个\n"
            for item in confidence_distribution:
                range_label = item.get('range', '')
                count = item.get('count', 0)
                percentage = item.get('percentage', 0)
                confidence_desc += f"- {range_label}: {count}个 ({percentage}%)\n"
        else:
            confidence_desc += "- 暂无数据\n"

        prompt = f"""你是钢材质量检测专家。请根据以下检测数据，提供专业的质量分析和改进建议。

{defect_desc}
{daily_desc}
{damage_desc}
{confidence_desc}

请按以下5个部分输出分析报告：

【整体质量评估】
- 综合评估当前钢材质量状况
- 指出主要质量问题
- 结合缺陷率和损伤占比进行评价

【缺陷趋势分析】
- 分析缺陷类型的分布特征
- 识别高频缺陷类型和高损伤占比缺陷
- 分析缺陷率的变化趋势
- 结合置信度分布评估检测可靠性

【关键问题诊断】
- 重点分析高损伤占比的缺陷类型（说明其对产品质量的影响程度）
- 分析低置信度缺陷的可能原因（是否需要人工复核）
- 识别需要优先处理的质量问题

【改进建议】
- 针对主要缺陷类型提出具体改进措施
- 针对高损伤占比缺陷提出工艺优化建议
- 生产工艺优化建议
- 质量控制加强点

【预防措施】
- 长期预防策略
- 定期检测建议
- 人员培训重点
- 检测设备校准建议

要求：
- 直接给出分析结果，不要开场白
- 每部分控制在100-150字以内
- 使用专业术语但要易懂
- 不要使用Markdown标题符号(####、**等)
- 重点突出关键信息
- 基于数据给出具体建议
- 特别关注高损伤占比的缺陷类型
- 结合置信度分布评估检测结果的可靠性"""

        return prompt

    def _clean_output(self, text: str) -> str:
        """清理AI输出文本"""
        if not text:
            return ""
        
        # 删除无意义的换行（连续多个换行变为一个）
        import re
        text = re.sub(r'\n\s*\n', '\n', text)
        
        # 删除行首行尾空白
        lines = [line.strip() for line in text.split('\n')]
        text = '\n'.join(lines)
        
        # 删除空行
        lines = [line for line in text.split('\n') if line.strip()]
        text = '\n'.join(lines)
        
        return text

    def _call_websocket(self, request_data: Dict, timeout: int = 60) -> str:
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
            # 发送一个简单的测试请求
            result = self.analyze_defect_data(
                defect_stats={"测试": 1},
                daily_stats={},
                prompt="你好，请回复OK",
                timeout=10
            )
            return result.get("success", False)
        except Exception as e:
            print(f"[Spark Lite连接检查失败] {e}")
            return False
