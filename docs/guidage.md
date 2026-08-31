# Guidage — faire briller un fichier depuis l'exterieur

Le Hub sait mettre en avant des elements que **quelqu'un d'autre** lui designe :
Claude Code, un script de build, une tache planifiee. Ca sert a poser dans le
Hub ce qui vient d'etre produit (un APK, un EXE, une checklist) et a laisser un
mot dessus pour ne pas oublier de s'en occuper.

## Le contrat : un fichier a la racine

Un seul fichier, `.hub-guide.json`, pose a la racine du Hub (`HUB_ROOT`) :

```json
{
  "Builds/chantiers-1.4.2.apk": {
    "brille": true,
    "bulle": "Build de test — a installer sur ton telephone",
    "ton": "action"
  },
  "Checklists/N10.md": "3 cases encore vides",
  "Rapports/aout.pdf": { "bulle": "A relire avant envoi au client", "ton": "alerte" }
}
```

- **La cle** est le chemin relatif a la racine, en slashs. `Builds/app.apk`,
  pas `D:\CelestialHub\Builds\app.apk`.
- **`bulle`** : le texte affiche a cote du nom (240 caracteres maximum).
- **`brille`** : allume le halo violet sur la ligne. Vaut `true` par defaut.
- **`ton`** : `info` (bleu), `action` (violet), `alerte` (orange). Defaut `info`.
- **Raccourci** : une simple chaine equivaut a `{ "brille": true, "bulle": "…" }`.
- Une enveloppe `{ "elements": { … } }` est acceptee aussi.

Le fichier n'apparait pas dans l'arborescence : c'est de la plomberie, pas un
document.

## Qui ecrit quoi

**Le fichier appartient a l'outil qui l'ecrit.** Le Hub ne le modifie jamais —
il se contente de le lire, environ toutes les 4 secondes, et de pousser la mise
a jour aux navigateurs ouverts sans qu'on recharge la page.

L'acquittement ("Fait") est stocke de l'autre cote, dans le `db.json` du Hub.
Il retient l'**empreinte** du texte, pas un simple booleen : si Claude reecrit
la marque avec un autre message, elle se rallume toute seule. Un meme rappel
inchange, en revanche, reste eteint une fois traite.

## Robustesse

- Fichier absent : aucun guidage, cas normal.
- JSON invalide : un bandeau le signale dans l'app, les marques precedentes
  disparaissent le temps que le fichier soit repare.
- Entree incomprehensible : ignoree seule, les autres marques survivent.
- Chemin qui ne designe plus rien : la marque reste listee dans « A finir » avec
  la mention *introuvable*, plutot que de disparaitre en silence.
- Plafond de 300 marques.

## Regle a donner a Claude Code

A coller dans le `CLAUDE.md` du workspace, en adaptant les chemins :

```markdown
## Celestial Hub — livrables

Le Hub est le point de depot de ce que je produis et que Ryan doit recuperer
sur un autre appareil : racine `D:\CelestialHub`.

Quand je produis un APK, un EXE, un installeur, un rapport ou une checklist
destinee a Ryan :
1. Copier le fichier dans le bon sous-dossier du Hub (`Builds/`, `Checklists/`,
   `Rapports/`), en nommant avec la version ou la date.
2. Ajouter (ou mettre a jour) son entree dans `D:\CelestialHub\.hub-guide.json` :
   chemin relatif en cle, `bulle` = ce que Ryan doit en faire, `ton` = `action`
   pour une chose a faire, `alerte` si c'est bloquant, `info` sinon.
3. Retirer l'entree quand l'element n'a plus rien a demander.

Ne jamais modifier `db.json` : il appartient au Hub.
```

## Verifier a la main

```powershell
# depuis le PC serveur, avec le Hub en marche
notepad D:\CelestialHub\.hub-guide.json
```

Le compteur « a finir » de l'entete se met a jour dans les secondes qui suivent.
