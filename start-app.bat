@echo off
setlocal
set "PATH=C:\Users\admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;%PATH%"
cd /d "%~dp0"
echo ============================================
echo  Evan APP  starting...
echo  Open in Chrome/Edge:  http://127.0.0.1:5173
echo  (Close this window to stop the app)
echo ============================================
"C:\Users\admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" "C:\Users\admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs" run dev
pause
