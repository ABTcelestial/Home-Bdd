'use client'

/** Appels API cote navigateur : messages d'erreur lisibles, session expiree geree. */

export class ApiError extends Error {
  statut: number
  donnees: Record<string, unknown>

  constructor(message: string, statut: number, donnees: Record<string, unknown> = {}) {
    super(message)
    this.statut = statut
    this.donnees = donnees
  }
}

async function lire<T>(res: Response): Promise<T> {
  let donnees: Record<string, unknown> = {}
  try {
    donnees = (await res.json()) as Record<string, unknown>
  } catch {
    if (!res.ok) throw new ApiError(`Erreur serveur (${res.status}).`, res.status)
  }

  // Session expiree : retour au login en gardant la page demandee.
  //
  // Le drapeau `auth: false` est pose par le middleware, et par lui seul. Sans
  // cette condition, le 401 legitime de l'ecran de connexion ("mot de passe
  // incorrect") declenchait le meme rechargement : la page revenait a zero sans
  // afficher la moindre erreur, et le bouton avait l'air casse.
  if (res.status === 401 && donnees.auth === false) {
    if (typeof window !== 'undefined') {
      const suite = window.location.pathname + window.location.search
      window.location.href = `/login?suite=${encodeURIComponent(suite)}`
    }
    throw new ApiError('Session expiree.', 401)
  }

  if (!res.ok || donnees.ok === false) {
    const message = typeof donnees.erreur === 'string' ? donnees.erreur : `Erreur (${res.status}).`
    throw new ApiError(message, res.status, donnees)
  }
  return donnees as T
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  return lire<T>(res)
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return lire<T>(res)
}

export function messageErreur(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Erreur inconnue.'
}

/**
 * Copie dans le presse-papiers. L'API moderne n'existe qu'en contexte securise :
 * elle marche en http://localhost mais pas en http://celestial-hub:3000, d'ou
 * le repli par un champ temporaire.
 */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(texte)
      return true
    }
  } catch {
    /* refus du navigateur : on tente le repli */
  }
  try {
    const zone = document.createElement('textarea')
    zone.value = texte
    zone.setAttribute('readonly', '')
    zone.style.position = 'fixed'
    zone.style.top = '-1000px'
    zone.style.opacity = '0'
    document.body.appendChild(zone)
    zone.select()
    const copie = document.execCommand('copy')
    document.body.removeChild(zone)
    return copie
  } catch {
    return false
  }
}

/** URL de telechargement d'un fichier. */
export function urlTelechargement(chemin: string, enLigne = false): string {
  return `/api/telecharger?chemin=${encodeURIComponent(chemin)}${enLigne ? '&vue=1' : ''}`
}

/**
 * Televersement d'un fichier avec progression. XHR plutot que fetch : c'est le
 * seul moyen d'avoir un evenement de progression a l'upload dans tous les
 * navigateurs, y compris les Safari mobiles.
 */
export function televerser(
  fichier: File,
  dossier: string,
  onProgres: (pourcent: number) => void,
): { promesse: Promise<{ chemin: string; nom: string }>; annuler: () => void } {
  const xhr = new XMLHttpRequest()
  const nom = (fichier as File & { hubNom?: string }).hubNom || fichier.name
  const url = `/api/televerser?dossier=${encodeURIComponent(dossier)}&nom=${encodeURIComponent(nom)}`

  const promesse = new Promise<{ chemin: string; nom: string }>((resolve, reject) => {
    xhr.open('POST', url, true)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgres(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let donnees: { ok?: boolean; erreur?: string; chemin?: string; nom?: string } = {}
      try {
        donnees = JSON.parse(xhr.responseText)
      } catch {
        /* reponse illisible */
      }
      if (xhr.status === 401) {
        window.location.href = '/login'
        reject(new ApiError('Session expiree.', 401))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300 && donnees.ok !== false) {
        onProgres(100)
        resolve({ chemin: donnees.chemin || '', nom: donnees.nom || nom })
      } else {
        reject(new ApiError(donnees.erreur || `Echec du transfert (${xhr.status}).`, xhr.status))
      }
    }
    xhr.onerror = () => reject(new ApiError('Connexion au serveur perdue.', 0))
    xhr.onabort = () => reject(new ApiError('Transfert annule.', 0))
    xhr.send(fichier)
  })

  return { promesse, annuler: () => xhr.abort() }
}
