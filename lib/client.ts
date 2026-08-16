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
  if (res.status === 401) {
    // Session expiree : retour au login en gardant la page demandee.
    if (typeof window !== 'undefined') {
      const suite = window.location.pathname + window.location.search
      window.location.href = `/login?suite=${encodeURIComponent(suite)}`
    }
    throw new ApiError('Session expiree.', 401)
  }

  let donnees: Record<string, unknown> = {}
  try {
    donnees = (await res.json()) as Record<string, unknown>
  } catch {
    if (!res.ok) throw new ApiError(`Erreur serveur (${res.status}).`, res.status)
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
