@echo off
chcp 65001 >nul
title Kotouč Manager - Spouštění

echo ========================================================
echo       Kotouč Manager - AGC Automotive Czech
echo ========================================================
echo.

:: 1. Najdi cestu k docker.exe
where docker >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
    ) else if exist "C:\Program Files\Docker\Docker\resources\bin\docker.exe" (
        set "PATH=C:\Program Files\Docker\Docker\resources\bin;%PATH%"
    ) else (
        echo [CHYBA] Docker nebyl nalezen! Ujistěte se, že je nainstalován Docker Desktop.
        pause
        exit /b 1
    )
)

:: 2. Zkontroluj, zda Docker Desktop běží
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Spouštím Docker Desktop na pozadí, chvíli strpení...
    if exist "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" (
        start "" "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
    ) else if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    )
    
    echo Čekám na připravenost Dockeru...
    :wait_docker
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 (
        echo ...stále startuje...
        goto wait_docker
    )
    echo [OK] Docker je připraven.
)

:: 3. Spusť kontejnery
echo.
echo [1/2] Spouštím aplikaci (MySQL, FastAPI Backend, React Frontend)...
cd /d "%~dp0"
docker compose up -d

if %errorlevel% neq 0 (
    echo [CHYBA] Nepodařilo se spustit kontejnery.
    pause
    exit /b 1
)

:: 4. Otevři aplikaci v prohlížeči
echo.
echo [2/2] Otevírám aplikaci v prohlížeči...
timeout /t 2 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================================
echo  Aplikace je úspěšně spuštěna!
echo.
echo  Aplikace:   http://localhost:5173
echo  API / Docs: http://localhost:8000/docs
echo.
echo  Pro vypnutí můžete spustit soubor 'zastavit.bat'.
echo ========================================================
echo.
pause
