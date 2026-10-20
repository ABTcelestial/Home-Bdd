// L'ELAGAGE DES BUILDS DE TEST (2026-10-20, Ryan : « oui » a garder 3 builds de test par app).
//
// ⚠ Comme depose-version : ces tests lancent la COMMANDE, et toujours dans une racine TEMPORAIRE.
// Un dossier efface ne revient pas : rien ici ne vise `D:\CelestialHub`.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import { comparerVersions } from '../scripts/hub-depose.mjs'

const SCRIPT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'scripts', 'hub-depose.mjs')
const racines = []
after(() => {
  for (const r of racines) rmSync(r, { recursive: true, force: true })
})

/** Un Hub jetable : des builds de test dans le desordre, une version livree, une archive, et un guide. */
function hub() {
  const r = mkdtempSync(join(tmpdir(), 'hub-elaguer-'))
  racines.push(r)
  const poser = (rel) => {
    mkdirSync(dirname(join(r, rel)), { recursive: true })
    writeFileSync(join(r, rel), 'x')
  }
  for (const v of ['1.1.1-T1', '1.2.0-T9', '1.2.0-T10', '1.2.0-T2', '1.2.0-T8']) poser(`app-a/test/${v}/app.apk`)
  poser('app-a/deployed/1.1.1/app.apk')
  poser('app-a/archive/2026-09/1.0.0/app.apk')
  for (const v of ['2.0.0-T1', '2.0.0-T2']) poser(`app-b/test/${v}/CHECKLIST.md`)
  poser('Docs/tests/guide.md')
  const guide = {
    'app-a/test/1.1.1-T1/app.apk': { bulle: 'vieux' },
    'app-a/test/1.2.0-T10/app.apk': { bulle: 'garde' },
    'app-b/test/2.0.0-T2/CHECKLIST.md': { bulle: 'garde aussi' },
    'app-z/test/0.1.0-T1/disparu.apk': { bulle: 'orpheline' },
  }
  writeFileSync(join(r, '.hub-guide.json'), JSON.stringify(guide))
  return r
}

const lancer = (racine, ...args) => {
  const p = spawnSync(process.execPath, [SCRIPT, '--racine', racine, '--elaguer', ...args], { encoding: 'utf8' })
  return { code: p.status, sortie: `${p.stdout}${p.stderr}` }
}

test('les versions se comparent par leur base, puis par le numero du suffixe — T10 apres T9', () => {
  assert.equal(comparerVersions('1.2.0-T10', '1.2.0-T9'), 1)
  assert.equal(comparerVersions('1.1.1-T9', '1.2.0-T1'), -1)
  assert.equal(comparerVersions('1.0.0-T4', '1.0.0-T4'), 0)
  assert.equal(comparerVersions('1.0.0-A2', '1.0.0-T1'), -1)
})

test('sans --executer, le plan s affiche et RIEN n est touche', () => {
  const r = hub()
  const { code, sortie } = lancer(r)
  assert.equal(code, 0, sortie)
  assert.match(sortie, /supprimer app-a\/test\/1\.2\.0-T2\//)
  assert.match(sortie, /supprimer app-a\/test\/1\.1\.1-T1\//)
  assert.ok(existsSync(join(r, 'app-a/test/1.1.1-T1/app.apk')))
  assert.equal(Object.keys(JSON.parse(readFileSync(join(r, '.hub-guide.json'), 'utf8'))).length, 4)
})

test('avec --executer : les 3 plus recents restent, livre et archive intacts, les marques mortes s eteignent', () => {
  const r = hub()
  const { code, sortie } = lancer(r, '--executer')
  assert.equal(code, 0, sortie)
  for (const v of ['1.2.0-T10', '1.2.0-T9', '1.2.0-T8']) assert.ok(existsSync(join(r, `app-a/test/${v}`)), `${v} garde`)
  for (const v of ['1.2.0-T2', '1.1.1-T1']) assert.ok(!existsSync(join(r, `app-a/test/${v}`)), `${v} supprime`)
  for (const v of ['2.0.0-T1', '2.0.0-T2']) assert.ok(existsSync(join(r, `app-b/test/${v}`)), `app-b ${v} : moins de 3, tout reste`)
  assert.ok(existsSync(join(r, 'app-a/deployed/1.1.1/app.apk')), 'la version livree ne se touche pas')
  assert.ok(existsSync(join(r, 'app-a/archive/2026-09/1.0.0/app.apk')), 'l archive ne se touche pas')
  assert.ok(existsSync(join(r, 'Docs/tests/guide.md')))
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(r, '.hub-guide.json'), 'utf8'))).sort(), [
    'app-a/test/1.2.0-T10/app.apk',
    'app-b/test/2.0.0-T2/CHECKLIST.md',
  ])
  assert.match(sortie, /2 dossier\(s\) supprime\(s\), 2 marque\(s\) eteinte\(s\)/)
})

test('--garder choisit le nombre ; 0 est refuse', () => {
  const r = hub()
  assert.equal(lancer(r, '--garder', '1', '--executer').code, 0)
  assert.ok(existsSync(join(r, 'app-a/test/1.2.0-T10')) && !existsSync(join(r, 'app-a/test/1.2.0-T9')))
  assert.ok(existsSync(join(r, 'app-b/test/2.0.0-T2')) && !existsSync(join(r, 'app-b/test/2.0.0-T1')))
  const { code, sortie } = lancer(hub(), '--garder', '0')
  assert.equal(code, 1)
  assert.match(sortie, /entier >= 1/)
})
