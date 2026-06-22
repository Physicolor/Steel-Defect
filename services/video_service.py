#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VideoService - 摄像头/视频流打开工具"""
import cv2
import time

def open_camera(source, timeout=3.0):
    """
    打开摄像头源
    - int: 本地摄像头索引（0=默认摄像头, 1=外接摄像头）
    - str: IP摄像头 URL（http://... / rtsp://...）
    - timeout: 超时时间（秒），默认3秒
    """
    start_time = time.time()
    
    if isinstance(source, str) and source.startswith(('http://', 'https://', 'rtsp://')):
        print(f"[摄像头] 连接 IP摄像头: {source}")
        cap = cv2.VideoCapture(source)
    else:
        print(f"[摄像头] 连接本地摄像头: {source}")
        # 【优化】尝试多个后端，优先使用 MSMF（Windows Media Foundation）
        backends = [cv2.CAP_MSMF, cv2.CAP_DSHOW, cv2.CAP_ANY]
        cap = None
        
        for backend in backends:
            try:
                backend_name = {
                    cv2.CAP_MSMF: "MSMF",
                    cv2.CAP_DSHOW: "DSHOW",
                    cv2.CAP_ANY: "ANY"
                }.get(backend, "UNKNOWN")
                
                print(f"[摄像头] 尝试后端: {backend_name}")
                cap = cv2.VideoCapture(source, backend)
                
                # 检查是否成功打开
                if cap.isOpened():
                    print(f"[摄像头] 后端 {backend_name} 成功")
                    break
                else:
                    cap.release()
                    cap = None
                    print(f"[摄像头] 后端 {backend_name} 失败，尝试下一个...")
            except Exception as e:
                print(f"[摄像头] 后端 {backend_name} 异常: {e}")
                if cap:
                    cap.release()
                cap = None
        
        if not cap:
            raise RuntimeError(f"无法打开摄像头: {source}（所有后端均失败）")

    # 优化参数：降低分辨率，减少延迟
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)   # 缓冲区仅保留1帧，避免卡顿
    cap.set(cv2.CAP_PROP_FPS, 30)         # 设置帧率
    
    # 【关键】等待摄像头就绪，最多等待 timeout 秒
    ready = False
    while time.time() - start_time < timeout:
        ret, frame = cap.read()
        if ret and frame is not None:
            ready = True
            print(f"[摄像头] 已就绪（耗时 {time.time() - start_time:.2f}s）")
            break
        time.sleep(0.1)
    
    if not ready:
        cap.release()
        raise RuntimeError(f"摄像头启动超时: {source}")
    
    return cap
