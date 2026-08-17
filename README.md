# Celestial Hub

Gestionnaire de fichiers en reseau local, auto-heberge sur le PC principal.
Un mini Google Drive 100 % local : pas de cloud, pas d'internet, un seul mot de
passe partage. Depuis n'importe quel appareil de la maison (PC, portable,
tablette, telephone), un navigateur suffit pour consulter, telecharger,
televerser, organiser et supprimer les fichiers du PC serveur.

---

## Ce que fait l'application

| Fonction | Detail |
|---|---|
| Connexion | Un champ mot de passe, session de 30 jours en cookie signe httpOnly |
| Arborescence | Racine representee par l'icone BDD, dossiers jaunes depliables, fichiers colores par type |
| Recherche | Liste a plat, recherche instantanee, filtre Tout / Dossiers / Fichiers |
| Localisation | Un clic sur un resultat deplie l'arbre, fait defiler et surligne 2,5 s |
| Telechargement | Flux HTTP direct, gros fichiers (ISO de plusieurs Go) sans saturer la RAM, reprise possible (Range) |
| Televersement | Glisser-deposer (fichiers **et** dossiers) ou bouton, multi-fichiers, barre de progression, annulation |
| Organisation | Creer un dossier, renommer, deplacer (selection multiple), verification des noms Windows |
| Corbeille | Suppression douce vers `.corbeille/`, restauration par tout le monde, vidage reserve au PC serveur |
| Notes | Une note libre par fichier ou dossier, stockee dans `db.json`, qui suit les renommages et deplacements |
| Editeur de texte | Ouverture des fichiers texte, apercu Markdown, **cases a cocher cliquables**, Ctrl+S, avertissement si conflit |
| Temps reel | SSE + polling de secours : un fichier ajoute depuis l'explorateur Windows apparait tout seul |
| Reglages | Choix du dossier racine (avec explorateur), mot de passe, re-scan, adresses reseau - **PC serveur uniquement** |
| Emplacement | "Ouvrir l'emplacement" lance l'Explorateur Windows sur l'element - **PC serveur uniquement** |
| Guidage | Un outil exterieur (Claude Code, script de build) fait briller un element et y accroche une bulle - voir `docs/guidage.md` |

### Multi-appareils

L'interface est la meme partout, seule sa mise en page change :

- **Telephone (< 768 px)** : un volet a la fois (Arbre / Recherche) avec une barre
  de navigation en bas, panneau de detail en feuille remontante, boites de
  dialogue en feuilles, cibles tactiles de 42-48 px, marges `safe-area` pour les
  encoches, champs a 16 px pour eviter le zoom automatique d'iOS.
- **Tablette (768-1199 px)** : liste et arborescence cote a cote, detail en
  tiroir lateral, boutons d'entete en icones seules.
- **PC (>= 1200 px)** : les trois colonnes du PRD (recherche / arborescence /
  detail), actions au survol, raccourcis clavier (Echap, Ctrl+S).

Aucun defilement horizontal, animations desactivees si le systeme demande
`prefers-reduced-motion`, et le site est installable en raccourci plein ecran
(`manifest.webmanifest`).

---

## Installation sur le PC serveur

