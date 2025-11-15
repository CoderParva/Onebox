@echo off
ECHO ========================================================
ECHO         ONEBOX PROJECT MASTER SETUP SCRIPT
ECHO ========================================================
ECHO.
ECHO WARNING: This script installs Node, Python, and Docker Desktop.
ECHO          It MUST be run as Administrator.
ECHO.
PAUSE

:: ----------------------------------------------------
:: PART 1: INSTALL CHOCOLATEY (If not already present)
:: ----------------------------------------------------
:: This checks for and installs the necessary Windows package manager
where choco >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [+] Chocolatey not found. Installing...
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))"
    :: Give time for Chocolatey to set up PATH
    TIMEOUT /T 5
)

:: Ensure we are in the correct directory
cd /d "%~dp0"

:: ----------------------------------------------------
:: PART 2 & 3: SYSTEM/PYTHON/NODE DEPENDENCIES (Core Software)
:: ----------------------------------------------------
ECHO.
ECHO [+] 1. Installing Core OS Dependencies (Node.js, Python, Docker Desktop, Ollama)...
:: Node, Python (for utility/scripts), and Docker Desktop
choco install nodejs python docker-desktop -y

ECHO.
ECHO [+] 2. Installing Ollama...
:: Ollama does not have a stable Chocolatey package, so we use their direct install method.
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://ollama.com/install.ps1 -UseBasicParsing | Invoke-Expression"

:: Wait for PATH registration and service startup
TIMEOUT /T 10

:: ----------------------------------------------------
:: PART 4: PROJECT DEPENDENCIES (NPM & Ollama Models)
:: ----------------------------------------------------
ECHO.
ECHO [+] 3. Installing NPM dependencies (Root Project)...
npm install

ECHO [+] 4. Installing NPM dependencies (Frontend UI)...
cd ui
npm install
cd ..

ECHO.
ECHO [+] 5. Starting Docker Containers (Elasticsearch/ChromaDB)...
docker-compose up -d

ECHO.
ECHO [+] 6. Pulling Ollama Models (Llama3 & Embeddings)...
:: The user needs Llama 3 for categorization and nomic-embed-text for RAG embeddings.
ECHO    (This step downloads large AI models. Wait time: 5-15 mins)
ollama pull llama3:8b
ollama pull nomic-embed-text

:: ----------------------------------------------------
:: PART 5 & 6: FINAL CHECKS & STARTUP
:: ----------------------------------------------------
ECHO.
ECHO ========================================================
ECHO ✅ FULL PROJECT ENVIRONMENT IS READY.
ECHO ========================================================
ECHO.
ECHO TO START THE SYSTEM: Double-click "run-all.bat"
ECHO.
PAUSE