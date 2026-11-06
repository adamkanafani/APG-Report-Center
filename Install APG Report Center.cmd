@echo off
setlocal
title Install APG Report Center
rem ---------------------------------------------------------------------------------------------
rem  One-click install of the APG Report Center. Send this one file to someone (SharePoint, Teams,
rem  email); they double-click it and it:
rem    1. installs Node.js and Git if the computer doesn't have them (through winget),
rem    2. downloads the app to C:\Users\<them>\APG-Report-Center -- the same spot on every computer,
rem       outside OneDrive so its install files don't sync anywhere,
rem    3. installs and builds it, and
rem    4. puts the APG Report Center icon (the APG spire) on their desktop.
rem  Running it again on a computer that already has the app updates and repairs it.
rem  Written without labels/goto and stored with Windows line endings (see .gitattributes), so it
rem  runs the same whether it's downloaded from GitHub or copied from a share.
rem  For testing: APG_INSTALL_DIR overrides the install folder; APG_NO_DESKTOP=1 skips the desktop
rem  icon and the "open it now" question.
rem ---------------------------------------------------------------------------------------------
set "APP=%USERPROFILE%\APG-Report-Center"
if defined APG_INSTALL_DIR set "APP=%APG_INSTALL_DIR%"
set "REPO=https://github.com/adamkanafani/APG-Report-Center.git"
rem Node and Git installed a moment ago aren't on this window's PATH yet; their usual folders are.
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%LOCALAPPDATA%\Programs\Git\cmd"

echo ============================================
echo   Installing the APG Report Center
echo ============================================
echo.
echo This takes about 5 to 10 minutes. Leave this window open until it says it's done.
echo If Windows asks whether to allow an installer to make changes, click Yes.
echo.

echo [1/4] Checking for Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo       Not found -- installing Node.js...
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js couldn't be installed automatically. Your web browser will open the Node.js site:
  echo download the LTS version, install it with the default options, then run this file again.
  start "" https://nodejs.org
  echo.
  pause
  exit /b 1
)
echo       Node.js is ready.

echo [2/4] Checking for Git...
where git >nul 2>nul
if errorlevel 1 (
  echo       Not found -- installing Git...
  winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
)
where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo Git couldn't be installed automatically. Your web browser will open the Git site:
  echo download Git for Windows, install it with the default options, then run this file again.
  start "" https://git-scm.com/downloads
  echo.
  pause
  exit /b 1
)
echo       Git is ready.

echo [3/4] Downloading the APG Report Center...
if exist "%APP%\.git" (
  echo       Already on this computer -- getting the latest version.
  git -C "%APP%" pull
) else (
  git clone "%REPO%" "%APP%"
)
if errorlevel 1 (
  echo.
  echo The download didn't work. Check the internet connection and run this file again.
  echo If it says the folder already exists, rename or delete the APG-Report-Center folder in
  echo your user folder and run this file again.
  echo.
  pause
  exit /b 1
)

echo [4/4] Installing and building -- this is the slow part...
cd /d "%APP%"
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo.
  echo Installing the app's parts didn't finish. Run this file again; if it happens again, send a
  echo screenshot of this window to whoever sent you this file.
  echo.
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  echo.
  echo Building the app didn't finish. Send a screenshot of this window to whoever sent you this file.
  echo.
  pause
  exit /b 1
)

if "%APG_NO_DESKTOP%"=="1" (
  call scripts\make-shortcuts.cmd
) else (
  call scripts\make-shortcuts.cmd desktop
)

echo.
echo ============================================
echo   Done! The APG Report Center is installed.
echo   Open it any time with the "APG Report Center" icon on your desktop.
echo   To pin it: right-click the icon, Show more options, Pin to taskbar.
echo ============================================
echo.
if "%APG_NO_DESKTOP%"=="1" exit /b 0
choice /c YN /m "Open the APG Report Center now"
if not errorlevel 2 call "Start Report Center.bat"
endlocal
