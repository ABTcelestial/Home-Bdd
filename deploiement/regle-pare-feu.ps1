<#
  Celestial Hub - ouverture du port en RESEAU PRIVE UNIQUEMENT.

  A lancer dans PowerShell EN ADMINISTRATEUR :
      .\deploiement\regle-pare-feu.ps1 -Port 3000

  Aucune redirection de port ne doit etre ajoutee dans la box : l'application
  n'est pas prevue pour etre accessible depuis internet.
#>

[CmdletBinding()]
param(
  [int]$Port = 3000,
  [string]$Nom = 'Celestial Hub (LAN)'
)

$ErrorActionPreference = 'Stop'

$identite = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identite)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Ce script doit etre lance dans un PowerShell en administrateur."
}

Get-NetFirewallRule -DisplayName $Nom -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule `
  -DisplayName $Nom `
  -Description "Acces au Celestial Hub depuis les autres PC de la maison" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -Profile Private | Out-Null

Write-Host "Port $Port ouvert en reseau prive uniquement." -ForegroundColor Green

$profils = Get-NetConnectionProfile
foreach ($profil in $profils) {
  if ($profil.NetworkCategory -ne 'Private') {
    Write-Warning @"
Le reseau "$($profil.Name)" est classe "$($profil.NetworkCategory)".
Les autres PC ne pourront pas se connecter tant qu'il n'est pas prive :
    Set-NetConnectionProfile -InterfaceIndex $($profil.InterfaceIndex) -NetworkCategory Private
"@
  }
}

Write-Host "`nAdresses a communiquer au PC client :"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { Write-Host "  http://$($_.IPAddress):$Port" }
