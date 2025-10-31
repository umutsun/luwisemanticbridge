@echo off
echo ============================================
echo Starting LSEMB Services with PM2
echo ============================================
echo.

echo [1/4] Stopping any running PM2 processes...
call pm2 delete all
echo.

echo [2/4] Starting all LSEMB services...
call pm2 start ecosystem.config.js
echo.

echo [3/4] Saving PM2 process list...
call pm2 save
echo.

echo [4/4] Displaying PM2 status...
call pm2 list
echo.

echo ============================================
echo LSEMB Services Started Successfully!
echo ============================================
echo.
echo Services:
echo - Backend API: http://localhost:8083
echo - Frontend: http://localhost:3002
echo - Python Services: http://localhost:8001
echo.
echo Commands:
echo - pm2 list          : Show all processes
echo - pm2 logs          : View logs
echo - pm2 monit         : Real-time monitoring
echo - pm2 stop all      : Stop all services
echo - pm2 restart all   : Restart all services
echo ============================================
