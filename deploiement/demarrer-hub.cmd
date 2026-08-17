@echo off
rem ---------------------------------------------------------------------------
rem  Celestial Hub - lanceur du demarrage automatique.
rem
rem  Pourquoi ce fichier plutot qu'un raccourci direct vers "node server.js" :
rem
rem  1. `node server.js` exige un build de production. Si `.next` a ete efface
rem     (une session qui lance `npm run dev` dans ce depot suffit), le serveur
rem     meurt en une seconde : au demarrage de Windows on ne voit qu'une fenetre
rem     verte qui apparait et disparait, sans le moindre message. On reconstruit
rem     donc automatiquement quand le build manque.
rem  2. Tout est journalise dans journaux\demarrage.log : une panne au boot
rem     laisse une trace lisible au lieu de disparaitre avec la fenetre.
rem ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0.."

if not exist "journaux" mkdir "journaux"
set "LOG=journaux\demarrage.log"

echo. >> "%LOG%"
echo ===== %date% %time% : demarrage demande ===== >> "%LOG%"

if not exist ".next\BUILD_ID" (
  echo [%time%] build de production absent - reconstruction ^(cela prend ~1 min^) >> "%LOG%"
  call npm run build >> "%LOG%" 2>&1
  if not exist ".next\BUILD_ID" (
    echo [%time%] ECHEC : la reconstruction n'a pas produit de build. Le Hub ne demarrera pas. >> "%LOG%"
    exit /b 1
  )
  echo [%time%] reconstruction terminee >> "%LOG%"
)

echo [%time%] lancement de node server.js >> "%LOG%"
node server.js >> "%LOG%" 2>&1

echo [%time%] le serveur s'est arrete ^(code %errorlevel%^) >> "%LOG%"
