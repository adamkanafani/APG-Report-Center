@echo off
cd /d "%~dp0"
title APG Report Center - Setup
echo ============================================
echo   APG Report Center - First-Time Setup
echo ============================================
echo.
echo Checking for Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed on this computer.
  echo Please install it first from https://nodejs.org ^(choose the "LTS" version,
  echo click Next through the installer with the default options^), then run this
  echo file again.
  echo.
  pause
  exit /b 1
)
echo Node.js found.
echo.
echo Installing app dependencies - this can take a few minutes the first time...
call npm install
if errorlevel 1 (
  echo.
  echo Something went wrong installing dependencies. Scroll up to see the error,
  echo or send a screenshot of this window to whoever set this up.
  pause
  exit /b 1
)
echo.
echo Building the app for first use...
call npm run build
if errorlevel 1 (
  echo.
  echo Something went wrong building the app. Scroll up to see the error,
  echo or send a screenshot of this window to whoever set this up.
  pause
  exit /b 1
)
echo.
echo Adding the APG Report Center icon to your desktop...
call scripts\make-shortcuts.cmd desktop
echo.
echo ============================================
echo   Setup complete!
echo   From now on, just double-click "APG Report Center" on your desktop
echo   (or "Start Report Center.bat" in this folder) to run the app.
echo ============================================
pause
