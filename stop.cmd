@echo off
setlocal

set PORT=3210
set PIDFILE=%~dp0config\flutterboard.pid

if exist "%PIDFILE%" (
    set /p PID=<"%PIDFILE%"
    taskkill /PID %PID% /F >nul 2>&1
    if %errorlevel% equ 0 (
        echo FlutterBoard stopped. (PID: %PID%)
    ) else (
        echo Process already stopped.
    )
    del "%PIDFILE%"
) else (
    echo PID file not found. Searching by port...
)

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
    echo Stopped process on port %PORT% (PID: %%a)
)

echo Done.
