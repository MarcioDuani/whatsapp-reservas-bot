@echo off
chcp 65001 >nul
title Joana - Chatbot WhatsApp
cd /d "%~dp0"
echo ========================================
echo   Iniciando a Joana (WhatsApp + IA)...
echo ========================================
npm start
pause

