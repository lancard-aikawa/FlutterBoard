@echo off
setlocal

set PORT=3210
set PIDFILE=%~dp0config\flutterboard.pid
set LOGFILE=%~dp0config\server.log

if not exist "%~dp0config" mkdir "%~dp0config"

:: Stop via PID file
if exist "%PIDFILE%" (
    set /p OLD_PID=<"%PIDFILE%"
    taskkill /PID %OLD_PID% /F >nul 2>&1
    del "%PIDFILE%"
)

:: Stop anything on the port
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Wait for port to be released
timeout /t 2 /nobreak >nul

:: Confirm port is free
netstat -ano 2>nul | findstr ":%PORT% " | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo ERROR: Port %PORT% is still in use. Please try again.
    exit /b 1
)

echo Starting FlutterBoard...

:: Launch via PowerShell to capture PID reliably
powershell -NoProfile -Command ^
  "$p = Start-Process node -ArgumentList '%~dp0server\index.js','--port','%PORT%' -WorkingDirectory '%~dp0' -RedirectStandardOutput '%LOGFILE%' -RedirectStandardError '%LOGFILE%' -WindowStyle Hidden -PassThru; $p.Id | Out-File -Encoding ascii '%PIDFILE%'"

if %errorlevel% neq 0 (
    echo ERROR: Failed to start FlutterBoard.
    exit /b 1
)

:: Wait for server to be ready
timeout /t 2 /nobreak >nul

:: Verify it is actually listening
netstat -ano 2>nul | findstr ":%PORT% " | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo ERROR: Server did not start. Check config\server.log for details.
    exit /b 1
)

start http://localhost:%PORT%

set /p PID=<"%PIDFILE%"
echo FlutterBoard started on http://localhost:%PORT% (PID: %PID%)
echo Run stop.cmd to shut down.
