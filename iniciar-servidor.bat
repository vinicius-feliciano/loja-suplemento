@echo off
chcp 65001 > nul
echo ======================================================
echo    NOVA ERA NUTRITION - Servidor Backend Node.js
echo ======================================================
echo.

REM Adiciona caminho do Node.js portátil se necessário
set "PATH=%PATH%;C:\Users\vinif\nodejs\node-v20.18.0-win-x64;C:\Program Files\nodejs"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema.
    pause
    exit /b 1
)

echo Iniciando o servidor Node.js...
echo.
node server.js

pause
