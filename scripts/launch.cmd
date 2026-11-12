@echo off
setlocal
rem ---------------------------------------------------------------------------------------------
rem  What the APG Report Center desktop icon runs (through Start Report Center.bat, which runs a
rem  copy of this file from %TEMP% so an update rewriting the app folder can't trip it up):
rem    1. If the app is already running, just opens it in the browser.
rem    2. Otherwise checks GitHub for a newer version. If there is one, installs it in a window
rem       of its own ("Updating") before starting -- so nobody has to remember Update.bat.
rem       No internet (or no Git): skips the check and starts the version already here.
rem    3. Starts the server window and opens the browser.
rem  Usage: launch.cmd <app folder>          (normal start)
rem         launch.cmd <app folder> update   (the update step, run in its own window)
rem  For testing: APG_NO_START=1 runs the update in this window and doesn't start the app;
rem  APG_PORT checks a port other than 3002.
rem ---------------------------------------------------------------------------------------------
set "APP=%~1"
if not defined APP set "APP=%~dp0.."
cd /d "%APP%"
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%LOCALAPPDATA%\Programs\Git\cmd"
if not defined APG_PORT set "APG_PORT=3002"
if /i "%~2"=="update" goto update

title APG Report Center - Launcher

rem 1. Already running? Just open it.
netstat -ano | findstr /r /c:":%APG_PORT% .*LISTENING" >nul
if not errorlevel 1 (
  if "%APG_NO_START%"=="1" (echo [test] already running -- would open the browser) else (start "" http://localhost:%APG_PORT%)
  exit /b 0
)

rem 2. Newer version on GitHub? (quiet; any failure means "no update right now")
where git >nul 2>nul
if errorlevel 1 goto start
if not exist ".git" goto start
echo Checking for updates...
git fetch -q origin main >nul 2>nul
if errorlevel 1 goto start
set "BEHIND=0"
for /f %%c in ('git rev-list --count HEAD..origin/main 2^>nul') do set "BEHIND=%%c"
if "%BEHIND%"=="0" goto start
if "%APG_NO_START%"=="1" (
  call "%~f0" "%APP%" update
) else (
  start "APG Report Center - Updating" /wait cmd /c ""%~f0" "%APP%" update"
)

:start
rem 3. Start the app.
if "%APG_NO_START%"=="1" (
  echo [test] would start the app now
  exit /b 0
)
if not exist ".next\BUILD_ID" (
  echo The app hasn't been built on this computer yet. Double-click
  echo "Setup - Run This First.bat" in the APG-Report-Center folder first.
  echo.
  pause
  exit /b 1
)
start "APG Report Center - Server (leave this open)" cmd /k "npm run start -- -p %APG_PORT%"
timeout /t 5 /nobreak >nul
start "" http://localhost:%APG_PORT%
exit /b 0

:update
title APG Report Center - Updating
echo ============================================
echo   Updating the APG Report Center
echo ============================================
echo.
echo A new version is available. This takes a minute or two -- the app opens
echo on its own when it's done.
echo.
rem npm can rewrite the lock file on install; drop that so the update can apply.
git checkout -- package-lock.json >nul 2>nul
git pull --ff-only -q origin main
if errorlevel 1 (
  echo.
  echo The update couldn't be downloaded, so the app will open as it was.
  echo If this keeps happening, run Install APG Report Center.cmd again.
  echo.
  if not "%APG_NO_START%"=="1" pause
  exit /b 0
)
call npm install --no-fund --no-audit
call npm run build
if errorlevel 1 (
  echo.
  echo The update didn't finish building. Run Install APG Report Center.cmd to repair it,
  echo or send a screenshot of this window to whoever set this up.
  echo.
  if not "%APG_NO_START%"=="1" pause
  exit /b 1
)
call scripts\make-shortcuts.cmd
exit /b 0
