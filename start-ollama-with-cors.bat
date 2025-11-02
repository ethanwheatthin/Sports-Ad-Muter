@echo off
echo Stopping any existing Ollama processes...
taskkill /F /IM ollama.exe 2>nul
taskkill /F /IM "ollama app.exe" 2>nul
taskkill /F /IM ollama_llama_server.exe 2>nul

echo Waiting for processes to terminate...
timeout /t 5 /nobreak >nul

REM Kill any process using port 11434
echo Checking port 11434...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :11434') do (
    echo Killing process on port 11434 (PID: %%a)
    taskkill /F /PID %%a 2>nul
)

echo Waiting for port to be released...
timeout /t 3 /nobreak >nul

echo Starting Ollama with CORS support for Chrome Extensions...
set OLLAMA_ORIGINS=*
ollama serve
