import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { getRoot } from '@/lib/config'
import { normalizeRel, resolveInRoot, validateName, joinRel } from '@/lib/paths'
import { uniquePath } from '@/lib/fsops'
import { notifyChange } from '@/lib/events'
import { fail, handle, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 3600

/**
 * Televersement en flux brut (PRD 5.3). Le navigateur envoie un fichier par
 * requete (XHR, pour la barre de progression) ; le corps est pipe directement
 * sur le disque, donc un fichier de plusieurs Go ne sature jamais la RAM.
 *
 * POST /api/televerser?dossier=Bureautique&nom=scan.pdf
 */
export async function POST(req: Request) {
  return handle(async () => {
    const url = new URL(req.url)
    const dossier = normalizeRel(url.searchParams.get('dossier'))
    const nom = (url.searchParams.get('nom') || '').trim()

    const erreurNom = validateName(nom)
    if (erreurNom) return fail(erreurNom)

    // Un glisser-deposer de dossier peut creer une arborescence : chaque
    // segment est valide avant creation.
    for (const segment of dossier.split('/').filter(Boolean)) {
      const erreur = validateName(segment)
      if (erreur) return fail(`Dossier "${segment}" : ${erreur}`)
    }

    const root = getRoot()
    const absDir = resolveInRoot(root, dossier)
    try {
      await fsp.mkdir(absDir, { recursive: true })
    } catch (err) {
      return fail(fsErrorMessage(err), 400)
    }

    const nomFinal = url.searchParams.get('ecraser') === '1' ? nom : await uniquePath(absDir, nom)
    const absFile = path.join(absDir, nomFinal)

    if (!req.body) return fail('Corps de requete vide.')

    try {
      await pipeline(
        Readable.fromWeb(req.body as unknown as import('node:stream/web').ReadableStream),
        fs.createWriteStream(absFile),
      )
    } catch (err) {
      // Transfert interrompu (WiFi coupe, onglet ferme) : pas de fichier a moitie ecrit.
      await fsp.rm(absFile, { force: true }).catch(() => undefined)
      return fail(`Transfert interrompu : ${fsErrorMessage(err)}`, 500)
    }

    notifyChange()
    const stat = await fsp.stat(absFile).catch(() => null)
    return Response.json({
      ok: true,
      chemin: joinRel(dossier, nomFinal),
      nom: nomFinal,
      taille: stat?.size ?? 0,
      renomme: nomFinal !== nom,
    })
  })
}
