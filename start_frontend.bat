@echo off
chcp 65001 >nul

echo ========================================
echo 钢材缺陷检测系统 - 前端启动脚本
echo ========================================

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到Node.js，请先安装Node.js 18+
    pause
    exit /b 1
)

REM 检查依赖是否安装
echo 正在检查依赖...
if not exist "frontend\node_modules" (
    echo 正在安装依赖...
    cd frontend
    npm install --registry https://registry.npmmirror.com
    cd ..
)

REM 启动前端服务
echo 正在启动前端服务...
cd frontend
npm start

pause
