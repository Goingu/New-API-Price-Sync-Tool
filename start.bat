@echo off
chcp 65001 >nul
echo ========================================
echo   NewAPI Price Sync - 一键启动
echo ========================================
echo.

REM 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [1/3] 首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo.
        echo 依赖安装失败，请检查网络连接或 npm 配置
        pause
        exit /b 1
    )
) else (
    echo [1/3] 依赖已安装
)

echo.
echo [2/3] 正在启动后端服务...
start "NewAPI Server" cmd /k "npm run dev:server"

timeout /t 2 /nobreak >nul

echo [3/3] 正在启动前端应用...
start "NewAPI Web" cmd /k "npm run dev:web"

echo.
echo ========================================
echo   启动完成！
echo ========================================
echo   后端服务窗口: NewAPI Server
echo   前端应用窗口: NewAPI Web
echo.
echo   关闭此窗口不会影响服务运行
echo   要停止服务，请关闭对应的窗口
echo ========================================
echo.
pause
