@echo off
cd /d "%~dp0"
set "PORT=8791"
echo Module Ground: http://localhost:8791/
echo Keep this window open while using the site.
node server.js
pause
