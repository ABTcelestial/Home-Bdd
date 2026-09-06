'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiPost } from '@/lib/client'

/**
 * Socket du Terminal LAN, avec reconnexion automatique (PRD 20).
 *
 * Le telephone se verrouille, le WiFi bascule, l'onglet passe en arriere-plan :
 * la socket meurt sans prevenir. La session, elle, continue de tourner sur le
 * PC. Ce crochet reconnecte tout seul, en allant rechercher un ticket a chaque
 * tentative, et rend l'etat a afficher.
 */

export type EtatConnexion = 'connexion' | 'connecte' | 'perdu' | 'reconnexion' | 'termine'

export type InfoPret = {
  sessionId: string
  titre: string
  cwd: string
  shell: string
  cols: number
  rows: number
  vivante: boolean
}

type Options = {
  sessionId: string | null
  /** Sortie du terminal. `rejeu` = historique renvoye apres reconnexion. */
  onSortie: (data: string, rejeu: boolean) => void
  onPret: (info: InfoPret) => void
  onFin: (code: number | null) => void
  onErreur: (message: string, fatale: boolean) => void
  /** Taille courante du terminal, lue au moment de s'authentifier. */
  taille: () => { cols: number; rows: number }
}

/** Attente entre deux tentatives : rapide au debut, sans jamais s'acharner. */
const PALIERS = [500, 1000, 2000, 4000, 8000]

export function useTerminalSocket(options: Options) {
  const [etat, setEtat] = useState<EtatConnexion>('connexion')
  const [message, setMessage] = useState<string | null>(null)

  const ws = useRef<WebSocket | null>(null)
  const essai = useRef(0)
  const minuteur = useRef<number | null>(null)
  const vivant = useRef(true)
  const abandonne = useRef(false)

  // Les rappels changent a chaque rendu ; on les garde dans une reference pour
  // ne pas reconstruire la socket a chaque fois que le parent se redessine.
  const opts = useRef(options)
  opts.current = options

  const nettoyerMinuteur = () => {
    if (minuteur.current !== null) {
      window.clearTimeout(minuteur.current)
      minuteur.current = null
    }
  }

  const connecter = useCallback(async () => {
    const sessionId = opts.current.sessionId
    if (!sessionId || !vivant.current || abandonne.current) return

    setMessage(null)
    setEtat(essai.current === 0 ? 'connexion' : 'reconnexion')

    let ticket: string
    try {
      const rep = await apiPost<{ ticket: string }>('/api/terminal/ticket', { sessionId })
      ticket = rep.ticket
    } catch (err) {
      // Le ticket est refuse : session disparue, PIN expire, serveur redemarre.
      // On reessaie, la cause peut etre passagere (serveur qui redemarre).
      if (!vivant.current) return
      setEtat('perdu')
      setMessage(err instanceof Error ? err.message : 'Connexion impossible.')
      programmerReessai()
      return
    }

    if (!vivant.current) return

    const protocoleWs = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocoleWs}//${window.location.host}/api/terminal/ws`)
    ws.current = socket

    socket.onopen = () => {
      const { cols, rows } = opts.current.taille()
      socket.send(JSON.stringify({ type: 'auth', token: ticket, sessionId, cols, rows }))
    }

    socket.onmessage = (ev) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(ev.data as string)
      } catch {
        return
      }
      switch (msg.type) {
        case 'ready':
          essai.current = 0
          setEtat('connecte')
          setMessage(null)
          opts.current.onPret(msg as unknown as InfoPret)
          break
        case 'output':
          opts.current.onSortie(String(msg.data ?? ''), Boolean(msg.rejeu))
          break
        case 'exit':
          setEtat('termine')
          opts.current.onFin(typeof msg.code === 'number' ? msg.code : null)
          break
        case 'error': {
          const texte = String(msg.message ?? 'Erreur.')
          const fatale = Boolean(msg.fatale)
          opts.current.onErreur(texte, fatale)
          if (fatale) {
            setMessage(texte)
            // Une erreur fatale (session disparue, jeton refuse) ne se resout
            // pas en reessayant en boucle : on laisse la main a l'utilisateur.
            abandonne.current = true
            setEtat('perdu')
          }
          break
        }
        default:
          break
      }
    }

    socket.onclose = () => {
      if (!vivant.current || abandonne.current) return
      ws.current = null
      setEtat('perdu')
      programmerReessai()
    }

    socket.onerror = () => {
      // `close` suit toujours : on n'agit qu'une fois, la-bas.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const programmerReessai = useCallback(() => {
    if (!vivant.current || abandonne.current) return
    nettoyerMinuteur()
    const attente = PALIERS[Math.min(essai.current, PALIERS.length - 1)]
    essai.current += 1
    minuteur.current = window.setTimeout(() => {
      void connecter()
    }, attente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Reconnexion demandee a la main, apres un abandon. */
  const reconnecter = useCallback(() => {
    abandonne.current = false
    essai.current = 0
    nettoyerMinuteur()
    try {
      ws.current?.close()
    } catch {
      /* deja fermee */
    }
    ws.current = null
    void connecter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    vivant.current = true
    abandonne.current = false
    essai.current = 0
    void connecter()
    return () => {
      vivant.current = false
      nettoyerMinuteur()
      try {
        ws.current?.close()
      } catch {
        /* deja fermee */
      }
      ws.current = null
    }
  }, [options.sessionId, connecter])

  /**
   * Un telephone deverrouille revient d'un coup : plutot que d'attendre le
   * prochain palier, on retente immediatement des que l'onglet redevient
   * visible ou que le reseau revient.
   */
  useEffect(() => {
    const reveiller = () => {
      if (document.visibilityState !== 'visible') return
      if (abandonne.current) return
      if (ws.current && ws.current.readyState === WebSocket.OPEN) return
      essai.current = 0
      nettoyerMinuteur()
      void connecter()
    }
    document.addEventListener('visibilitychange', reveiller)
    window.addEventListener('online', reveiller)
    window.addEventListener('focus', reveiller)
    return () => {
      document.removeEventListener('visibilitychange', reveiller)
      window.removeEventListener('online', reveiller)
      window.removeEventListener('focus', reveiller)
    }
  }, [connecter])

  const envoyer = useCallback((objet: Record<string, unknown>) => {
    const socket = ws.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(objet))
    return true
  }, [])

  const envoyerEntree = useCallback(
    (data: string) => envoyer({ type: 'input', data }),
    [envoyer],
  )
  const envoyerTaille = useCallback(
    (cols: number, rows: number) => envoyer({ type: 'resize', cols, rows }),
    [envoyer],
  )
  const envoyerSignal = useCallback(
    (signal: string) => envoyer({ type: 'signal', signal }),
    [envoyer],
  )

  return { etat, message, envoyerEntree, envoyerTaille, envoyerSignal, reconnecter }
}
