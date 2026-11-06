@echo off
title APG Report Center - Set Reviewer PIN
echo ============================================
echo   APG Report Center - ATS Report Reviewer PIN
echo ============================================
echo.
echo Sets the Anthropic API key and the 6-digit PIN that unlock the
echo ATS Report Reviewer on this computer.
echo.
call node scripts\set-reviewer-pin.mjs
echo.
pause
