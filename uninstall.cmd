@echo off
setlocal
title Desinstalador de xLast

echo.
echo Desinstalando xLast...
call npm uninstall -g @dexly/xlast --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo desinstalar xLast.
  pause
  exit /b 1
)

echo.
echo [OK] xLast fue desinstalado.
echo.
pause
exit /b 0
