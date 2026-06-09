@echo off
setlocal enabledelayedexpansion
set "CONDA_ENV=D:\Users\12404\anaconda3\envs\torch"
set "CONDA_BIN=D:\Users\12404\anaconda3\condabin\conda.bat"
set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

set "PATH=%CONDA_ENV%;%CONDA_ENV%\Scripts;%CONDA_ENV%\Library\bin;%PATH%"

echo.
echo  ==============================
echo    Steel Defect Detection System
echo  ==============================
echo.
echo  [1] Start Backend  (FastAPI :8000)
echo  [2] Start Frontend (React :3000)
echo  [3] Start All
echo  [4] Exit
echo.
set /p choice="Select (1-4): "

if "%choice%"=="1" goto backend
if "%choice%"=="2" goto frontend
if "%choice%"=="3" goto all
if "%choice%"=="4" goto done
echo Invalid choice.
pause
goto done

:backend
echo.
echo [INFO] Starting FastAPI on port 8000...
pushd "%PROJECT_ROOT%\backend"
python start.py
popd
goto done

:frontend
echo.
echo [INFO] Starting React on port 3000...
pushd "%PROJECT_ROOT%\frontend"
npm start
popd
goto done

:all
echo.
echo [INFO] Writing launcher script...
> "%TEMP%\start_backend.bat" (
    echo @echo off
    echo set "PATH=%CONDA_ENV%;%CONDA_ENV%\Scripts;%CONDA_ENV%\Library\bin;%%PATH%%"
    echo cd /d "%PROJECT_ROOT%\backend"
    echo python start.py
    echo pause
)
echo [INFO] Starting FastAPI on port 8000...
start "FastAPI" "%TEMP%\start_backend.bat"
timeout /t 5 /nobreak >nul
echo [INFO] Opening browser...
start "" "http://localhost:8000/login"
echo [INFO] Starting React on port 3000...
pushd "%PROJECT_ROOT%\frontend"
npm start
popd
goto done

:done
endlocal
pause
