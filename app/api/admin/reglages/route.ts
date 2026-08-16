import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getConfig, updateConfig, hashPassword, defaultRoot, ensureRoot } from '@/lib/config'
import { checkRoot, invalidateScan, scanRoot } from '@/lib/tree'
import { ensureDb } from '@/lib/db'
import { notifyChange } from '@/lib/events'
import { fail, handle, requireLocal } from '@/lib/api'
import { TRASH_DIR } from '@/lib/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Adresses IPv4 du PC serveur, a communiquer au PC client (PRD 5.9). */
function adressesReseau(): string[] {
  const out: string[] = []
  const nets = os.networkInterfaces()
  for (const nom of Object.keys(nets)) {
    for (const net of nets[nom] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

export async function GET(req: Request) {
  return handle(async () => {
    const refus = requireLocal(req)
    if (refus) return refus

    const cfg = getConfig()
    const etat = await checkRoot(cfg.racine)
    let totals = { dossiers: 0, fichiers: 0, taille: 0 }
    if (etat.ok) totals = (await scanRoot()).totals

    return Response.json({
      ok: true,
      racine: cfg.racine,
      racineParDefaut: defaultRoot(),
      racineValide: etat.ok,
      erreurRacine: etat.erreur,
      motDePassePersonnalise: Boolean(cfg.passwordHash),
      port: Number(process.env.PORT || 3000),
      adresses: adressesReseau(),
      hote: os.hostname(),
      plateforme: process.platform,
      totals,
    })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const refus = requireLocal(req)
    if (refus) return refus

    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      chemin?: string
      motDePasse?: string
    }

    switch (body.action) {
      case 'racine': {
        const chemin = (body.chemin || '').trim()
        if (!chemin) return fail('Chemin manquant.')
        if (!path.isAbsolute(chemin)) return fail('Indiquez un chemin complet (ex. D:\\Projets\\Celestial).')

        const etat = await checkRoot(chemin)
        if (!etat.ok) return fail(etat.erreur || 'Dossier invalide.')

        updateConfig({ racine: path.normalize(chemin) })
        invalidateScan()
        await ensureRoot()
        await ensureDb() // db.json vierge si la nouvelle racine n'en a pas
        notifyChange()
        return Response.json({ ok: true, racine: getConfig().racine })
      }

      case 'motdepasse': {
        const motDePasse = (body.motDePasse || '').trim()
        if (motDePasse.length < 4) return fail('Mot de passe trop court (4 caracteres minimum).')
        updateConfig({ passwordHash: hashPassword(motDePasse) })
        return Response.json({ ok: true })
      }

      case 'rescan': {
        invalidateScan()
        const scan = await scanRoot(true)
        notifyChange()
        return Response.json({ ok: true, totals: scan.totals })
      }

      case 'creerRacine': {
        const chemin = (body.chemin || '').trim()
        if (!chemin || !path.isAbsolute(chemin)) return fail('Chemin complet requis.')
        await fsp.mkdir(chemin, { recursive: true })
        await fsp.mkdir(path.join(chemin, TRASH_DIR), { recursive: true })
        return Response.json({ ok: true })
      }

      default:
        return fail('Action inconnue.')
    }
  })
}
