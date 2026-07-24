@echo off
chcp 936 >nul
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" "%~dp0scripts\legal-syntax-server.cjs"
pause
