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

:: Launch node in background (PID file is written by the server itself on startup)
start /b node "%~dp0server\index.js" --port %PORT% >> "%LOGFILE%" 2>&1

:: Wait for server to write PID file and begin listening
timeout /t 3 /nobreak >nul

:: Verify it is listening
netstat -ano 2>nul | findstr ":%PORT% " | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo ERROR: Server did not start. Check config\server.log for details.
    exit /b 1
)

start http://localhost:%PORT%

if exist "%PIDFILE%" (
    set /p PID=<"%PIDFILE%"
    echo FlutterBoard started on http://localhost:%PORT% (PID: %PID%^)
) else (
    echo FlutterBoard started on http://localhost:%PORT%
)
echo Run stop.cmd to shut down.