Prerequis : [Node.js 20 ou plus](https://nodejs.org) et [Git](https://git-scm.com).

```bat
git clone https://github.com/ABTcelestial/Home-Bdd.git C:\CelestialHub-app
cd C:\CelestialHub-app
npm install
copy .env.example .env
```

Ouvrir `.env` et definir au minimum :

```ini
HUB_PASSWORD=le-mot-de-passe-de-la-maison
HUB_ROOT=C:\CelestialHub
PORT=3000
```

Puis construire et demarrer :

```bat
npm run build
npm start
```

La console affiche l'adresse locale et l'adresse reseau a donner au PC client.

### Variables d'environnement

| Variable | Role | Defaut |
|---|---|---|
| `HUB_PASSWORD` | Mot de passe partage (obligatoire tant qu'aucun mot de passe n'a ete defini dans les reglages) | - |
| `HUB_ROOT` | Dossier racine affiche | `C:\CelestialHub` |
| `PORT` | Port d'ecoute | `3000` |
| `HOST` | Interface d'ecoute | `0.0.0.0` |
| `HUB_WATCH_MS` | Frequence du scan disque | `4000` |
| `HUB_DATA_DIR` | Emplacement de `config.json` (racine, hash du mot de passe, secret de session) | `<projet>/data` |

---

## Demarrage automatique (service Windows)

Le script `deploiement\installer-service.ps1` fait tout : il installe le service
via [NSSM](https://nssm.cc/download), l'inscrit en demarrage automatique et le
lance.

```powershell
# PowerShell en administrateur, depuis le dossier du projet
.\deploiement\installer-service.ps1 -NssmPath C:\outils\nssm.exe
```

Le service demarre avant l'ouverture de session et se relance seul en cas de
crash. Verification : `http://localhost:3000/api/sante` doit repondre
`{"ok":true,...}`.

## Pare-feu et reseau

```powershell
# PowerShell en administrateur : ouvre le port UNIQUEMENT en reseau prive
.\deploiement\regle-pare-feu.ps1 -Port 3000
```

Puis, dans l'interface de la box : reserver une adresse IP fixe (reservation
DHCP) pour le PC serveur, afin que l'adresse ne change jamais.

**Aucune redirection de port ne doit etre configuree** : l'application n'est pas
concue pour etre exposee sur internet.

## Donner un nom au serveur (au lieu d'une adresse IP)

Pour taper `http://celestial-hub:3000` plutot que `http://192.168.1.42:3000`.

**Solution recommandee - renommer le PC serveur.** Windows annonce lui-meme son
nom sur le reseau local : aucun reglage n'est alors necessaire sur les autres
PC.

```powershell
# Sur le PC serveur, PowerShell en administrateur. Redemarrage ensuite.
.\deploiement\nom-reseau.ps1 -Serveur -Nom celestial-hub
```

Le nom est limite a 15 caracteres (contrainte Windows) et le script refuse les
noms invalides avant de toucher a quoi que ce soit.

**Solution de repli - fichier hosts du PC client.** Si l'on prefere ne pas
renommer le PC serveur, ou si un PC ne resout pas le nom :

```powershell
# Sur le PC client, PowerShell en administrateur
.\deploiement\nom-reseau.ps1 -Client -Adresse 192.168.1.42 -Nom celestial-hub
```

Le fichier `hosts` est sauvegarde avant modification. A refaire si l'adresse IP
du serveur change, d'ou l'interet de la reservation DHCP.

**Sur telephone et tablette.** `http://celestial-hub.local:3000` fonctionne sur
iPhone, iPad, Mac et Android recents. Pour les appareils qui ne resolvent ni le
nom Windows ni le `.local`, deux options : declarer le nom dans la box (bail
DHCP statique avec nom d'hote), ou garder l'adresse IP, qui marche toujours.

Les trois formes d'adresse sont affichees, pretes a copier, dans **Reglages >
Acces depuis les autres PC**.

> A savoir : le mot de passe est memorise par adresse. En passant de l'IP au
> nom, chaque appareil se reconnecte une fois.
>
> Un nom personnalise, different du nom Windows du PC, peut etre affiche dans
> les reglages via la variable `HUB_HOSTNAME` (la resolution reseau, elle,
> reste assuree par le nom Windows ou par le fichier `hosts`).

## Sur le PC client

```powershell
.\deploiement\creer-raccourci.ps1 -Adresse http://celestial-hub:3000
```

Le script depose un raccourci "Celestial Hub" sur le bureau. Rien d'autre a
installer. Sur telephone ou tablette, ouvrir l'adresse dans le navigateur puis
"Ajouter a l'ecran d'accueil".

---

## Fonctionnement interne

- **Aucune base de donnees.** Le systeme de fichiers Windows est la source de
  verite ; l'app le re-scanne en continu.
- `<racine>\db.json` contient uniquement les metadonnees : notes et corbeille.
  Le sauvegarder, c'est copier un seul fichier.
- `<projet>\data\config.json` (jamais commite) retient le dossier racine, le
  hash du mot de passe et le secret de signature des sessions.
- Les elements supprimes vont dans `<racine>\.corbeille\`, invisible dans
  l'arbre, avec leur emplacement d'origine dans `db.json`.

### Serveur / client

La distinction se fait sur l'origine TCP de la requete : `server.js` lit
l'adresse reelle du client et l'injecte dans l'en-tete `x-hub-remote-addr`, en
ecrasant toute valeur envoyee par le navigateur. Un PC du reseau ne peut donc
pas se faire passer pour le serveur. Les actions reservees (page `/admin`,
vidage de la corbeille) sont protegees deux fois : bouton masque cote interface,
requete refusee cote serveur.

### Structure du projet

```
app/            pages et routes API (App Router)
components/     interface (arbre, liste, detail, editeur, corbeille, admin)
lib/            configuration, scan disque, chemins surs, markdown, client HTTP
server.js       serveur HTTP maison (detection localhost, gros transferts)
middleware.ts   authentification de toutes les routes sauf le login
deploiement/    scripts Windows (service, pare-feu, raccourci)
```

---

## Depannage

| Symptome | Cause probable |
|---|---|
| "Le dossier racine est introuvable" | Le dossier a ete deplace : le rechoisir dans Reglages (PC serveur) |
| Le PC client n'affiche rien | Regle pare-feu absente, ou PC serveur sur un reseau declare "public" |
| L'icone "hors ligne" apparait dans l'entete | Le flux temps reel est coupe ; l'app continue en mode rafraichissement periodique |
| "Acces refuse par Windows" a la suppression | Fichier ouvert dans un autre programme |
| Le service ne demarre pas | Verifier `npm run build` effectue, et les journaux NSSM du service |

## Ce qui n'est volontairement pas fait (v1)

Acces depuis l'exterieur de la maison, comptes multiples, apercu des images /
PDF / videos, historique de versions, application mobile native.
