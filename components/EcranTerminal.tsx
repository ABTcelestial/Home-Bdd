'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal as TerminalXterm } from '@xterm/xterm'
import type { FitAddon as FitAddonType } from '@xterm/addon-fit'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerDownLeft,
  Loader2,
  RefreshCw,
  Send,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useTerminalSocket, type EtatConnexion } from './useTerminalSocket'
import type { ResumeSession } from '@/lib/terminal'
import '@xterm/xterm/css/xterm.css'

/**
 * L'ecran d'une session (PRD 12, 13, 14, 20, 22).
 *
 * xterm.js plutot qu'une zone de texte : sans lui, pas de couleurs ANSI, pas de
 * curseur, pas d'ecran alterne - donc pas de Claude Code utilisable.
 */

/** Sequences envoyees par la barre de touches (PRD 13). */
const FLECHES = {
  haut: '\u001b[A',
  bas: '\u001b[B',
  droite: '\u001b[C',
  gauche: '\u001b[D',
}
const ECHAP = '\u001b'
const TABULATION = '\t'
const ENTREE = '\r'

/**
 * Terminal sombre dans une application claire, comme le panneau de terminal
 * d'un editeur : les couleurs ANSI sont concues pour un fond sombre, et
 * l'interface de Claude Code y est nettement plus lisible.
 */
const THEME = {
  background: '#12141a',
  foreground: '#e6e8eb',
  cursor: '#e6e8eb',
  cursorAccent: '#12141a',
  selectionBackground: 'rgba(31, 111, 235, 0.45)',
  black: '#12141a',
  red: '#ff6b6b',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e6e8eb',
  brightBlack: '#6b7280',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
}

const LIBELLE_ETAT: Record<EtatConnexion, string> = {
  connexion: 'Connexion...',
  connecte: 'Connecte',
  perdu: 'Connexion perdue',
  reconnexion: 'Reconnexion...',
  termine: 'Session terminee',
}

