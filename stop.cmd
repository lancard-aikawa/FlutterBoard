@echo off
setlocal

set PORT=3210
set PIDFILE=%~dp0config\flutterboard.pid

:: PID ファイルから停止
if exist "%PIDFILE%" (
    set /p PID=<"%PIDFILE%"
    taskkill /PID %PID% /F >nul 2>&1
    if %errorlevel% equ 0 (
        echo FlutterBoard を停止しました（PID: %PID%）
    ) else (
        echo プロセスは既に停止しています。
    )
    del "%PIDFILE%"
) else (
    echo PID ファイルが見つかりません。ポートで検索します...
)

:: ポートで検索して念のため停止
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
    echo ポート %PORT% のプロセス（PID: %%a）を停止しました。
)

echo 完了。
