<#
  Celestial Hub - raccourci sur le bureau du PC client.

  A lancer sur le PC qui doit acceder au Hub (pas besoin d'administrateur) :
      .\deploiement\creer-raccourci.ps1 -Adresse http://192.168.1.42:3000

  C'est la seule chose a installer sur le PC client : un raccourci navigateur.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Adresse,
  [string]$Nom = 'Celestial Hub'
)

$ErrorActionPreference = 'Stop'

if ($Adresse -notmatch '^https?://') { $Adresse = "http://$Adresse" }

$bureau = [Environment]::GetFolderPath('Desktop')
$fichier = Join-Path $bureau "$Nom.url"

@"
[InternetShortcut]
URL=$Adresse
IconIndex=0
"@ | Set-Content -Path $fichier -Encoding ASCII

Write-Host "Raccourci cree : $fichier" -ForegroundColor Green
Write-Host "Il ouvre $Adresse dans le navigateur par defaut."

try {
  $reponse = Invoke-RestMethod "$Adresse/api/sante" -TimeoutSec 5
  if ($reponse.ok) { Write-Host "Le serveur repond correctement." -ForegroundColor Green }
} catch {
  Write-Warning @"
Le serveur ne repond pas a $Adresse.
A verifier sur le PC serveur : service demarre, regle de pare-feu en reseau prive,
et adresse IP correcte (elle est affichee dans les Reglages du Hub).
"@
}
