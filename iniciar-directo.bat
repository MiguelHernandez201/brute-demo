@echo off
rem Directo de TikTok: abre el puente que lee tu directo (regalos, tap tap y comentarios) y el juego en modo TikTok.
rem La primera vez pregunta tu usuario de TikTok y lo recuerda (live\usuario.txt). Para cambiarlo:
rem   iniciar-directo.bat otro_usuario
cd /d "%~dp0"
set "USUARIO=%~1"
if "%USUARIO%"=="" if exist live\usuario.txt set /p USUARIO=<live\usuario.txt
if "%USUARIO%"=="" set /p "USUARIO=Tu usuario de TikTok (sin @): "
if "%USUARIO%"=="" exit /b 1
>live\usuario.txt echo %USUARIO%
if not exist live\node_modules (pushd live & call npm install & popd)
if not exist web\node_modules (pushd web & call npm install & popd)
start "Puente del directo de TikTok" /d "%~dp0live" cmd /k node puente.js %USUARIO%
start "" "http://localhost:3100/?tiktok"
cd web
npx vite --port 3100
