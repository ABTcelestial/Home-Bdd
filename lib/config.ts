import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

/**
 * Configuration locale du serveur (jamais commitee) :
 *   data/config.json  ->  { racine, passwordHash, secret }
 *
 * Elle sert uniquement a savoir OU se trouve la racine et a valider les
 * sessions. Toutes les metadonnees metier (notes, corbeille) vivent dans le
 * db.json place a la racine, comme decrit dans le PRD.
 */

export type HubConfig = {
  racine: string
  passwordHash: string | null
  secret: string
}

const DATA_DIR = process.env.HUB_DATA_DIR || path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

export function defaultRoot(): string {
  if (process.env.HUB_ROOT) return process.env.HUB_ROOT
  if (process.platform === 'win32') return 'C:\\CelestialHub'
  return path.join(os.homedir(), 'CelestialHub')
}

let cache: HubConfig | null = null

function readRaw(): Partial<HubConfig> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function getConfig(): HubConfig {
  if (cache) return cache
  const raw = readRaw()
  const cfg: HubConfig = {
    racine: raw.racine || defaultRoot(),
    passwordHash: raw.passwordHash || null,
    secret: raw.secret || process.env.HUB_SECRET || crypto.randomBytes(32).toString('hex'),
  }
  // Premier demarrage : on fige le secret pour que les sessions survivent aux
  // redemarrages du service Windows.
  if (!raw.secret) writeConfig(cfg)
  cache = cfg
  return cfg
}

export function writeConfig(cfg: HubConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = CONFIG_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8')
  fs.renameSync(tmp, CONFIG_FILE)
  cache = cfg
}

export function updateConfig(patch: Partial<HubConfig>): HubConfig {
  const next = { ...getConfig(), ...patch }
  writeConfig(next)
  return next
}

export function getRoot(): string {
  return getConfig().racine
}

/** Cree la racine si elle n'existe pas encore (premier demarrage). */
export async function ensureRoot(): Promise<string> {
  const root = getRoot()
  await fsp.mkdir(root, { recursive: true })
  await fsp.mkdir(path.join(root, '.corbeille'), { recursive: true })
  return root
}

/* ------------------------------------------------------------------ */
/* Mot de passe                                                        */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const key = crypto.scryptSync(password, salt, 32).toString('hex')
  return `scrypt$${salt}$${key}`
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

/**
 * Le mot de passe vient soit du hash stocke (change depuis l'admin), soit de
 * la variable d'environnement HUB_PASSWORD (valeur d'origine du PRD).
 */
export function verifyPassword(password: string): boolean {
  const cfg = getConfig()
  if (cfg.passwordHash) {
    const [algo, salt, key] = cfg.passwordHash.split('$')
    if (algo !== 'scrypt' || !salt || !key) return false
    const candidate = crypto.scryptSync(password, salt, 32).toString('hex')
    return safeEqual(candidate, key)
  }
  const envPassword = process.env.HUB_PASSWORD
  if (!envPassword) return false
  return safeEqual(password, envPassword)
}

/** Un mot de passe est-il configure quelque part ? (sinon : ecran d'aide) */
export function hasPassword(): boolean {
  return Boolean(getConfig().passwordHash || process.env.HUB_PASSWORD)
}
