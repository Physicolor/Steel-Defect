@echo off
chcp 65001 >nul
title 钢材缺陷检测系统 (Conda Torch 环境)

echo ================================
echo   钢材缺陷检测系统 v2.0
echo   使用 Conda Torch 环境
echo ================================
echo.

:: 检查 conda 是否可用
where conda >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 conda，请确保已安装 Anaconda/Miniconda
    pause & exit /b 1
)

:: 激活 torch 环境
echo [环境] 正在激活 conda torch 环境...
call conda activate torch
if errorlevel 1 (
    echo [错误] 无法激活 torch 环境，请先创建: conda create -n torch python=3.10
    pause & exit /b 1
)
echo [完成] 环境激活成功

:: 检查 Python 版本
python --version
echo.

:: 检查依赖
echo [检查] 验证依赖包...
python -c "import flask, cv2, ultralytics, torch" 2>nul
if errorlevel 1 (
    echo [提示] 正在安装依赖包（首次运行可能需要几分钟）...
    pip install -r requirements.txt --quiet
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请手动执行: pip install -r requirements.txt
        pause & exit /b 1
    )
    echo [完成] 依赖安装成功
) else (
    echo [完成] 依赖检查通过
)

echo.
echo [启动] 服务地址: http://localhost:5000
echo [停止] 按 Ctrl+C 终止服务
echo.

:: 启动应用
python app.py

pause
