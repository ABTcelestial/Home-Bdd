import fsp from 'node:fs/promises'
import { getRoot } from '@/lib/config'
import { normalizeRel, resolveInRoot, baseName } from '@/lib/paths'
import { extOf, isMarkdown, maybeText, MAX_EDITABLE_SIZE } from '@/lib/filetypes'
import { notifyChange } from '@/lib/events'
import { fail, handle, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APERCU_MAX = 512 * 1024 // lecture partielle des fichiers trop gros

function estBinaire(buf: Buffer): boolean {
  const taille = Math.min(buf.length, 8192)
  for (let i = 0; i < taille; i++) if (buf[i] === 0) return true
  return false
}

/** Lecture d'un fichier texte pour l'editeur integre (PRD 5.8). */
export async function GET(req: Request) {
  return handle(async () => {
    const chemin = normalizeRel(new URL(req.url).searchParams.get('chemin'))
    if (!chemin) return fail('Chemin manquant.')

    const abs = resolveInRoot(getRoot(), chemin)
    let stat
    try {
      stat = await fsp.stat(abs)
    } catch (err) {
      return fail(fsErrorMessage(err), 404)
    }
    if (!stat.isFile()) return fail('Seuls les fichiers peuvent etre ouverts.')

    const nom = baseName(chemin)
    const ext = extOf(nom)
    if (!maybeText(nom, ext)) {
      return fail("Ce format ne s'ouvre pas dans l'editeur. Telechargez-le pour l'ouvrir sur votre PC.", 415)
    }

    const tropGros = stat.size > MAX_EDITABLE_SIZE
    const aLire = tropGros ? APERCU_MAX : stat.size

    let buf: Buffer
    if (tropGros) {
      const handleFile = await fsp.open(abs, 'r')
      try {
        const tmp = Buffer.alloc(aLire)
        const { bytesRead } = await handleFile.read(tmp, 0, aLire, 0)
        buf = tmp.subarray(0, bytesRead)
      } finally {
        await handleFile.close()
      }
    } else {
      buf = await fsp.readFile(abs)
    }

    if (estBinaire(buf)) {
      return fail("Ce fichier n'est pas du texte. Telechargez-le pour l'ouvrir sur votre PC.", 415)
    }

    let contenu = buf.toString('utf8')
    if (contenu.charCodeAt(0) === 0xfeff) contenu = contenu.slice(1) // BOM Windows

    return Response.json({
      ok: true,
      chemin,
      nom,
      contenu,
      taille: stat.size,
      mtime: stat.mtimeMs,
      markdown: isMarkdown(ext),
      lectureSeule: tropGros,
      tronque: tropGros,
    })
  })
}

/** Enregistrement depuis l'editeur : ecriture atomique (tmp + rename). */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      chemin?: string
      contenu?: string
      mtimeConnu?: number
      forcer?: boolean
    }
    const chemin = normalizeRel(body.chemin)
    const contenu = typeof body.contenu === 'string' ? body.contenu : null
    if (!chemin || contenu === null) return fail('Requete incomplete.')
    if (Buffer.byteLength(contenu, 'utf8') > MAX_EDITABLE_SIZE) {
      return fail('Fichier trop volumineux pour etre enregistre depuis l\'editeur (5 Mo maximum).')
    }

    const abs = resolveInRoot(getRoot(), chemin)
    let stat
    try {
      stat = await fsp.stat(abs)
    } catch (err) {
      return fail(fsErrorMessage(err), 404)
    }
    if (!stat.isFile()) return fail('Seuls les fichiers peuvent etre enregistres.')

    // Verrouillage simple (PRD 5.8) : on avertit si quelqu'un a enregistre
    // entre-temps ; le dernier qui confirme ecrase.
    if (!body.forcer && typeof body.mtimeConnu === 'number' && body.mtimeConnu > 0) {
      if (Math.abs(stat.mtimeMs - body.mtimeConnu) > 1000) {
        return Response.json(
          {
            ok: false,
            conflit: true,
            erreur: 'Ce fichier a ete modifie ailleurs depuis son ouverture.',
            mtime: stat.mtimeMs,
          },
          { status: 409 },
        )
      }
    }

    const tmp = `${abs}.hub-tmp`
    try {
      await fsp.writeFile(tmp, contenu, 'utf8')
      await fsp.rename(tmp, abs)
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => undefined)
      return fail(fsErrorMessage(err), 400)
    }

    const apres = await fsp.stat(abs)
    notifyChange()
    return Response.json({ ok: true, chemin, mtime: apres.mtimeMs, taille: apres.size })
  })
}
