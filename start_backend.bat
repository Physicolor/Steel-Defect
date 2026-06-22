@echo off
chcp 65001 >nul

echo ========================================
echo 钢材缺陷检测系统 - 后端启动脚本
echo ========================================

REM 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到Python，请先安装Python 3.10+
    pause
    exit /b 1
)

REM 检查依赖是否安装
echo 正在检查依赖...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo 正在安装依赖...
    pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
)

REM 检查.env文件
if not exist ".env" (
    echo 提示: 未找到.env文件，将使用默认配置
    echo 建议复制.env.example为.env并修改配置
    copy .env.example .env
)

REM 启动后端服务
echo 正在启动后端服务...
python start.py --reload

pause
