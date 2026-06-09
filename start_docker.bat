@echo off
chcp 65001 >nul

echo ========================================
echo Steel Defect Detection System - Docker
echo ========================================

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo Error: Docker not found. Please install Docker Desktop
    pause
    exit /b 1
)

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo Error: Docker Compose not found. Please install Docker Compose
    pause
    exit /b 1
)

REM Check .env file
if not exist "backend\.env" (
    echo Info: .env file not found, using default config
    copy backend\.env.example backend\.env
)

REM Parse arguments
set MODE=%1
if "%MODE%"=="" set MODE=dev

echo Starting mode: %MODE%

REM Start Docker services
if "%MODE%"=="dev" (
    echo Starting development environment...
    docker-compose -f docker/docker-compose.dev.yml up -d
) else if "%MODE%"=="prod" (
    echo Starting production environment...
    docker-compose -f docker/docker-compose.yml up -d
) else (
    echo Error: Unknown mode %MODE%
    echo Available modes: dev, prod
    pause
    exit /b 1
)

echo.
echo Services started successfully!
echo.
echo Access URLs:
echo   Frontend: http://localhost:3000
echo   Backend: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo   ChromaDB: http://localhost:8001
echo.
echo View logs: docker-compose logs -f
echo Stop services: docker-compose down
echo.

pause
