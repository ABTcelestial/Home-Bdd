<#
  Celestial Hub - installation en service Windows via NSSM.

  A lancer dans PowerShell EN ADMINISTRATEUR, depuis le dossier du projet :
      .\deploiement\installer-service.ps1 -NssmPath C:\outils\nssm.exe

  NSSM se telecharge sur https://nssm.cc/download (aucune installation, un .exe).
#>

[CmdletBinding()]
param(
  [string]$NssmPath = 'nssm.exe',
  [string]$NomService = 'CelestialHub',
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $identite = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identite)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ce script doit etre lance dans un PowerShell en administrateur."
  }
}

Assert-Admin

$projet = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = (Get-Command node -ErrorAction Stop).Source

if (-not (Get-Command $NssmPath -ErrorAction SilentlyContinue)) {
  throw "NSSM introuvable ($NssmPath). Telechargez-le sur https://nssm.cc/download puis relancez avec -NssmPath."
}

Write-Host "Projet   : $projet"
Write-Host "Node     : $node"
Write-Host "Service  : $NomService (port $Port)"

# Build de production si necessaire
if (-not (Test-Path (Join-Path $projet '.next'))) {
  Write-Host "`nConstruction de l'application (npm run build)..."
  Push-Location $projet
  npm run build
  Pop-Location
}

# Service existant : on l'arrete et on le retire pour repartir propre
$existant = & $NssmPath status $NomService 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "`nService existant detecte : suppression..."
  & $NssmPath stop $NomService confirm | Out-Null
  & $NssmPath remove $NomService confirm | Out-Null
  Start-Sleep -Seconds 2
}

$journaux = Join-Path $projet 'journaux'
New-Item -ItemType Directory -Force -Path $journaux | Out-Null

& $NssmPath install $NomService $node (Join-Path $projet 'server.js')
& $NssmPath set $NomService AppDirectory $projet
& $NssmPath set $NomService DisplayName "Celestial Hub"
& $NssmPath set $NomService Description "Gestionnaire de fichiers en reseau local (Celestial Hub)"
& $NssmPath set $NomService Start SERVICE_AUTO_START
& $NssmPath set $NomService AppEnvironmentExtra "NODE_ENV=production" "PORT=$Port"
& $NssmPath set $NomService AppStdout (Join-Path $journaux 'hub.log')
& $NssmPath set $NomService AppStderr (Join-Path $journaux 'hub-erreurs.log')
& $NssmPath set $NomService AppRotateFiles 1
& $NssmPath set $NomService AppRotateBytes 5242880
# Redemarrage automatique en cas de crash, apres 5 secondes
& $NssmPath set $NomService AppExit Default Restart
& $NssmPath set $NomService AppRestartDelay 5000

Write-Host "`nDemarrage du service..."
& $NssmPath start $NomService
Start-Sleep -Seconds 4

try {
  $sante = Invoke-RestMethod "http://localhost:$Port/api/sante" -TimeoutSec 10
  if ($sante.ok) { Write-Host "`nCelestial Hub repond sur http://localhost:$Port" -ForegroundColor Green }
} catch {
  Write-Warning "Le service est installe mais ne repond pas encore. Consultez $journaux\hub-erreurs.log"
}

Write-Host @"

Etapes suivantes :
  1. Ouvrir le port en reseau prive :  .\deploiement\regle-pare-feu.ps1 -Port $Port
  2. Reserver une IP fixe pour ce PC dans la box (reservation DHCP)
  3. Sur le PC client :                .\deploiement\creer-raccourci.ps1 -Adresse http://<IP>:$Port

Commandes utiles :
  $NssmPath restart $NomService
  $NssmPath stop $NomService
  $NssmPath edit $NomService
"@
