@echo off
chcp 65001 >nul
title 钢材缺陷检测系统

echo ================================
echo   钢材缺陷检测系统 v2.0
echo ================================
echo.

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        echo [错误] 未检测到 Python，请先安装 Python 3.10+
        pause & exit /b 1
    ) else (
        set PYTHON=py
    )
) else (
    set PYTHON=python
)

:: 检查依赖
%PYTHON% -c "import flask, cv2, ultralytics" 2>nul
if errorlevel 1 (
    echo [提示] 正在安装依赖包（首次运行可能需要几分钟）...
    %PYTHON% -m pip install -r requirements.txt --quiet
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请手动执行: pip install -r requirements.txt
        pause & exit /b 1
    )
    echo [完成] 依赖安装成功
)

echo.
echo [启动] 服务地址: http://localhost:5000
echo [停止] 按 Ctrl+C 终止服务
echo.

%PYTHON% app.py

pause
