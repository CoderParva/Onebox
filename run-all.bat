@echo off
ECHO Starting Docker containers (Elastic, Kibana, Chroma)...
cd /d "%~dp0"
docker-compose up -d

ECHO.
ECHO Starting all app servers in this window...
ECHO (Backend, Frontend, and Ollama)
ECHO.
ECHO =======================================================
ECHO    TO STOP EVERYTHING:
ECHO    1. Press CTRL+C in THIS window.
ECHO    2. Double-click 'shutdown-all.bat'
ECHO =======================================================
ECHO.

:: This command will take over the current window and show all logs
npm run start:all