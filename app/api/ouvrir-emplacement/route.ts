import fsp from 'node:fs/promises'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { getRoot } from '@/lib/config'
import { resolveInRoot } from '@/lib/paths'
import { handle, requireLocal, ok, fail, fsErrorMessage } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Un service Windows tourne en "session 0", isolee du bureau : l'Explorateur
 * qu'on y lancerait ne s'afficherait sur aucun ecran. On detecte le cas pour
 * renvoyer le chemin a copier plutot que d'ouvrir une fenetre fantome.
 */
function sessionInteractive(): boolean {
  const session = process.env.SESSIONNAME
  if (!session || /^services$/i.test(session)) return false
  try {
    if (os.userInfo().username.toUpperCase() === 'SYSTEM') return false
  } catch {
    // userInfo echoue sous certains comptes de service : on suppose le pire.
    return false
  }
  return true
}

/**
 * Ouvre l'emplacement d'un element dans l'Explorateur du PC serveur.
 * Reserve au PC serveur, comme le vidage de corbeille : le bouton n'est pas
 * affiche aux clients, et l'API refuse toute requete non locale.
 *
 * Reponse :
 *   { ok: true, ouvert: true,  chemin }             -> fenetre ouverte
 *   { ok: true, ouvert: false, chemin, raison }     -> impossible ici, a copier
 */
export async function POST(req: Request) {
  return handle(async () => {
    const refus = requireLocal(req)
    if (refus) return refus

    const corps = (await req.json().catch(() => ({}))) as { chemin?: unknown }
    const chemin = corps.chemin
    if (typeof chemin !== 'string' || !chemin.trim()) return fail('Chemin manquant.')

    // Refuse toute sortie de la racine et l'acces direct a la corbeille.
    const abs = resolveInRoot(getRoot(), chemin)

    let estFichier: boolean
    try {
      estFichier = (await fsp.stat(abs)).isFile()
    } catch (err) {
      return fail(fsErrorMessage(err), 404)
    }

    if (process.platform !== 'win32') return ok({ ouvert: false, chemin: abs, raison: 'plateforme' })
    if (!sessionInteractive()) return ok({ ouvert: false, chemin: abs, raison: 'service' })

    // Les guillemets sont interdits par Windows dans un nom de fichier : s'il
    // en apparait un, on refuse plutot que de construire une ligne de commande
    // douteuse (voir windowsVerbatimArguments ci-dessous).
    if (abs.includes('"')) return fail('Chemin illisible par l\'Explorateur.', 400)

    // spawn sans shell : aucune interpolation de commande n'est possible.
    // windowsVerbatimArguments est indispensable ici : explorer.exe attend
    // exactement `/select,"C:\...\fichier.txt"` et ne comprend pas la citation
    // que Node ajouterait autour de l'argument entier.
    // explorer.exe renvoie par ailleurs un code de sortie 1 meme en cas de
    // succes : on detache le processus et on ne l'attend pas.
    const ligne = estFichier ? `/select,"${abs}"` : `"${abs}"`
    spawn('explorer.exe', [ligne], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    }).unref()

    return ok({ ouvert: true, chemin: abs })
  })
}
