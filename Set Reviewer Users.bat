@echo off
cd /d "%~dp0"
title APG Report Center - Set Reviewer Users
echo ============================================
echo   APG Report Center - ATS Report Reviewer users
echo ============================================
echo.
echo Sets the Anthropic API key and the reviewers (user name and password)
echo who can sign in to the ATS Report Reviewer on this computer.
echo.
rem Node installed a moment ago isn't on this window's PATH yet; its usual folder is.
set "PATH=%PATH%;%ProgramFiles%\nodejs"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed on this computer, so this can't run yet.
  echo Run "Install APG Report Center.cmd" first, then run this file again.
  echo.
  pause
  exit /b 1
)
if not exist "scripts\set-reviewer-users.mjs" (
  echo This folder doesn't have the reviewer setup in it -- it may be an old copy of the app.
  echo Run "Install APG Report Center.cmd" to get the current version, then run this file
  echo from C:\Users\%USERNAME%\APG-Report-Center.
  echo.
  pause
  exit /b 1
)
call node scripts\set-reviewer-users.mjs
if errorlevel 1 (
  echo.
  echo Something went wrong above -- send a screenshot of this window to whoever set this up.
)
echo.
pause
