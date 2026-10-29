@echo off
title Parar Joana - Chatbot WhatsApp
echo ========================================
echo   Desligando a Joana e o Tunel...
echo ========================================
taskkill /F /IM cloudflared.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo [OK] Joana desligada com sucesso!
ping 127.0.0.1 -n 3 >nul
