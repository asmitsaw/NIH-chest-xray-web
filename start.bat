@echo off
REM Starts the AI service, then the web app. Run "npm run setup" and "npm run build" once first.
start "Chest-X AI service" cmd /k python ml_service\app.py
timeout /t 3 >nul
start "Chest-X web" cmd /k npm.cmd start
timeout /t 3 >nul
start http://localhost:4000
