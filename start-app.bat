@echo off
setlocal
cd /d "%~dp0"

rem 用系统 Node/pnpm 启动开发服务器（首次需先 pnpm install）
where node >nul 2>nul || goto :noruntime
where pnpm >nul 2>nul || goto :noruntime

echo ============================================
echo  App starting...
echo  Open in Chrome/Edge:  http://127.0.0.1:5173
echo  (Close this window to stop the app)
echo ============================================
call pnpm run dev
pause
exit /b 0

:noruntime
echo [ERROR] node / pnpm not found on PATH.
echo   Install Node.js LTS from https://nodejs.org then run: corepack enable
pause
exit /b 1
