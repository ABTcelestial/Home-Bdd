// --ARCHIVER SANS NOUVEAU FICHIER (2026-10-23) : arrêter une app (Automate Manager) se faisait par `--archiver --readme`
// — et le script ne descendait RIEN, sans un mot, parce qu'il n'archivait qu'en cas d'écrasement d'un artefact.
// L'installeur restait dans deployed/ à côté d'un README qui le disait archivé.
//
// ⚠ Ces tests lancent la COMMANDE, dans une racine TEMPORAIRE — jamais D:\CelestialHub.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const r = mkdtempSync(join(tmpdir(), 'hub-archiver-'))
  racines.push(r)
  return r
}

function lancer(racine, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, '--racine', racine, '--projet', 'app-essai', ...args], { encoding: 'utf8' })
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` }
}

describe('--archiver sans nouveau fichier', () => {
  test('descend la version livrée dans archive/, et le nouveau README reste seul dans deployed/', () => {
    const racine = racineNeuve()
    const binaire = join(racine, 'app-essai-1.0.0.zip')
    writeFileSync(binaire, 'un installeur')
    const premier = lancer(racine, '--version', '1.0.0', '--fichier', binaire)
    assert.equal(premier.code, 0, premier.sortie)

    const readme = join(racine, 'README-arret.md')
    writeFileSync(readme, '# Arrêtée\n')
    const arret = lancer(racine, '--version', '1.0.0', '--readme', readme, '--archiver', '--pourquoi', 'app arrêtée')
    assert.equal(arret.code, 0, arret.sortie)
    assert.match(arret.sortie, /archive : 1\.0\.0 ->/)

    const deployed = join(racine, 'app-essai', 'deployed', '1.0.0')
    assert.equal(existsSync(join(deployed, 'app-essai-1.0.0.zip')), false, 'l’installeur ne reste pas dans deployed/')
    assert.equal(readFileSync(join(deployed, 'README.md'), 'utf8'), '# Arrêtée\n')
    const mois = new Date().toISOString().slice(0, 7)
    assert.equal(existsSync(join(racine, 'app-essai', 'archive', mois, '1.0.0', 'app-essai-1.0.0.zip')), true)
  })

  test('sans --pourquoi, il refuse au lieu d’archiver sans raison', () => {
    const racine = racineNeuve()
    const binaire = join(racine, 'app-essai-1.0.0.zip')
    writeFileSync(binaire, 'un installeur')
    assert.equal(lancer(racine, '--version', '1.0.0', '--fichier', binaire).code, 0)
    const readme = join(racine, 'README-arret.md')
    writeFileSync(readme, '# Arrêtée\n')
    const r = lancer(racine, '--version', '1.0.0', '--readme', readme, '--archiver')
    assert.notEqual(r.code, 0)
    assert.match(r.sortie, /--archiver exige --pourquoi/)
  })

  test('une version qui n’existe pas : il le DIT, au lieu de laisser croire qu’elle a été archivée', () => {
    const racine = racineNeuve()
    const readme = join(racine, 'README.md')
    writeFileSync(readme, '# Rien\n')
    const r = lancer(racine, '--version', '2.0.0', '--readme', readme, '--archiver', '--pourquoi', 'essai')
    assert.equal(r.code, 0, r.sortie)
    assert.match(r.sortie, /rien a archiver/)
  })
})
