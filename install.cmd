@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
title xLast 7.0.0 - Instalador

where.exe node.exe >nul 2>&1 || goto :NODE_MISSING

node.exe "%~dp0bin\install.js"
set "XLAST_RESULT=%ERRORLEVEL%"
goto :FINISH

:NODE_MISSING
set "XLAST_RESULT=1"
echo.
echo [ERROR] Node.js no esta instalado o esta fuera del PATH.
echo.
echo xLast necesita Node.js 18 o superior para ejecutar su instalador.
echo Si acabas de instalarlo, cierra y vuelve a abrir VS Code primero.
echo.
where.exe winget.exe >nul 2>&1 || goto :NODE_DOWNLOAD
echo Puedes instalar Node.js LTS con este comando:
echo.
echo   winget install OpenJS.NodeJS.LTS
goto :FINISH

:NODE_DOWNLOAD
echo Descarga Node.js LTS desde: https://nodejs.org/

:FINISH
echo.
pause
exit /b %XLAST_RESULT%
