@echo off

cd /d "C:\Users\SAIBA\BizaNet-Agent"
start "" cmd /c "npm start"

timeout /t 5

cd /d "C:\Users\SAIBA\BizaNet Control\Ccloudflared"
start "" cmd /c ".\cloudflared.exe tunnel run bizanet-agent"