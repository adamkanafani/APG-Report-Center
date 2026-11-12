@echo off
rem Starts the APG Report Center, updating it first when there's a new version (scripts\launch.cmd).
rem Runs a copy of the launcher from %TEMP% and hands over to it for good (no "call"), so an update
rem that rewrites this folder -- this file included -- can't disturb the script that's running.
copy /y "%~dp0scripts\launch.cmd" "%TEMP%\apg-report-center-launch.cmd" >nul & "%TEMP%\apg-report-center-launch.cmd" "%~dp0."
