@echo off
chcp 936 >nul
setlocal

title Translation AIducator Backend
cd /d "%~dp0"

set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined PORT set "PORT=8765"

echo Translation AIducator backend
echo Address: http://127.0.0.1:%PORT%
echo Keep this window open while using the application.
echo.

"%NODE_EXE%" "%~dp0dist\server\src\main.js"
set "BACKEND_EXIT=%ERRORLEVEL%"

echo.
echo Backend stopped with exit code %BACKEND_EXIT%.
echo Press any key to close this window.
pause >nul
endlocal
exit /b %BACKEND_EXIT%