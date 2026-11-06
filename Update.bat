@echo off
title APG Report Center - Update
echo ============================================
echo   APG Report Center - Update
echo ============================================
echo.
echo Downloading the latest version...
call git pull
if errorlevel 1 (
  echo.
  echo Could not update automatically. If this folder wasn't set up with git
  echo (e.g. it was copied as a ZIP), download a fresh copy instead and ask
  echo whoever set this up for help.
  echo.
  pause
  exit /b 1
)
echo.
echo Installing any new dependencies...
call npm install
echo.
echo Rebuilding the app...
call npm run build
echo.
echo Refreshing the "APG Report Center" shortcut in this folder...
call scripts\make-shortcuts.cmd
echo.
echo ============================================
echo   Update complete! Your saved job reviews were not affected.
echo ============================================
pause
