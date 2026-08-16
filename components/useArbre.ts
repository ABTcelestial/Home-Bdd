'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, messageErreur } from '@/lib/client'
import type { TreePayload } from '@/lib/types'

/**
 * Source unique de verite cote navigateur (PRD 5.6).
 * SSE en priorite, avec un polling de secours : si le flux tombe (WiFi qui
 * bascule, onglet mis en veille par le telephone), l'arbre reste a jour.
 */
export function useArbre() {
  const [donnees, setDonnees] = useState<TreePayload | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [connecte, setConnecte] = useState(false)
  const enCours = useRef(false)

  const recharger = useCallback(async (rescan = false) => {
    if (enCours.current) return
    enCours.current = true
    try {
      const payload = await apiGet<TreePayload>(`/api/arbre${rescan ? '?rescan=1' : ''}`)
      setDonnees(payload)
      setErreur(null)
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      enCours.current = false
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void recharger()

    let minuteur: number | undefined
    const planifier = (delai: number) => {
      window.clearTimeout(minuteur)
      minuteur = window.setTimeout(() => {
        void recharger()
        planifier(delai)
      }, delai)
    }

    let source: EventSource | null = null
    try {
      source = new EventSource('/api/evenements')
      source.addEventListener('hello', () => {
        setConnecte(true)
        planifier(30_000) // SSE actif : filet de securite tres espace
      })
      source.addEventListener('change', () => {
        void recharger()
      })
      source.onerror = () => {
        setConnecte(false)
        planifier(6_000) // SSE tombe : on repasse en polling rapproche
      }
    } catch {
      planifier(6_000)
    }

    // Retour sur l'onglet / reveil du telephone : on resynchronise tout de suite.
    const surReveil = () => {
      if (document.visibilityState === 'visible') void recharger()
    }
    document.addEventListener('visibilitychange', surReveil)
    window.addEventListener('focus', surReveil)
    window.addEventListener('online', surReveil)

    return () => {
      window.clearTimeout(minuteur)
      source?.close()
      document.removeEventListener('visibilitychange', surReveil)
      window.removeEventListener('focus', surReveil)
      window.removeEventListener('online', surReveil)
    }
  }, [recharger])

  return { donnees, chargement, erreur, connecte, recharger }
}