export function EcranTerminal({
  session,
  onFermerSession,
}: {
  session: ResumeSession
  onFermerSession: () => void
}) {
  const conteneur = useRef<HTMLDivElement>(null)
  const term = useRef<TerminalXterm | null>(null)
  const fit = useRef<FitAddonType | null>(null)
  /** Sortie arrivee avant que xterm ne soit pret : on ne la perd pas. */
  const enAttente = useRef<string[]>([])
  const [pret, setPret] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [ctrlArme, setCtrlArme] = useState(false)
  const [fini, setFini] = useState<number | null>(null)

  const taille = useCallback(() => {
    const t = term.current
    return { cols: t?.cols || 80, rows: t?.rows || 24 }
  }, [])

  const ecrire = useCallback((data: string) => {
    if (term.current) term.current.write(data)
    else enAttente.current.push(data)
  }, [])

  const socket = useTerminalSocket({
    sessionId: session.id,
    onSortie: ecrire,
    onPret: () => {
      setFini(null)
      // La socket s'ouvre avant que xterm ne soit monte : le message `auth` a
      // donc pu partir avec la taille de repli. Des que la connexion est prete,
      // on repousse la taille reelle - c'est ce qui evite un affichage
      // superpose au premier affichage comme apres chaque reconnexion.
      const t = term.current
      if (t) envoyerTailleRef.current(t.cols, t.rows)
    },
    onFin: (code) => setFini(code),
    onErreur: (message, fatale) => {
      // Une erreur non fatale (message mal forme) n'a pas a polluer l'ecran du
      // terminal : seule une erreur qui arrete tout merite d'y apparaitre.
      if (fatale) ecrire(`\r\n\u001b[31m${message}\u001b[m\r\n`)
    },
    taille,
  })

  const envoyerTailleRef = useRef(socket.envoyerTaille)
  envoyerTailleRef.current = socket.envoyerTaille

  /* ---------------------------------------------------------------- */
  /* Mise en place de xterm                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let annule = false
    let nettoyer = () => {}

    void (async () => {
      // Import dynamique : xterm touche `window` des son chargement et ne peut
      // donc pas etre evalue pendant le rendu serveur.
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      if (annule || !conteneur.current) return

      const t = new Terminal({
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        fontSize: window.innerWidth < 768 ? 12 : 13,
        lineHeight: 1.2,
        cursorBlink: true,
        scrollback: 5000,
        theme: THEME,
        // Le telephone doit pouvoir selectionner du texte au doigt.
        rightClickSelectsWord: true,
        allowProposedApi: true,
      })
      const f = new FitAddon()
      t.loadAddon(f)
      t.open(conteneur.current)

      // Les ecouteurs AVANT le premier `fit()`, sans quoi l'ajustement initial
      // n'est jamais transmis : le PTY resterait a la taille de repli pendant
      // que xterm affiche une autre grille, et ConPTY - qui positionne son
      // curseur en absolu - ecrirait par-dessus les lignes precedentes.
      t.onData((donnees) => socket.envoyerEntree(donnees))
      t.onResize(({ cols, rows }) => envoyerTailleRef.current(cols, rows))

      f.fit()
      envoyerTailleRef.current(t.cols, t.rows)

      term.current = t
      fit.current = f
      for (const morceau of enAttente.current) t.write(morceau)
      enAttente.current = []
      setPret(true)

      nettoyer = () => {
        t.dispose()
        term.current = null
        fit.current = null
      }
    })()

    return () => {
      annule = true
      nettoyer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------------------------------------------------------- */
  /* Redimensionnement (PRD 22)                                        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!pret) return
    let minuteur: number | null = null

    const ajuster = () => {
      if (minuteur !== null) window.clearTimeout(minuteur)
      // Le passage portrait -> paysage se fait en plusieurs etapes : on attend
      // que la mise en page se stabilise avant de mesurer.
      minuteur = window.setTimeout(() => {
        try {
          fit.current?.fit()
        } catch {
          /* conteneur pas encore mesurable */
        }
      }, 150)
    }

    const observateur = new ResizeObserver(ajuster)
    if (conteneur.current) observateur.observe(conteneur.current)
    window.addEventListener('orientationchange', ajuster)
    // Le clavier virtuel change la hauteur utile sans declencher `resize`.
    window.visualViewport?.addEventListener('resize', ajuster)

    return () => {
      if (minuteur !== null) window.clearTimeout(minuteur)
      observateur.disconnect()
      window.removeEventListener('orientationchange', ajuster)
      window.visualViewport?.removeEventListener('resize', ajuster)
    }
  }, [pret])

  /* ---------------------------------------------------------------- */
  /* Touches speciales (PRD 13)                                        */
  /* ---------------------------------------------------------------- */

  const touche = (sequence: string) => {
    socket.envoyerEntree(sequence)
    term.current?.focus()
  }

  const controle = (lettre: string) => {
    // Ctrl+<lettre> = l'octet de controle correspondant.
    const code = lettre.toUpperCase().charCodeAt(0)
    if (code >= 64 && code <= 95) socket.envoyerEntree(String.fromCharCode(code - 64))
  }

  const envoyerSaisie = () => {
    if (ctrlArme) {
      const premier = saisie.trim()[0]
      if (premier) controle(premier)
      setCtrlArme(false)
      setSaisie('')
      return
    }
    /**
     * Le texte PUIS la validation, en deux envois separes.
     *
     * Mesure faite avec Claude Code : envoyer `texte + \r` d'un seul bloc est
     * lu comme un collage, et la TUI insere alors un saut de ligne au lieu de
     * valider - le texte reste dans l'invite. Un `\r` isole, lui, vaut bien un
     * appui sur Entree. PowerShell accepte les deux, Claude Code non.
     */
    socket.envoyerEntree(saisie)
    const rappel = socket.envoyerEntree
    window.setTimeout(() => rappel(ENTREE), 40)
    setSaisie('')
  }

  const etatConnecte = socket.etat === 'connecte'

  return (
    <div className="terminal-ecran">
      <div className="terminal-barre">
        <div className="terminal-identite">
          <span className="terminal-titre" title={session.cwd}>
            {session.titre}
          </span>
          <span className="terminal-chemin">{session.cwd}</span>
        </div>
        <span
          className={`terminal-etat terminal-etat-${socket.etat}`}
          title={socket.message || LIBELLE_ETAT[socket.etat]}
        >
          {socket.etat === 'connecte' ? (
            <Wifi size={14} aria-hidden />
          ) : socket.etat === 'reconnexion' || socket.etat === 'connexion' ? (
            <Loader2 size={14} className="tourne" aria-hidden />
          ) : (
            <WifiOff size={14} aria-hidden />
          )}
          <span className="terminal-etat-texte">{LIBELLE_ETAT[socket.etat]}</span>
        </span>
      </div>

      {socket.etat === 'perdu' && socket.message ? (
        <div className="alerte alerte-danger terminal-alerte">
          <WifiOff size={15} aria-hidden />
          <span>{socket.message}</span>
          <button type="button" className="btn" onClick={socket.reconnecter}>
            <RefreshCw size={14} /> Reessayer
          </button>
        </div>
      ) : null}

      {fini !== null ? (
        <div className="alerte terminal-alerte">
          <X size={15} aria-hidden />
          <span>Le shell s&apos;est termine (code {fini}).</span>
          <button type="button" className="btn" onClick={onFermerSession}>
            Fermer la session
          </button>
        </div>
      ) : null}

      <div className="terminal-surface">
        <div ref={conteneur} className="terminal-toile" />
        {!pret ? (
          <div className="terminal-attente">
            <Loader2 size={18} className="tourne" aria-hidden /> Preparation du terminal...
          </div>
        ) : null}
      </div>

      {/* Barre de touches speciales : le clavier du telephone n'a ni Ctrl,
          ni Tab, ni fleches. Sans elle, Claude Code n'est pas pilotable. */}
      <div className="terminal-touches" role="group" aria-label="Touches speciales">
        <button
          type="button"
          className={`touche ${ctrlArme ? 'touche-armee' : ''}`}
          aria-pressed={ctrlArme}
          onClick={() => setCtrlArme((v) => !v)}
          title="Ctrl + la prochaine lettre saisie"
        >
          CTRL
        </button>
        <button type="button" className="touche" onClick={() => socket.envoyerSignal('SIGINT')} title="Interrompre">
          ^C
        </button>
        <button type="button" className="touche" onClick={() => controle('D')} title="Fin de saisie">
          ^D
        </button>
        <button type="button" className="touche" onClick={() => controle('L')} title="Effacer l'ecran">
          ^L
        </button>
        <button type="button" className="touche" onClick={() => touche(ECHAP)}>
          ESC
        </button>
        <button type="button" className="touche" onClick={() => touche(TABULATION)}>
          TAB
        </button>
        <button type="button" className="touche" onClick={() => touche(FLECHES.haut)} aria-label="Fleche haut">
          <ArrowUp size={15} />
        </button>
        <button type="button" className="touche" onClick={() => touche(FLECHES.bas)} aria-label="Fleche bas">
          <ArrowDown size={15} />
        </button>
        <button type="button" className="touche" onClick={() => touche(FLECHES.gauche)} aria-label="Fleche gauche">
          <ArrowLeft size={15} />
        </button>
        <button type="button" className="touche" onClick={() => touche(FLECHES.droite)} aria-label="Fleche droite">
          <ArrowRight size={15} />
        </button>
        <button type="button" className="touche" onClick={() => touche(ENTREE)} aria-label="Entree">
          <CornerDownLeft size={15} />
        </button>
      </div>

      {/* Ligne de saisie : sur telephone, taper directement dans xterm est
          capricieux selon les claviers. Ce champ marche partout. */}
      <form
        className="terminal-saisie"
        onSubmit={(e) => {
          e.preventDefault()
          envoyerSaisie()
        }}
      >
        <input
          className="champ"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder={ctrlArme ? 'Lettre a combiner avec Ctrl...' : 'Taper une commande...'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Commande a envoyer"
          disabled={!etatConnecte}
        />
        <button type="submit" className="btn btn-principal" disabled={!etatConnecte} aria-label="Envoyer">
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}
