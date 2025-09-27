@echo off
echo 🚀 Testing Production Docker Configuration Locally...

REM Stop existing containers
echo Stopping existing containers...
docker-compose -f docker-compose.prod.yml down

REM Build and start all services
echo Building and starting all services...
docker-compose -f docker-compose.prod.yml --env-file .env.asemb up -d --build

echo.
echo ✅ Services are starting...
echo.
echo 📊 Access Points:
echo   Frontend: http://localhost:3001
echo   API: http://localhost:3000 (inside Docker network)
echo   Nginx: http://localhost:8088
echo.
echo 📋 Check logs with:
echo   docker-compose -f docker-compose.prod.yml logs -f [service-name]
echo.
echo 🛑 To stop:
echo   docker-compose -f docker-compose.prod.yml down
echo.
pause