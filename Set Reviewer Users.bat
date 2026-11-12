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
call node scripts\set-reviewer-users.mjs
echo.
pause
