@echo off
ECHO Shutting down Docker containers...
cd /d "%~dp0"
docker-compose down

ECHO.
ECHO All services are shut down.
ECHO This window will close in 5 seconds...
timeout /t 5