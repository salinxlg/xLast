@echo off
setlocal
chcp 65001 >nul
node "%~dp0bin\xlast.js" %*
exit /b %errorlevel%
