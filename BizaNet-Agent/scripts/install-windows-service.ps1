# Installe BizaNet-Agent comme tâche planifiée au démarrage (Windows)
$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$NodePath = (Get-Command node).Source
$StartScript = Join-Path $AgentDir "dist\index.js"

Write-Host "Build agent..."
Set-Location $AgentDir
npm run build

$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$StartScript`"" -WorkingDirectory $AgentDir
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "BizaNet-Agent" -Action $Action -Trigger $Trigger -Settings $Settings -Force
Write-Host "Tâche planifiée 'BizaNet-Agent' enregistrée (démarrage Windows)."
