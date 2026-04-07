@echo off
setlocal

set PORT=3210
set PIDFILE=%~dp0config\flutterboard.pid

if not exist "%~dp0config" mkdir "%~dp0config"

:: Stop existing process via PID file
if exist "%PIDFILE%" (
    set /p OLD_PID=<"%PIDFILE%"
    taskkill /PID %OLD_PID% /F >nul 2>&1
    del "%PIDFILE%"
)

:: Stop any process listening on the port
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Starting FlutterBoard...

start /b node "%~dp0server\index.js" --port %PORT% > "%~dp0config\server.log" 2>&1

timeout /t 1 /nobreak >nul

for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list ^| findstr PID') do (
    set LAST_PID=%%a
)
echo %LAST_PID% > "%PIDFILE%"

timeout /t 2 /nobreak >nul

start http://localhost:%PORT%

echo FlutterBoard started on http://localhost:%PORT% (PID: %LAST_PID%)
echo Run stop.cmd to shut down.
