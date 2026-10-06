@echo off
chcp 65001 >nul
title Kotouč Manager - Zastavení

echo ========================================================
echo       Kotouč Manager - Zastavuji aplikaci...
echo ========================================================
echo.

:: Najdi cestu k docker.exe
where docker >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
    ) else if exist "C:\Program Files\Docker\Docker\resources\bin\docker.exe" (
        set "PATH=C:\Program Files\Docker\Docker\resources\bin;%PATH%"
    )
)

cd /d "%~dp0"
docker compose down

echo.
echo [OK] Všechny kontejnery byly úspěšně zastaveny.
echo (Vaše data v databázi zůstávají uložena.)
echo.
timeout /t 3 >nul
