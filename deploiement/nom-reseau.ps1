<#
  Celestial Hub - joindre le Hub par un nom plutot que par une adresse IP.

  Objectif : taper http://celestial-hub:3000 au lieu de http://192.168.1.42:3000

  DEUX MODES.

  1) Sur le PC SERVEUR - renommer le PC (solution la plus propre) :
         .\deploiement\nom-reseau.ps1 -Serveur -Nom celestial-hub
     Windows annonce ce nom sur le reseau local : tous les PC Windows de la
     maison peuvent alors utiliser http://celestial-hub:3000 sans rien avoir a
     configurer chez eux. Un redemarrage est necessaire.

  2) Sur un PC CLIENT - inscrire le nom dans le fichier hosts :
         .\deploiement\nom-reseau.ps1 -Client -Adresse 192.168.1.42 -Nom celestial-hub
     Utile si l'on ne veut pas renommer le PC serveur, ou si la resolution par
     nom ne fonctionne pas sur ce PC. A refaire si l'adresse IP change (d'ou
     l'interet de la reservation DHCP dans la box).

  Les deux modes demandent un PowerShell EN ADMINISTRATEUR.
#>

[CmdletBinding(DefaultParameterSetName = 'Serveur')]
param(
  [Parameter(ParameterSetName = 'Serveur')][switch]$Serveur,
  [Parameter(ParameterSetName = 'Client', Mandatory = $true)][switch]$Client,
  [Parameter(ParameterSetName = 'Client', Mandatory = $true)][string]$Adresse,
  [string]$Nom = 'celestial-hub',
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

# Un nom NetBIOS valide : 15 caracteres maximum, lettres, chiffres et tirets.
function Assert-NomValide([string]$valeur) {
  if ($valeur.Length -gt 15) {
    throw "Le nom '$valeur' fait $($valeur.Length) caracteres. Windows en accepte 15 au maximum (essayez 'celestial-hub')."
  }
  if ($valeur -notmatch '^[A-Za-z0-9-]+$') {
    throw "Le nom '$valeur' contient des caracteres interdits. Uniquement des lettres, des chiffres et des tirets."
  }
  if ($valeur -match '^-|-$') {
    throw "Le nom '$valeur' ne peut pas commencer ni finir par un tiret."
  }
}

Assert-Admin
Assert-NomValide $Nom

if ($Client) {
  # ----------------------------------------------------------------- CLIENT
  if ($Adresse -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    throw "Adresse IP attendue (exemple : 192.168.1.42), reçu '$Adresse'."
  }

  $hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
  Copy-Item $hosts "$hosts.sauvegarde" -Force
  $lignes = Get-Content $hosts

  # On retire toute ligne precedente pour ce nom, puis on ajoute la bonne.
  $propres = $lignes | Where-Object { $_ -notmatch "\s$([regex]::Escape($Nom))(\s|$)" }
  $propres += "$Adresse`t$Nom`t# Celestial Hub"
  Set-Content -Path $hosts -Value $propres -Encoding ASCII

  ipconfig /flushdns | Out-Null
  Write-Host "Nom '$Nom' associe a $Adresse sur ce PC." -ForegroundColor Green
  Write-Host "Sauvegarde du fichier hosts : $hosts.sauvegarde"

  try {
    $reponse = Invoke-RestMethod "http://${Nom}:$Port/api/sante" -TimeoutSec 5
    if ($reponse.ok) {
      Write-Host "http://${Nom}:$Port repond correctement." -ForegroundColor Green
      Write-Host "Vous pouvez recreer le raccourci du bureau avec ce nom :"
      Write-Host "  .\deploiement\creer-raccourci.ps1 -Adresse http://${Nom}:$Port"
    }
  } catch {
    Write-Warning "Le nom est enregistre mais le serveur ne repond pas encore sur http://${Nom}:$Port."
  }
  return
}

# ----------------------------------------------------------------- SERVEUR
$actuel = $env:COMPUTERNAME
Write-Host "Nom actuel du PC : $actuel"
Write-Host "Nouveau nom      : $Nom"

if ($actuel -ieq $Nom) {
  Write-Host "`nLe PC porte deja ce nom, rien a faire." -ForegroundColor Green
} else {
  Write-Host @"

Renommer le PC change la facon dont il est identifie sur le reseau local.
A verifier avant de continuer :
  - les partages de fichiers Windows references par l'ancien nom devront etre refaits ;
  - le PC doit redemarrer pour que le nom prenne effet ;
  - si ce PC appartient a un domaine d'entreprise, ne pas le renommer soi-meme.
"@
  $reponse = Read-Host "Renommer le PC en '$Nom' ? (o/N)"
  if ($reponse -notmatch '^[oOyY]') {
    Write-Host "Abandon : aucun changement." -ForegroundColor Yellow
    return
  }

  Rename-Computer -NewName $Nom -Force
  Write-Host "`nPC renomme. Le nouveau nom sera actif apres redemarrage." -ForegroundColor Green
}

# Le nom seul ne suffit pas si le pare-feu bloque la resolution de noms.
$reglesDecouverte = Get-NetFirewallRule -Group '@FirewallAPI.dll,-32752' -ErrorAction SilentlyContinue |
  Where-Object { $_.Profile -match 'Private' -and $_.Enabled -eq 'False' }
if ($reglesDecouverte) {
  Write-Warning @"
La "decouverte de reseau" semble desactivee en reseau prive : les autres PC
risquent de ne pas resoudre le nom '$Nom'. Activez-la dans
Parametres > Reseau > Parametres reseau avances > Partage.
"@
}

Write-Host @"

Une fois le PC redemarre, les autres appareils utiliseront :
  http://${Nom}:$Port            (PC Windows du reseau)
  http://${Nom}.local:$Port      (iPhone, iPad, Mac, Android recents)

Si un appareil ne resout pas le nom (certains telephones, certaines box), deux
solutions :
  - PC Windows : lancer ce script sur ce PC avec -Client -Adresse <IP du serveur>
  - Telephone  : declarer le nom dans la box (bail DHCP statique + nom d'hote),
                 ou simplement utiliser l'adresse IP, qui fonctionne toujours.

Rappel : le mot de passe est memorise par adresse. En passant de l'IP au nom,
chaque appareil devra se reconnecter une fois.
"@
