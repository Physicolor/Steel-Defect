@echo off
setlocal enabledelayedexpansion
REM --- Auto-detect conda, or set CONDA_BIN/CONDA_ENV env vars to override ---
if not defined CONDA_BIN (
    where conda >nul 2>nul
    if %errorlevel%==0 (
        for /f "delims=" %%i in ('where conda') do set "CONDA_BIN=%%i"
    ) else if exist "%USERPROFILE%\miniconda3\condabin\conda.bat" (
        set "CONDA_BIN=%USERPROFILE%\miniconda3\condabin\conda.bat"
    ) else if exist "%USERPROFILE%\anaconda3\condabin\conda.bat" (
        set "CONDA_BIN=%USERPROFILE%\anaconda3\condabin\conda.bat"
    ) else if exist "C:\ProgramData\miniconda3\condabin\conda.bat" (
        set "CONDA_BIN=C:\ProgramData\miniconda3\condabin\conda.bat"
    )
)
set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

set "PATH=%CONDA_ENV%;%CONDA_ENV%\Scripts;%CONDA_ENV%\Library\bin;%PATH%"

echo.
echo  ==============================
echo    Steel Defect Detection System
echo  ==============================
echo.
echo  [1] Start Backend  (FastAPI :8000)
echo  [2] Exit
echo.
set /p choice="Select (1-2): "

if "%choice%"=="1" goto backend
if "%choice%"=="2" goto done
echo Invalid choice.
pause
goto done

:backend
echo.
echo [INFO] Starting FastAPI on port 8000...
pushd "%PROJECT_ROOT%"
python start.py
popd
goto done

:done
endlocal
pause
