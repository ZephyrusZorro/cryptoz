@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or later from https://nodejs.org and run this launcher again.
  pause
  exit /b 1
)
if not exist "dist\server\index.js" (
  echo Production build missing. Run npm ci then npm run build.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:5187"
node scripts/serve.mjs
pause
