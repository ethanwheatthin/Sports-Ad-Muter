@echo off
setlocal enabledelayedexpansion

echo =====================================================
echo Football Ad Muter - Ollama Setup Script
echo =====================================================
echo.

REM Check if Ollama is installed
echo [1/4] Checking for Ollama installation...
where ollama >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Ollama is already installed
    ollama --version
    goto :check_running
) else (
    echo [!] Ollama is not installed
    goto :install_ollama
)

:install_ollama
echo.
echo [2/4] Downloading and installing Ollama...
echo.
echo Please download Ollama from: https://ollama.com/download/windows
echo.
echo After installation, please restart this script.
echo.
echo Opening browser to download page...
start https://ollama.com/download/windows
echo.
pause
exit /b 1

:check_running
echo.
echo [2/4] Checking if Ollama service is running...

REM Try to connect to Ollama API
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Ollama service is running
    goto :check_model
) else (
    echo [!] Ollama service is not running
    echo Starting Ollama service...
    
    REM Start Ollama service in background
    start /B ollama serve >nul 2>&1
    
    REM Wait for service to start
    echo Waiting for Ollama to start...
    timeout /t 5 /nobreak >nul
    
    REM Check again
    curl -s http://localhost:11434/api/tags >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Ollama service started successfully
        goto :check_model
    ) else (
        echo [ERROR] Failed to start Ollama service
        echo Please start Ollama manually and run this script again
        pause
        exit /b 1
    )
)

:check_model
echo.
echo [3/4] Checking for required model (qwen3.5:0.8b)...

REM List installed models and check for qwen3.5:0.8b
ollama list | findstr /C:"qwen3.5:0.8b" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Model qwen3.5:0.8b is already installed
    goto :verify_cors
) else (
    echo [!] Model qwen3.5:0.8b is not installed
    goto :install_model
)

:install_model
echo.
echo Downloading and installing qwen3.5:0.8b model...
echo This may take several minutes depending on your internet connection...
echo Model size: approximately 1.5 GB
echo.

ollama pull qwen3.5:0.8b
if %errorlevel% equ 0 (
    echo [OK] Model qwen3.5:0.8b installed successfully
    goto :verify_cors
) else (
    echo [ERROR] Failed to install model qwen3.5:0.8b
    echo Please check your internet connection and try again
    pause
    exit /b 1
)

:verify_cors
echo.
echo [4/4] Verifying CORS configuration...
echo.

REM Check if Ollama is running with CORS enabled
curl -s -H "Origin: chrome-extension://test" http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] CORS appears to be configured
) else (
    echo [WARNING] CORS may not be properly configured
)

echo.
echo Checking if Ollama needs to be restarted with CORS...
tasklist | findstr /I "ollama.exe" >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo IMPORTANT: For the Chrome extension to work, Ollama must be started
    echo with CORS enabled. 
    echo.
    echo Would you like to restart Ollama with CORS now? (Y/N)
    set /p restart_choice=
    
    if /I "!restart_choice!"=="Y" (
        echo.
        echo Stopping Ollama service...
        taskkill /IM ollama.exe /F >nul 2>&1
        timeout /t 2 /nobreak >nul
        
        echo Starting Ollama with CORS enabled...
        echo.
        echo A new terminal window will open running Ollama.
        echo KEEP THIS WINDOW OPEN while using the extension.
        echo.
        
        REM Create a batch file to run Ollama with CORS
        echo @echo off > "%TEMP%\ollama-cors.bat"
        echo echo Ollama is running with CORS enabled >> "%TEMP%\ollama-cors.bat"
        echo echo Keep this window open while using the Football Ad Muter extension >> "%TEMP%\ollama-cors.bat"
        echo echo. >> "%TEMP%\ollama-cors.bat"
        echo set OLLAMA_ORIGINS=* >> "%TEMP%\ollama-cors.bat"
        echo ollama serve >> "%TEMP%\ollama-cors.bat"
        
        start "Ollama with CORS" cmd /k "%TEMP%\ollama-cors.bat"
        
        echo.
        echo Waiting for Ollama to start...
        timeout /t 5 /nobreak >nul
    )
)

:success
echo.
echo =====================================================
echo Setup Complete!
echo =====================================================
echo.
echo Ollama Status:
ollama list
echo.
echo Next Steps:
echo 1. Make sure Ollama is running (it should be in a separate window)
echo 2. Load your Chrome extension in Chrome
echo 3. Navigate to a sports streaming site
echo 4. Click the extension icon and click "Start Monitoring"
echo.
echo Troubleshooting:
echo - If the extension shows errors, check TROUBLESHOOTING.md
echo - Use start-ollama-with-cors.bat to manually start Ollama with CORS
echo - Check that Ollama is running: http://localhost:11434
echo.
echo =====================================================
echo.
pause
