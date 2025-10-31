@echo off
echo ============================================
echo Stopping LSEMB Services
echo ============================================
echo.

echo [1/2] Stopping all PM2 processes...
call pm2 stop all
echo.

echo [2/2] Displaying PM2 status...
call pm2 list
echo.

echo ============================================
echo LSEMB Services Stopped Successfully!
echo ============================================
