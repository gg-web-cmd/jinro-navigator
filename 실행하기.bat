@echo off
rem ---------------------------------------------------------------
rem  Jinro Navigator launcher
rem  This file must stay ASCII-only. Korean text inside a .bat gets
rem  garbled depending on the console code page, which breaks parsing.
rem  All Korean messages are printed by node (server.js) instead.
rem ---------------------------------------------------------------
pushd "%~dp0"
title Jinro Navigator

where node >nul 2>&1
if errorlevel 1 goto NONODE

if not exist "node_modules" (
  echo.
  echo   Installing required packages. This takes 1-2 minutes...
  echo.
  call npm install
  if errorlevel 1 goto NPMFAIL
)

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3000'"

node server.js

echo.
pause
popd
exit /b 0

:NONODE
echo.
echo   [ERROR] Node.js is not installed.
echo   Install the LTS version from https://nodejs.org
echo   and then run this file again.
echo.
pause
popd
exit /b 1

:NPMFAIL
echo.
echo   [ERROR] npm install failed. Check your internet connection.
echo.
pause
popd
exit /b 1
