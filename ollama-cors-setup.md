# Ollama CORS Setup for Chrome Extension

If you're still getting CORS errors, you can configure Ollama to allow cross-origin requests:

## Option 1: Start Ollama with CORS headers
```bash
# Windows
set OLLAMA_ORIGINS=* && ollama serve

# Linux/Mac
OLLAMA_ORIGINS=* ollama serve
```

## Option 2: Use environment variable permanently
```bash
# Windows (in Command Prompt)
setx OLLAMA_ORIGINS "*"

# Windows (in PowerShell)
$env:OLLAMA_ORIGINS = "*"

# Linux/Mac (add to .bashrc or .zshrc)
export OLLAMA_ORIGINS="*"
```

## Option 3: More specific CORS setup (recommended for security)
```bash
# Only allow YouTube and extension origins
set OLLAMA_ORIGINS="https://www.youtube.com,https://youtube.com,chrome-extension://*"
```

After setting this up, restart Ollama and try the extension again.