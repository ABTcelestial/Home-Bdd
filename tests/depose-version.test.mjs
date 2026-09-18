// LE DEPOT REFUSE UN ARTEFACT QUI N'ANNONCE PAS SA VERSION (2026-09-18).
//
// Pourquoi ces cas existent : `hub-depose.mjs` notait l'empreinte de chaque binaire —
// donc « LEQUEL des dix a-t-il ? » — sans jamais demander « ce binaire DIT-il ce que le
// dossier annonce ? ». La mesure du 2026-09-10, ecrite dans le script lui-meme, prouve
// que le cas s'est produit : les DIX APK de Chantiers annoncaient `versionName 1.0.0`.
//
// ⚠ Ces tests lancent la COMMANDE, pas une copie de sa logique. C'est ce qu'un humain
// tape, et c'est la seule chose dont le comportement engage quoi que ce soit.
//
// ⚠ Et ils travaillent tous dans une racine TEMPORAIRE. Un depot ne se defait pas : un
// test qui viserait `D:\CelestialHub` pourrait detruire un binaire publie.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'

const ICI = fileURLToPath(new URL('.', import.meta.url))
const SCRIPT = join(ICI, '..', 'scripts', 'hub-depose.mjs')

const racines = []
after(() => {
  for (const r of racines) rmSync(r, { recursive: true, force: true })
})

function racineNeuve() {
  const r = mkdtempSync(join(tmpdir(), 'hub-test-'))
  racines.push(r)
  return r
}

function deposer(racine, version, fichier, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, '--racine', racine, '--projet', 'app-essai', '--version', version, '--fichier', fichier], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  })
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` }
}

/** Un APK reel du Hub, s'il y en a un sur ce poste. Sinon les cas qui en dependent se taisent. */
function apkReel() {
  const dossier = 'D:/CelestialHub/chantiers-mobile/1.1.0'
  if (!existsSync(dossier)) return null
  const nom = readdirSync(dossier).find((n) => n.toLowerCase().endsWith('.apk'))
  return nom ? { chemin: join(dossier, nom), version: '1.1.0' } : null
}

const APK = apkReel()
const sansApk = APK === null

describe('le depot confronte le binaire a ce que le dossier annonce', () => {
  test('un APK qui declare la version du dossier passe', { skip: sansApk && 'aucun APK sur ce poste' }, () => {
    const racine = racineNeuve()
    const { code, sortie } = deposer(racine, APK.version, APK.chemin)
    assert.equal(code, 0, sortie)
    assert.match(sortie, /version declaree : .*conforme/)
  })

  test('un APK qui declare AUTRE CHOSE est refuse', { skip: sansApk && 'aucun APK sur ce poste' }, () => {
    const racine = racineNeuve()
    const { code, sortie } = deposer(racine, '9.9.9', APK.chemin)
    assert.notEqual(code, 0, 'le depot aurait du echouer')
    assert.match(sortie, /DECLARE la version/)
  })

  test('⚠ un refus laisse la racine INTACTE — il tombe avant toute action destructive', { skip: sansApk && 'aucun APK sur ce poste' }, () => {
    // C'est la propriete qui compte le plus : ce qui suit le controle archive des
    // versions publiees et cree des dossiers. Un refus tardif aurait deja deplace un
    // binaire, et un binaire deplace ne revient pas.
    const racine = racineNeuve()
    deposer(racine, '9.9.9', APK.chemin)
    assert.deepEqual(readdirSync(racine), [], 'le refus a cree quelque chose')
  })

  test('un build de TEST se juge sur la version de BASE : 1.1.0-T9 accepte un APK qui dit 1.1.0', { skip: sansApk && 'aucun APK sur ce poste' }, () => {
    // Le suffixe nomme un dossier du Hub, jamais la version embarquee — sans cette
    // regle, aucun build de test ne pourrait plus etre depose.
    const racine = racineNeuve()
    const { code, sortie } = deposer(racine, `${APK.version}-T9`, APK.chemin)
    assert.equal(code, 0, sortie)
    assert.match(sortie, /conforme/)
  })

  test("sans SDK Android, le controle se declare non concluant et LAISSE PASSER", { skip: sansApk && 'aucun APK sur ce poste' }, () => {
    // Un controle qui refuse ce qu'il ne sait pas lire est un controle qu'on finit par
    // contourner. Ici il le dit, et le depot se fait.
    const racine = racineNeuve()
    const vide = mkdtempSync(join(tmpdir(), 'sdk-absent-'))
    racines.push(vide)
    const { code, sortie } = deposer(racine, '9.9.9', APK.chemin, { ANDROID_HOME: join(vide, 'nulle-part'), ANDROID_SDK_ROOT: join(vide, 'nulle-part'), LOCALAPPDATA: vide })
    assert.equal(code, 0, sortie)
    assert.match(sortie, /non verifiee/)
  })

  test("un artefact qui n'est pas un APK n'est pas juge — et ne bloque rien", () => {
    // Ce cas ne demande aucun APK : il tourne partout, et c'est voulu — c'est celui qui
    // garantit qu'un installeur Electron ou un .zip continue de se deposer.
    const racine = racineNeuve()
    const faux = join(racineNeuve(), 'installeur.exe')
    writeFileSync(faux, 'ceci n est pas un executable')
    const { code, sortie } = deposer(racine, '2.0.0', faux)
    assert.equal(code, 0, sortie)
    assert.doesNotMatch(sortie, /DECLARE la version/)
    assert.ok(existsSync(join(racine, 'app-essai', '2.0.0', 'installeur.exe')), sortie)
  })
})
