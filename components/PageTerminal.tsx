'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronRight,
  ChevronUp,
  Folder,
  HardDrive,
  Loader2,
  Lock,
  Plus,
  TerminalSquare,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { apiDelete, apiGet, apiPost, messageErreur } from '@/lib/client'
import type { ResumeSession } from '@/lib/terminal'
import { EcranTerminal } from './EcranTerminal'
import { Modale } from './Modale'
import { useToasts } from './Toasts'

/**
 * Terminal LAN - page complete (PRD 4, 11, 15).
 *
 * Quatre etats possibles, dans cet ordre : indisponible, sans PIN, verrouille,
 * ouvert. L'interface ne montre jamais une liste de sessions a quelqu'un qui
 * n'a pas donne le PIN.
 */

type EtatComplet = {
  actif: boolean
  pinConfigure: boolean
  deverrouille: boolean
  raison: string | null
  sessions: ResumeSession[]
}

type Parcours = {
  chemin: string
  parent: string | null
  dossiers: { nom: string; chemin: string }[]
  racines?: { nom: string; chemin: string }[]
  raccourcis?: { nom: string; chemin: string }[]
}

export function PageTerminal() {
  const toasts = useToasts()
  const [etat, setEtat] = useState<EtatComplet | null>(null)
  const [chargement, setChargement] = useState(true)
  const [pin, setPin] = useState('')
  const [occupe, setOccupe] = useState<string | null>(null)
  const [active, setActive] = useState<ResumeSession | null>(null)
  const [nouvelle, setNouvelle] = useState(false)

  const charger = useCallback(async () => {
    try {
      const rep = await apiGet<EtatComplet>('/api/terminal')
      setEtat(rep)
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setChargement(false)
    }
  }, [toasts])

  useEffect(() => {
    void charger()
  }, [charger])

  const deverrouiller = async () => {
    setOccupe('pin')
    try {
      await apiPost('/api/terminal/deverrouiller', { pin })
      setPin('')
      await charger()
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setOccupe(null)
    }
  }

  const fermerSession = async (id: string) => {
    setOccupe(id)
    try {
      await apiDelete(`/api/terminal?id=${encodeURIComponent(id)}`)
      if (active?.id === id) setActive(null)
      await charger()
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setOccupe(null)
    }
  }

  /* ---------------------------------------------------------------- */

  if (active) {
    return (
      <main className="terminal-page">
        <header className="entete">
          <button
            type="button"
            className="btn-icone"
            onClick={() => setActive(null)}
            aria-label="Retour aux sessions"
            title="Retour aux sessions"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="entete-titre">
            <TerminalSquare size={18} strokeWidth={1.7} aria-hidden />
            <span>Terminal LAN</span>
          </div>
        </header>
        <EcranTerminal
          session={active}
          onFermerSession={() => {
            void fermerSession(active.id)
          }}
        />
      </main>
    )
  }

  return (
    <main className="terminal-page">
      <header className="entete">
        <Link href="/" className="btn-icone" aria-label="Retour au Hub" title="Retour au Hub">
          <ArrowLeft size={18} />
        </Link>
        <div className="entete-titre">
          <TerminalSquare size={18} strokeWidth={1.7} aria-hidden />
          <span>Terminal LAN</span>
        </div>
      </header>

      <div className="terminal-contenu">
        {chargement ? (
          <p className="champ-aide">
            <Loader2 size={15} className="tourne" aria-hidden /> Chargement...
          </p>
        ) : !etat?.actif ? (
          <section className="carte">
            <div className="carte-entete">
              <TriangleAlert size={16} aria-hidden /> Terminal indisponible
            </div>
            <div className="carte-corps">
              <p className="champ-aide">{etat?.raison || 'Le Terminal LAN n&apos;est pas disponible.'}</p>
            </div>
          </section>
        ) : !etat.pinConfigure ? (
          <section className="carte">
            <div className="carte-entete">
              <Lock size={16} aria-hidden /> Terminal ferme
            </div>
            <div className="carte-corps">
              <p className="champ-aide">
                Aucun PIN n&apos;est defini. Le Terminal LAN reste ferme tant qu&apos;un PIN
                n&apos;a pas ete pose depuis <strong>Reglages</strong>, sur le PC serveur.
              </p>
            </div>
          </section>
        ) : !etat.deverrouille ? (
          <section className="carte carte-pin">
            <div className="carte-entete">
              <Lock size={16} aria-hidden /> PIN du terminal
            </div>
            <div className="carte-corps">
              <p className="champ-aide">
                Ce PIN est different du mot de passe du Hub. Il ouvre un acces complet au PC.
              </p>
              <form
                className="ligne-champ"
                onSubmit={(e) => {
                  e.preventDefault()
                  void deverrouiller()
                }}
              >
                <input
                  className="champ"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="PIN"
                  autoComplete="off"
                  aria-label="PIN du terminal"
                />
                <button
                  type="submit"
                  className="btn btn-principal"
                  disabled={occupe === 'pin' || pin.length === 0}
                >
                  {occupe === 'pin' ? <Loader2 size={15} className="tourne" /> : <Lock size={15} />}
                  Ouvrir
                </button>
              </form>
            </div>
          </section>
        ) : (
          <>
            <div className="terminal-actions">
              <button type="button" className="btn btn-principal" onClick={() => setNouvelle(true)}>
                <Plus size={15} /> Nouvelle session
              </button>
            </div>

            {etat.sessions.length === 0 ? (
              <p className="champ-aide">
                Aucune session ouverte. « Nouvelle session » lance un PowerShell sur le PC.
              </p>
            ) : (
              <ul className="terminal-liste">
                {etat.sessions.map((s) => (
                  <li key={s.id} className="terminal-item">
                    <button
                      type="button"
                      className="terminal-item-corps"
                      onClick={() => setActive(s)}
                    >
                      <span
                        className={`terminal-pastille ${s.vivante ? 'vivante' : 'morte'}`}
                        aria-hidden
                      />
                      <span className="terminal-item-texte">
                        <span className="terminal-item-titre">{s.titre}</span>
                        <span className="terminal-item-chemin">{s.cwd}</span>
                      </span>
                      <span className="terminal-item-meta">
                        {s.vivante ? `${s.clients} connecte(s)` : `termine (${s.codeSortie})`}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-icone"
                      onClick={() => void fermerSession(s.id)}
                      disabled={occupe === s.id}
                      aria-label={`Fermer ${s.titre}`}
                      title="Fermer la session"
                    >
                      {occupe === s.id ? (
                        <Loader2 size={16} className="tourne" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {nouvelle ? (
        <DialogueNouvelleSession
          onFermer={() => setNouvelle(false)}
          onCreee={(s) => {
            setNouvelle(false)
            setActive(s)
            void charger()
          }}
        />
      ) : null}
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* Nouvelle session : titre + dossier choisi couche par couche         */
/* ------------------------------------------------------------------ */

function DialogueNouvelleSession({
  onFermer,
  onCreee,
}: {
  onFermer: () => void
  onCreee: (s: ResumeSession) => void
}) {
  const toasts = useToasts()
  const [titre, setTitre] = useState('')
  const [parcours, setParcours] = useState<Parcours | null>(null)
  const [chargement, setChargement] = useState(true)
  const [occupe, setOccupe] = useState(false)

  /**
   * Une couche a la fois : chaque appel ne demande QUE les sous-dossiers
   * directs du dossier ouvert. On ne construit jamais l'arbre entier - c'est
   * ce qui rend le choix instantane meme sur un gros disque.
   */
  const aller = useCallback(
    async (chemin: string) => {
      setChargement(true)
      try {
        const rep = await apiGet<Parcours>(
          `/api/terminal/parcourir${chemin ? `?chemin=${encodeURIComponent(chemin)}` : ''}`,
        )
        setParcours(rep)
      } catch (err) {
        toasts.erreur(messageErreur(err))
      } finally {
        setChargement(false)
      }
    },
    [toasts],
  )

  useEffect(() => {
    void aller('')
  }, [aller])

  const creer = async () => {
    setOccupe(true)
    try {
      const rep = await apiPost<{ session: ResumeSession }>('/api/terminal', {
        titre: titre.trim() || undefined,
        cwd: parcours?.chemin || undefined,
        cols: 100,
        rows: 30,
      })
      onCreee(rep.session)
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Modale
      titre="Nouvelle session"
      icone={<TerminalSquare size={17} aria-hidden />}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer} data-secondaire>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-principal"
            onClick={() => void creer()}
            disabled={occupe || !parcours?.chemin}
          >
            {occupe ? <Loader2 size={15} className="tourne" /> : <TerminalSquare size={15} />}
            Ouvrir ici
          </button>
        </>
      }
    >
      <input
        className="champ"
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        placeholder="Nom de la session (facultatif)"
        aria-label="Nom de la session"
        style={{ marginBottom: 10 }}
      />

      <p className="champ-aide">Dossier de depart :</p>
      <p className="mono terminal-choix">{parcours?.chemin || '...'}</p>

      {parcours?.raccourcis?.length ? (
        <div className="terminal-raccourcis">
          {parcours.raccourcis.map((r) => (
            <button key={r.chemin} type="button" className="btn" onClick={() => void aller(r.chemin)}>
              <Folder size={14} color="#ca8a04" fill="#fde68a" strokeWidth={1.7} aria-hidden />
              {r.nom}
            </button>
          ))}
          {parcours.racines?.map((r) => (
            <button key={r.chemin} type="button" className="btn" onClick={() => void aller(r.chemin)}>
              <HardDrive size={14} aria-hidden />
              {r.nom}
            </button>
          ))}
        </div>
      ) : null}

      <div className="terminal-explorateur">
        {chargement ? (
          <p className="champ-aide">
            <Loader2 size={14} className="tourne" aria-hidden /> Lecture du dossier...
          </p>
        ) : (
          <>
            {parcours?.parent ? (
              <button type="button" className="ligne" onClick={() => void aller(parcours.parent!)}>
                <ChevronUp size={16} aria-hidden />
                <span className="ligne-nom">Remonter</span>
              </button>
            ) : null}
            {parcours?.dossiers.length === 0 ? (
              <p className="champ-aide">Ce dossier ne contient aucun sous-dossier.</p>
            ) : (
              parcours?.dossiers.map((d) => (
                <button key={d.chemin} type="button" className="ligne" onClick={() => void aller(d.chemin)}>
                  <Folder size={16} color="#ca8a04" fill="#fde68a" strokeWidth={1.7} aria-hidden />
                  <span className="ligne-nom">{d.nom}</span>
                  <ChevronRight size={14} aria-hidden />
                </button>
              ))
            )}
          </>
        )}
      </div>
    </Modale>
  )
}
