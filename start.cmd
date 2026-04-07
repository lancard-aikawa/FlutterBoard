@echo off
setlocal

set PORT=3210
set PIDFILE=%~dp0config\flutterboard.pid

:: config フォルダを作成
if not exist "%~dp0config" mkdir "%~dp0config"

:: 既存プロセスを停止
if exist "%PIDFILE%" (
    set /p OLD_PID=<"%PIDFILE%"
    taskkill /PID %OLD_PID% /F >nul 2>&1
    del "%PIDFILE%"
)

:: ポート 3210 を使用中のプロセスも念のため停止
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo FlutterBoard を起動中...

:: バックグラウンドで起動し PID を取得
start /b node "%~dp0server\index.js" --port %PORT% > "%~dp0config\server.log" 2>&1

:: PID を保存（起動直後の node プロセスを特定）
timeout /t 1 /nobreak >nul
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list ^| findstr PID') do (
    set LAST_PID=%%a
)
echo %LAST_PID% > "%PIDFILE%"

:: 起動待ち
timeout /t 2 /nobreak >nul

:: ブラウザで開く
echo ブラウザを開いています: http://localhost:%PORT%
start http://localhost:%PORT%

echo.
echo FlutterBoard が起動しました（PID: %LAST_PID%）
echo 停止するには stop.cmd を実行してください。
