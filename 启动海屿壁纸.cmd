@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "output\desktop\海屿壁纸\海屿壁纸.exe" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "desktop\build.ps1"
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "" "output\desktop\海屿壁纸\海屿壁纸.exe" --manage
