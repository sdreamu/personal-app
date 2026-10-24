@echo off
setlocal
cd /d "%~dp0"

set "DSH_NODE=C:\Users\admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
set "DSH_PNPM=C:\Users\admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"

rem 优先用系统 Node/pnpm；两者都缺失时回退到 DSH 内置运行时
where node >nul 2>nul && where pnpm >nul 2>nul
if errorlevel 1 goto :fallback

set "PNPM_LAUNCH=pnpm"
set "RUNTIME_DESC=system node"
goto :start

:fallback
if not exist "%DSH_NODE%" goto :noruntime
if not exist "%DSH_PNPM%" goto :noruntime
set "PNPM_LAUNCH="%DSH_NODE%" "%DSH_PNPM%""
set "RUNTIME_DESC=DSH bundled runtime"

:start
echo ============================================
echo  Evan APP  starting...
echo  Runtime: %RUNTIME_DESC%
echo  Open in Chrome/Edge:  http://127.0.0.1:5173
echo  (Close this window to stop the app)
echo ============================================
%PNPM_LAUNCH% run dev
pause
exit /b 0

:noruntime
echo [ERROR] No usable Node runtime found.
echo   - node/pnpm are not on PATH, and
echo   - the DSH bundled runtime is missing: %DSH_NODE%
echo Install Node.js LTS from https://nodejs.org and run this file again.
pause
exit /b 1
