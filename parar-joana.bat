@echo off
chcp 65001 >nul
title Parar Joana - Chatbot WhatsApp
echo ========================================
echo   Desligando a Joana e o Túnel...
echo ========================================
taskkill /F /IM cloudflared.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo ✅ Joana desligada com sucesso!
timeout /t 3

