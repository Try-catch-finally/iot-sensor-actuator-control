@echo off
setlocal enabledelayedexpansion
title IoT 传感器与执行器控制 - 启动器
cd /d "%~dp0"

echo ============================================
echo   物联网应用技术-传感器与执行器控制
echo ============================================
echo.

REM ---- 用法: start.bat [dev|build|check] ----
set MODE=%~1
if "%MODE%"=="" set MODE=dev

REM ---- 环境检查模式 ----
if /i "%MODE%"=="check" (
    where node >nul 2>nul
    if errorlevel 1 (
        echo [错误] 未检测到 Node.js
        exit /b 1
    )
    for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
    echo [OK] Node.js 版本: !NODE_VER!
    if exist node_modules (echo [OK] 依赖已安装) else (echo [警告] 依赖未安装，请运行 start.bat)
    exit /b 0
)

REM ---- 检查 Node.js ----
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js ^(node^) 环境
    echo        请先安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js 版本: !NODE_VER!

REM ---- 检查依赖（首次运行自动安装）----
if not exist "node_modules" (
    echo.
    echo [首次运行] 正在安装依赖，请稍候...
    call npm install
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败，请检查网络后重试
        pause
        exit /b 1
    )
    echo.
    echo [OK] 依赖安装完成
)

REM ---- 生产模式：构建 + 预览 ----
if /i "%MODE%"=="build" (
    echo.
    echo [构建] 正在构建生产版本...
    call npm run build
    if errorlevel 1 (
        echo [错误] 构建失败
        pause
        exit /b 1
    )
    echo.
    echo [预览] 生产版本预览地址: http://localhost:4173
    echo        按 Ctrl+C 可停止预览服务器
    echo.
    start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:4173"
    call npm run preview
    exit /b 0
)

REM ---- 开发模式：启动 Vite ----
if /i "%MODE%"=="dev" (
    echo.
    echo [启动] 开发服务器地址: http://localhost:5173
    echo        按 Ctrl+C 可停止服务器
    echo.
    start "" /min cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5173"
    call npm run dev
    exit /b 0
)

echo [错误] 未知参数: %MODE% ^(可用: dev / build / check^)
pause
exit /b 1
