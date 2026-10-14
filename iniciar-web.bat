@echo off
cd /d "%~dp0web"
if not exist node_modules call npm install
start "" http://localhost:3100/
npx vite --port 3100
