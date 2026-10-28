@echo off
title Iniciar Projeto

cd /d "%~dp0"

if not exist node_modules (
    echo Dependencias nao encontradas. Instalando...
    call npm install
    if errorlevel 1 (
        echo Falha ao instalar dependencias.
        pause
        exit /b 1
    )
) else (
    echo Dependencias ja instaladas. Ignorando instalacao.
)

echo Iniciando o servidor...
start "" "http://localhost:3005"
call npm start