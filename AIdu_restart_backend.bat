@echo off
chcp 936 >nul
setlocal

cd /d "%~dp0"

set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if defined PORT (
    set "BACKEND_PORT=%PORT%"
) else (
    set "BACKEND_PORT=8765"
)

if not exist "%NODE_EXE%" (
    echo Node.js was not found: %NODE_EXE%
    timeout /t 3 /nobreak >nul
    exit /b 1
)

if not exist "%~dp0node_modules\typescript\bin\tsc" (
    echo Dependencies are missing. Run npm install first.
    timeout /t 3 /nobreak >nul
    exit /b 1
)

echo Stopping Translation AIducator backend processes...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root = (Resolve-Path -LiteralPath '%~dp0').Path.TrimEnd('\'); $targets = New-Object 'System.Collections.Generic.HashSet[int]'; $pidPath = Join-Path $root 'logs\backend.pid'; if (Test-Path -LiteralPath $pidPath) { $savedPid = 0; if ([int]::TryParse(([IO.File]::ReadAllText($pidPath).Trim()), [ref]$savedPid)) { [void]$targets.Add($savedPid) } }; $markers = @(); $markers += $root + '\AIdu_backend_console.bat'; $markers += $root + '\dist\server\src\main.js'; $markers += $root + '\server\src\main.ts'; foreach ($processInfo in @(Get-CimInstance Win32_Process)) { if ($processInfo.ProcessId -eq $PID) { continue }; $commandLine = [string]$processInfo.CommandLine; foreach ($marker in $markers) { if ($commandLine.IndexOf($marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) { [void]$targets.Add([int]$processInfo.ProcessId); break } } }; foreach ($connection in @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)) { try { $owner = Get-Process -Id $connection.OwningProcess -ErrorAction Stop; if ($owner.ProcessName -ne 'node') { continue }; $health = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $connection.LocalPort + '/api/health') -TimeoutSec 1; if ($health.ok -eq $true -and $null -ne $health.release -and $null -ne $health.sqliteVersion) { [void]$targets.Add([int]$connection.OwningProcess) } } catch {} }; foreach ($targetPid in $targets) { Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue }; Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue"

ping -n 2 127.0.0.1 >nul

echo Building backend...
"%NODE_EXE%" "%~dp0node_modules\typescript\bin\tsc" -p "%~dp0tsconfig.json"
if errorlevel 1 (
    echo Backend build failed.
    timeout /t 3 /nobreak >nul
    exit /b 1
)

echo Starting backend...
start "Translation AIducator Backend" "%ComSpec%" /d /c ""%~dp0AIdu_backend_console.bat""
if errorlevel 1 (
    echo Backend process could not be started.
    timeout /t 3 /nobreak >nul
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(12); do { try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%BACKEND_PORT%/api/health' -TimeoutSec 1; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 300 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
    echo Backend did not become healthy. Check the backend CMD window.
    timeout /t 3 /nobreak >nul
    exit /b 1
)

echo Backend restarted successfully on port %BACKEND_PORT%.
endlocal
exit /b 0
