'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Database,
  Download,
  FolderOpen,
  FolderPlus,
  LogOut,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
  FolderInput,
  FilePen,
  ListTree,
  CheckSquare,
  Loader2,
  AlertTriangle,
  WifiOff,
  StickyNote,
  Sparkles,
  Check,
} from 'lucide-react'
import { useArbre } from './useArbre'
import { Arbre } from './Arbre'
import { ListePlate, type Filtre } from './ListePlate'
import { PanneauDetail } from './PanneauDetail'
import { Editeur } from './Editeur'
import { Modale } from './Modale'
import { SelecteurDossier } from './SelecteurDossier'
import { useToasts } from './Toasts'
import { apiPost, copierTexte, messageErreur, televerser, urlTelechargement } from '@/lib/client'
import { fichiersChoisis, fichiersDeposes, type FichierDepose } from '@/lib/depot'
import { baseName, joinRel, libelleDossier, parentOf, validateName } from '@/lib/chemins'
import { formatSize, maybeText, extOf } from '@/lib/filetypes'
import type { FsNode, MarqueGuide } from '@/lib/types'

type Dialogue =
  | { type: 'menu'; noeud: FsNode }
  | { type: 'nouveauDossier'; parent: string }
  | { type: 'renommer'; noeud: FsNode }
  | { type: 'supprimer'; chemins: string[] }
  | { type: 'deplacer'; chemins: string[] }
  | { type: 'plus' }
  | { type: 'guide' }

type Transfert = {
  id: number
  nom: string
  pourcent: number
  etat: 'attente' | 'encours' | 'fini' | 'erreur'
  message?: string
  annuler?: () => void
}

/** Aplatit l'arbre pour la colonne de gauche (recherche a plat). */
function aplatir(noeuds: FsNode[], sortie: FsNode[] = []): FsNode[] {
  for (const noeud of noeuds) {
    sortie.push(noeud)
    if (noeud.children) aplatir(noeud.children, sortie)
  }
  return sortie
}

const PARALLELE = 2 // transferts simultanes : au-dela le WiFi ne va pas plus vite

export function Hub() {
  const { donnees, chargement, erreur, connecte, recharger } = useArbre()
  const toasts = useToasts()

  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('tout')
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())
  const [cheminActif, setCheminActif] = useState<string | null>(null)
  const [dossierActif, setDossierActif] = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [modeSelection, setModeSelection] = useState(false)
  const [surligne, setSurligne] = useState<string | null>(null)
  const [vueMobile, setVueMobile] = useState<'arbre' | 'liste'>('arbre')
  const [editeur, setEditeur] = useState<string | null>(null)
  const [dialogue, setDialogue] = useState<Dialogue | null>(null)
  const [transferts, setTransferts] = useState<Transfert[]>([])
  const [occupe, setOccupe] = useState(false)

  const champFichiers = useRef<HTMLInputElement>(null)
  const idTransfert = useRef(0)
  const fileAttente = useRef<{ id: number; depose: FichierDepose; dossier: string }[]>([])
  const enCours = useRef(0)

  const arbre = donnees?.tree ?? []
  const notes = donnees?.notes ?? {}

  // Les marques deja acquittees ne servent plus a rien cote affichage : on ne
  // garde que ce qu'il reste a voir, dans l'ordre du fichier de guidage.
  const aFinir = useMemo(() => (donnees?.guide ?? []).filter((m) => !m.vu), [donnees])
  const marques = useMemo(() => {
    const carte = new Map<string, MarqueGuide>()
    for (const marque of aFinir) carte.set(marque.chemin, marque)
    return carte
  }, [aFinir])

  const plat = useMemo(() => aplatir(arbre), [arbre])
  const parChemin = useMemo(() => {
    const carte = new Map<string, FsNode>()
    for (const noeud of plat) carte.set(noeud.path, noeud)
    return carte
  }, [plat])

  const noeudActif = cheminActif ? parChemin.get(cheminActif) ?? null : null

  // L'element selectionne a disparu du disque (supprime depuis un autre PC).
  useEffect(() => {
    if (cheminActif && donnees && !parChemin.has(cheminActif)) setCheminActif(null)
  }, [cheminActif, donnees, parChemin])

  /* ---------------------------------------------------------------- */
  /* Navigation                                                        */
  /* ---------------------------------------------------------------- */

  const basculerDossier = useCallback((chemin: string) => {
    setOuverts((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(chemin)) suivant.delete(chemin)
      else suivant.add(chemin)
      return suivant
    })
  }, [])

  /** Depuis la liste de gauche : deplier les parents, surligner, faire defiler. */
  const localiser = useCallback((noeud: FsNode) => {
    const parents: string[] = []
    let courant = parentOf(noeud.path)
    while (courant) {
      parents.push(courant)
      courant = parentOf(courant)
    }
    setOuverts((precedent) => {
      const suivant = new Set(precedent)
      for (const parent of parents) suivant.add(parent)
      if (noeud.type === 'dir') suivant.add(noeud.path)
      return suivant
    })
    // Un dossier est juste localise (l'arbre se deplie) ; un fichier ouvre en
    // plus son panneau de detail, d'ou partent telechargement et note.
    setCheminActif(noeud.type === 'dir' ? null : noeud.path)
    setDossierActif(noeud.type === 'dir' ? noeud.path : parentOf(noeud.path))
    setSurligne(noeud.path)
    setVueMobile('arbre')
    window.setTimeout(() => setSurligne((v) => (v === noeud.path ? null : v)), 2600)
  }, [])

  // Echap ferme le panneau de detail (au clavier comme sur les feuilles mobiles).
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editeur && !dialogue) setCheminActif(null)
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [editeur, dialogue])

  useEffect(() => {
    if (!surligne) return
    const minuteur = window.setTimeout(() => {
      const cible = document.querySelector(`[data-chemin="${CSS.escape(surligne)}"]`)
      cible?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
    return () => window.clearTimeout(minuteur)
  }, [surligne, arbre])

  const ouvrirElement = useCallback((noeud: FsNode) => {
    setCheminActif(noeud.path)
    if (noeud.type === 'dir') setDossierActif(noeud.path)
    else setDossierActif(parentOf(noeud.path))
  }, [])

  const basculerSelection = useCallback((chemin: string) => {
    setSelection((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(chemin)) suivant.delete(chemin)
      else suivant.add(chemin)
      return suivant
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /* Transferts                                                        */
  /* ---------------------------------------------------------------- */

  const majTransfert = useCallback((id: number, patch: Partial<Transfert>) => {
    setTransferts((liste) => liste.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const pomper = useCallback(() => {
    while (enCours.current < PARALLELE && fileAttente.current.length > 0) {
      const tache = fileAttente.current.shift()
      if (!tache) break
      enCours.current++

      const sousDossier = tache.depose.relatif.includes('/')
        ? tache.depose.relatif.slice(0, tache.depose.relatif.lastIndexOf('/'))
        : ''
      const dossier = joinRel(tache.dossier, sousDossier)
      const nom = baseName(tache.depose.relatif)
      const fichier = Object.assign(tache.depose.fichier, { hubNom: nom })

      const { promesse, annuler } = televerser(fichier, dossier, (pourcent) =>
        majTransfert(tache.id, { pourcent, etat: 'encours' }),
      )
      majTransfert(tache.id, { etat: 'encours', annuler })

      promesse
        .then(() => {
          majTransfert(tache.id, { etat: 'fini', pourcent: 100, annuler: undefined })
        })
        .catch((err) => {
          majTransfert(tache.id, { etat: 'erreur', message: messageErreur(err), annuler: undefined })
        })
        .finally(() => {
          enCours.current--
          pomper()
          if (enCours.current === 0 && fileAttente.current.length === 0) {
            void recharger()
            window.setTimeout(() => {
              setTransferts((liste) => (liste.every((t) => t.etat === 'fini') ? [] : liste))
            }, 2500)
          }
        })
    }
  }, [majTransfert, recharger])

  const envoyer = useCallback(
    (deposes: FichierDepose[], dossier: string) => {
      if (!deposes.length) return
      const nouveaux: Transfert[] = []
      for (const depose of deposes) {
        const id = ++idTransfert.current
        nouveaux.push({ id, nom: depose.relatif, pourcent: 0, etat: 'attente' })
        fileAttente.current.push({ id, depose, dossier })
      }
      setTransferts((liste) => [...liste, ...nouveaux])
      toasts.info(
        `${deposes.length} fichier(s) vers ${libelleDossier(dossier)}`,
      )
      pomper()
    },
    [pomper, toasts],
  )

  const surDepot = useCallback(
    async (dossier: string, dt: DataTransfer) => {
      const deposes = await fichiersDeposes(dt)
      if (!deposes.length) {
        toasts.erreur('Aucun fichier detecte dans le depot.')
        return
      }
      envoyer(deposes, dossier)
    },
    [envoyer, toasts],
  )

  /* ---------------------------------------------------------------- */
  /* Actions fichiers                                                  */
  /* ---------------------------------------------------------------- */

  const telecharger = useCallback((noeud: FsNode) => {
    if (noeud.type !== 'file') return
    const lien = document.createElement('a')
    lien.href = urlTelechargement(noeud.path)
    lien.rel = 'noopener'
    document.body.appendChild(lien)
    lien.click()
    lien.remove()
  }, [])

  const creerDossier = useCallback(
    async (parent: string, nom: string) => {
      const invalide = validateName(nom)
      if (invalide) {
        toasts.erreur(invalide)
        return false
      }
      setOccupe(true)
      try {
        const rep = await apiPost<{ chemin: string }>('/api/dossier', { parent, nom })
        toasts.succes(`Dossier "${nom}" cree.`)
        setOuverts((precedent) => new Set(precedent).add(parent))
        setDossierActif(rep.chemin)
        await recharger()
        return true
      } catch (err) {
        toasts.erreur(messageErreur(err))
        return false
      } finally {
        setOccupe(false)
      }
    },
    [recharger, toasts],
  )

  const renommer = useCallback(
    async (chemin: string, nom: string) => {
      const invalide = validateName(nom)
      if (invalide) {
        toasts.erreur(invalide)
        return false
      }
      setOccupe(true)
      try {
        const rep = await apiPost<{ chemin: string }>('/api/renommer', { chemin, nom })
        setCheminActif(rep.chemin)
        toasts.succes('Renomme.')
        await recharger()
        return true
      } catch (err) {
        toasts.erreur(messageErreur(err))
        return false
      } finally {
        setOccupe(false)
      }
    },
    [recharger, toasts],
  )

  const deplacer = useCallback(
    async (chemins: string[], destination: string) => {
      setOccupe(true)
      try {
        const rep = await apiPost<{ deplaces: { vers: string }[]; erreurs: string[] }>('/api/deplacer', {
          chemins,
          destination,
        })
        if (rep.erreurs?.length) toasts.erreur(rep.erreurs.join(' '))
        if (rep.deplaces?.length) {
          toasts.succes(`${rep.deplaces.length} element(s) deplace(s) vers ${libelleDossier(destination)}.`)
          setCheminActif(rep.deplaces[0].vers)
        }
        setSelection(new Set())
        setModeSelection(false)
        await recharger()
        return true
      } catch (err) {
        toasts.erreur(messageErreur(err))
        return false
      } finally {
        setOccupe(false)
      }
    },
    [recharger, toasts],
  )

  const supprimer = useCallback(
    async (chemins: string[]) => {
      setOccupe(true)
      try {
        const rep = await apiPost<{ supprimes: number; erreurs: string[] }>('/api/supprimer', { chemins })
        if (rep.erreurs?.length) toasts.erreur(rep.erreurs.join(' '))
        if (rep.supprimes) toasts.succes(`${rep.supprimes} element(s) dans la corbeille.`)
        setSelection(new Set())
        setModeSelection(false)
        if (cheminActif && chemins.includes(cheminActif)) setCheminActif(null)
        await recharger()
        return true
      } catch (err) {
        toasts.erreur(messageErreur(err))
        return false
      } finally {
        setOccupe(false)
      }
    },
    [cheminActif, recharger, toasts],
  )

  const enregistrerNote = useCallback(
    async (chemin: string, note: string) => {
      try {
        await apiPost('/api/note', { chemin, note })
        toasts.succes('Note enregistree.')
        await recharger()
      } catch (err) {
        toasts.erreur(messageErreur(err))
      }
    },
    [recharger, toasts],
  )

  /**
   * Ouvre l'element dans l'Explorateur du PC serveur. Quand le Hub tourne en
   * service Windows il ne peut afficher aucune fenetre : on copie alors le
   * chemin pour que le coller dans l'Explorateur reste a un raccourci pres.
   */
  const ouvrirEmplacement = useCallback(
    async (chemin: string) => {
      try {
        const rep = await apiPost<{ ouvert: boolean; chemin: string; raison?: string }>(
          '/api/ouvrir-emplacement',
          { chemin },
        )
        if (rep.ouvert) {
          toasts.succes('Explorateur ouvert sur le PC serveur.')
          return
        }
        const cause =
          rep.raison === 'service'
            ? 'Le Hub tourne en service Windows : il ne peut pas ouvrir de fenetre sur ta session.'
            : "L'Explorateur n'est disponible que sur un serveur Windows."
        if (await copierTexte(rep.chemin)) {
          toasts.succes(`${cause} Chemin copie : ${rep.chemin}`)
        } else {
          toasts.erreur(`${cause} Chemin : ${rep.chemin}`)
        }
      } catch (err) {
        toasts.erreur(messageErreur(err))
      }
    },
    [toasts],
  )

  /** Acquitte une marque de guidage : elle s'eteint jusqu'a ce que Claude la reecrive. */
  const marquerVu = useCallback(
    async (marque: MarqueGuide) => {
      try {
        await apiPost('/api/guide/vu', { chemin: marque.chemin, signature: marque.signature })
        await recharger()
      } catch (err) {
        toasts.erreur(messageErreur(err))
      }
    },
    [recharger, toasts],
  )

  const deconnexion = useCallback(async () => {
    await apiPost('/api/auth/logout').catch(() => undefined)
    window.location.href = '/login'
  }, [])

  /* ---------------------------------------------------------------- */
  /* Rendu                                                             */
  /* ---------------------------------------------------------------- */

  const detailOuvert = Boolean(noeudActif)
  const cheminsSelection = Array.from(selection)

  return (
    <div className="app">
      <header className="entete">
        <div className="entete-titre">
          <Database size={20} strokeWidth={1.7} aria-hidden />
          <span>Celestial Hub</span>
          <span className="chemin" title={donnees?.racine}>
            {donnees?.racine ?? ''}
          </span>
        </div>

        <div className="entete-actions">
          {aFinir.length > 0 ? (
            <button
              type="button"
              className="btn btn-guide"
              onClick={() => setDialogue({ type: 'guide' })}
              title="Elements marques par Claude Code"
            >
              <Sparkles size={15} aria-hidden />
              {aFinir.length}
              <span className="libelle-btn">a finir</span>
            </button>
          ) : null}

          {!connecte && !chargement ? (
            <span className="btn-icone" title="Temps reel indisponible : mise a jour periodique" aria-label="Hors ligne">
              <WifiOff size={16} />
            </span>
          ) : null}

          <button
            type="button"
            className="btn masque-mobile"
            onClick={() => champFichiers.current?.click()}
            title={`Televerser dans ${libelleDossier(dossierActif)}`}
          >
            <Upload size={15} /> <span className="libelle-btn">Televerser</span>
          </button>
          <button
            type="button"
            className="btn masque-mobile"
            onClick={() => setDialogue({ type: 'nouveauDossier', parent: dossierActif })}
          >
            <FolderPlus size={15} /> <span className="libelle-btn">Nouveau dossier</span>
          </button>
          <button
            type="button"
            className="btn-icone masque-mobile"
            onClick={() => void recharger(true)}
            aria-label="Actualiser"
            title="Actualiser"
          >
            <RefreshCw size={17} className={chargement ? 'tourne' : undefined} />
          </button>
          <Link href="/corbeille" className="btn-icone masque-mobile" aria-label="Corbeille" title="Corbeille">
            <Trash2 size={17} />
          </Link>
          {donnees?.isServer ? (
            <Link href="/admin" className="btn-icone masque-mobile" aria-label="Reglages" title="Reglages">
              <Settings size={17} />
            </Link>
          ) : null}
          <button
            type="button"
            className="btn-icone masque-mobile"
            onClick={deconnexion}
            aria-label="Se deconnecter"
            title="Se deconnecter"
          >
            <LogOut size={17} />
          </button>

          <button
            type="button"
            className="btn-icone visible-mobile"
            aria-pressed={modeSelection}
            onClick={() => {
              setModeSelection((v) => !v)
              if (modeSelection) setSelection(new Set())
            }}
            aria-label="Mode selection"
          >
            <CheckSquare size={18} />
          </button>
          <button
            type="button"
            className="btn-icone visible-mobile"
            onClick={() => setDialogue({ type: 'plus' })}
            aria-label="Plus d'actions"
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
      </header>

      {donnees && !donnees.ok ? (
        <div className="alerte alerte-danger" style={{ margin: 12 }}>
          <AlertTriangle size={16} aria-hidden />
          <span>
            Le dossier racine <span className="mono">{donnees.racine}</span> est introuvable.{' '}
            {donnees.isServer ? (
              <Link href="/admin" style={{ textDecoration: 'underline' }}>
                Choisir un autre dossier dans les reglages.
              </Link>
            ) : (
              'Prevenez Ryan : le dossier partage a ete deplace.'
            )}
          </span>
        </div>
      ) : null}

      {erreur ? (
        <div className="alerte alerte-danger" style={{ margin: 12 }}>
          <AlertTriangle size={16} aria-hidden />
          <span>{erreur}</span>
          <button type="button" className="btn" style={{ marginLeft: 'auto' }} onClick={() => void recharger()}>
            Reessayer
          </button>
        </div>
      ) : null}

      {/* Le fichier de guidage est ecrit par un outil exterieur : s'il est
          casse, on le dit, sinon les marques disparaitraient sans explication. */}
      {donnees?.guideErreur ? (
        <div className="alerte alerte-info" style={{ margin: '0 12px 12px' }}>
          <AlertTriangle size={16} aria-hidden />
          <span>{donnees.guideErreur}</span>
        </div>
      ) : null}

      <div className={`corps ${detailOuvert ? 'avec-detail' : ''}`}>
        <section className="volet" data-actif={vueMobile === 'liste'} aria-label="Recherche">
          {chargement && !donnees ? (
            <div style={{ paddingTop: 10 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <div className="squelette" key={i} />
              ))}
            </div>
          ) : (
            <ListePlate
              elements={plat}
              notes={notes}
              marques={marques}
              recherche={recherche}
              onRecherche={setRecherche}
              filtre={filtre}
              onFiltre={setFiltre}
              cheminActif={cheminActif}
              onChoisir={localiser}
              selection={selection}
              onSelectionner={basculerSelection}
              modeSelection={modeSelection}
            />
          )}
        </section>

        <section className="volet" data-actif={vueMobile === 'arbre'} aria-label="Arborescence">
          <div className="volet-defile">
            {chargement && !donnees ? (
              <div style={{ paddingTop: 10 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <div className="squelette" key={i} />
                ))}
              </div>
            ) : (
              <Arbre
                noeuds={arbre}
                racine={donnees?.racine ?? ''}
                notes={notes}
                marques={marques}
                ouverts={ouverts}
                onBasculer={basculerDossier}
                cheminActif={cheminActif}
                onOuvrir={ouvrirElement}
                selection={selection}
                onSelectionner={basculerSelection}
                modeSelection={modeSelection}
                onMenu={(noeud) => noeud && setDialogue({ type: 'menu', noeud })}
                surligne={surligne}
                dossierActif={dossierActif}
                onDossierActif={setDossierActif}
                onDepot={(dossier, dt) => void surDepot(dossier, dt)}
              />
            )}
          </div>
        </section>

        {/* Sur telephone et tablette, le detail se superpose : un voile permet
            de le fermer d'une tape a cote, comme n'importe quelle feuille. */}
        {noeudActif ? (
          <div className="voile-detail" onClick={() => setCheminActif(null)} aria-hidden />
        ) : null}

        {noeudActif ? (
          <section className="volet volet-detail" aria-label="Detail">
            <PanneauDetail
              noeud={noeudActif}
              note={notes[noeudActif.path] ?? ''}
              isServer={Boolean(donnees?.isServer)}
              onFermer={() => setCheminActif(null)}
              onTelecharger={() => telecharger(noeudActif)}
              onOuvrir={() => setEditeur(noeudActif.path)}
              onOuvrirEmplacement={() => void ouvrirEmplacement(noeudActif.path)}
              onRenommer={() => setDialogue({ type: 'renommer', noeud: noeudActif })}
              onDeplacer={() => setDialogue({ type: 'deplacer', chemins: [noeudActif.path] })}
              onSupprimer={() => setDialogue({ type: 'supprimer', chemins: [noeudActif.path] })}
              onEnregistrerNote={(note) => enregistrerNote(noeudActif.path, note)}
            />
          </section>
        ) : null}
      </div>

      {/* Barre de navigation du telephone */}
      <nav className="nav-mobile" aria-label="Navigation">
        <button type="button" aria-pressed={vueMobile === 'arbre'} onClick={() => setVueMobile('arbre')}>
          <ListTree size={19} aria-hidden />
          Arbre
        </button>
        <button
          type="button"
          aria-pressed={vueMobile === 'liste'}
          onClick={() => {
            setVueMobile('liste')
            window.setTimeout(() => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(), 80)
          }}
        >
          <Search size={19} aria-hidden />
          Rechercher
        </button>
        <button type="button" onClick={() => champFichiers.current?.click()}>
          <Upload size={19} aria-hidden />
          Envoyer
        </button>
        <Link href="/corbeille">
          <Trash2 size={19} aria-hidden />
          Corbeille
        </Link>
      </nav>

      {/* Barre d'actions groupees */}
      {selection.size > 0 ? (
        <div className="barre-selection" role="toolbar" aria-label="Actions sur la selection">
          <span className="compte">{selection.size} selectionne(s)</span>
          <button
            type="button"
            className="btn"
            onClick={() => setDialogue({ type: 'deplacer', chemins: cheminsSelection })}
          >
            <FolderInput size={15} /> Deplacer
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setDialogue({ type: 'supprimer', chemins: cheminsSelection })}
          >
            <Trash2 size={15} /> Supprimer
          </button>
          <button
            type="button"
            className="btn-icone"
            style={{ color: '#fff' }}
            onClick={() => {
              setSelection(new Set())
              setModeSelection(false)
            }}
            aria-label="Annuler la selection"
          >
            <X size={17} />
          </button>
        </div>
      ) : null}

      {/* Transferts en cours */}
      {transferts.length > 0 ? (
        <div className="transferts" role="status" aria-live="polite">
          <div className="transferts-entete">
            <Upload size={15} aria-hidden />
            Transferts
            <button
              type="button"
              className="btn-icone"
              style={{ marginLeft: 'auto', width: 28, height: 28 }}
              onClick={() => setTransferts([])}
              aria-label="Masquer les transferts"
            >
              <X size={15} />
            </button>
          </div>
          <div className="transferts-liste">
            {transferts.map((transfert) => (
              <div className="transfert" key={transfert.id}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {transfert.nom}
                  </span>
                  <span className="ligne-meta">
                    {transfert.etat === 'erreur' ? 'echec' : `${transfert.pourcent}%`}
                  </span>
                  {transfert.annuler ? (
                    <button
                      type="button"
                      className="btn-icone"
                      style={{ width: 26, height: 26 }}
                      onClick={transfert.annuler}
                      aria-label="Annuler ce transfert"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
                <div
                  className={`jauge ${transfert.etat === 'fini' ? 'termine' : ''} ${
                    transfert.etat === 'erreur' ? 'echec' : ''
                  }`}
                >
                  <span style={{ width: `${transfert.etat === 'erreur' ? 100 : transfert.pourcent}%` }} />
                </div>
                {transfert.message ? (
                  <div style={{ color: 'var(--danger)', marginTop: 4 }}>{transfert.message}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <input
        ref={champFichiers}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          envoyer(fichiersChoisis(e.target.files), dossierActif)
          e.target.value = ''
        }}
      />

      {editeur ? <Editeur chemin={editeur} onFermer={() => setEditeur(null)} /> : null}

      {dialogue ? (
        <Dialogues
          /* Remonte le composant a chaque changement de dialogue :
             les champs repartent toujours de la bonne valeur. */
          key={JSON.stringify(dialogue)}
          dialogue={dialogue}
          arbre={arbre}
          parChemin={parChemin}
          notes={notes}
          dossierActif={dossierActif}
          occupe={occupe}
          isServer={Boolean(donnees?.isServer)}
          aFinir={aFinir}
          onMarquerVu={marquerVu}
          onFermer={() => setDialogue(null)}
          onCreerDossier={creerDossier}
          onRenommer={renommer}
          onDeplacer={deplacer}
          onSupprimer={supprimer}
          onTelecharger={telecharger}
          onOuvrirEmplacement={(chemin) => void ouvrirEmplacement(chemin)}
          onEditer={(chemin) => setEditeur(chemin)}
          onDetail={(noeud) => ouvrirElement(noeud)}
          onTeleverser={() => champFichiers.current?.click()}
          onActualiser={() => void recharger(true)}
          onDeconnexion={deconnexion}
          onDialogue={setDialogue}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Boites de dialogue                                                  */
/* ------------------------------------------------------------------ */

function Dialogues(props: {
  dialogue: Dialogue
  arbre: FsNode[]
  parChemin: Map<string, FsNode>
  notes: Record<string, string>
  dossierActif: string
  occupe: boolean
  isServer: boolean
  aFinir: MarqueGuide[]
  onMarquerVu: (marque: MarqueGuide) => Promise<void>
  onFermer: () => void
  onCreerDossier: (parent: string, nom: string) => Promise<boolean>
  onRenommer: (chemin: string, nom: string) => Promise<boolean>
  onDeplacer: (chemins: string[], destination: string) => Promise<boolean>
  onSupprimer: (chemins: string[]) => Promise<boolean>
  onTelecharger: (noeud: FsNode) => void
  onOuvrirEmplacement: (chemin: string) => void
  onEditer: (chemin: string) => void
  onDetail: (noeud: FsNode) => void
  onTeleverser: () => void
  onActualiser: () => void
  onDeconnexion: () => void
  onDialogue: (dialogue: Dialogue) => void
}) {
  const { dialogue } = props
  const [valeur, setValeur] = useState(
    dialogue.type === 'renommer' ? dialogue.noeud.name : dialogue.type === 'nouveauDossier' ? '' : '',
  )

  if (dialogue.type === 'nouveauDossier') {
    return (
      <Modale
        titre="Nouveau dossier"
        icone={<FolderPlus size={17} aria-hidden />}
        onFermer={props.onFermer}
        pied={
          <>
            <button type="button" className="btn" onClick={props.onFermer} data-secondaire>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-principal"
              disabled={props.occupe || !valeur.trim()}
              onClick={async () => {
                if (await props.onCreerDossier(dialogue.parent, valeur.trim())) props.onFermer()
              }}
            >
              {props.occupe ? <Loader2 size={15} className="tourne" /> : null} Creer
            </button>
          </>
        }
      >
        <p className="champ-aide">Dans : {libelleDossier(dialogue.parent)}</p>
        <input
          className="champ"
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          placeholder="Nom du dossier"
          enterKeyHint="done"
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && valeur.trim()) {
              if (await props.onCreerDossier(dialogue.parent, valeur.trim())) props.onFermer()
            }
          }}
          aria-label="Nom du dossier"
        />
      </Modale>
    )
  }

  if (dialogue.type === 'renommer') {
    return (
      <Modale
        titre="Renommer"
        icone={<Pencil size={17} aria-hidden />}
        onFermer={props.onFermer}
        pied={
          <>
            <button type="button" className="btn" onClick={props.onFermer} data-secondaire>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-principal"
              disabled={props.occupe || !valeur.trim()}
              onClick={async () => {
                if (await props.onRenommer(dialogue.noeud.path, valeur.trim())) props.onFermer()
              }}
            >
              {props.occupe ? <Loader2 size={15} className="tourne" /> : null} Renommer
            </button>
          </>
        }
      >
        <p className="champ-aide mono">{dialogue.noeud.path}</p>
        <input
          className="champ"
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          enterKeyHint="done"
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && valeur.trim()) {
              if (await props.onRenommer(dialogue.noeud.path, valeur.trim())) props.onFermer()
            }
          }}
          aria-label="Nouveau nom"
        />
      </Modale>
    )
  }

  if (dialogue.type === 'supprimer') {
    const noms = dialogue.chemins.map((c) => baseName(c))
    return (
      <Modale
        titre={dialogue.chemins.length > 1 ? `Supprimer ${dialogue.chemins.length} elements` : 'Supprimer'}
        icone={<Trash2 size={17} aria-hidden />}
        onFermer={props.onFermer}
        pied={
          <>
            <button type="button" className="btn" onClick={props.onFermer} data-secondaire>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={props.occupe}
              onClick={async () => {
                if (await props.onSupprimer(dialogue.chemins)) props.onFermer()
              }}
            >
              {props.occupe ? <Loader2 size={15} className="tourne" /> : <Trash2 size={15} />} Mettre a la corbeille
            </button>
          </>
        }
      >
        <div className="alerte alerte-info">
          <StickyNote size={16} aria-hidden />
          <span>Rien n&apos;est efface : tout part dans la corbeille et reste restaurable.</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, maxHeight: '30dvh', overflow: 'auto' }}>
          {noms.slice(0, 30).map((nom, i) => (
            <li key={i} style={{ wordBreak: 'break-all' }}>
              {nom}
            </li>
          ))}
          {noms.length > 30 ? <li>... et {noms.length - 30} autres</li> : null}
        </ul>
      </Modale>
    )
  }

  if (dialogue.type === 'deplacer') {
    return (
      <SelecteurDossier
        noeuds={props.arbre}
        exclus={dialogue.chemins}
        titre={`Deplacer ${dialogue.chemins.length} element(s)`}
        intitule="Deplacer ici"
        onFermer={props.onFermer}
        onChoisir={async (destination) => {
          if (await props.onDeplacer(dialogue.chemins, destination)) props.onFermer()
        }}
      />
    )
  }

  if (dialogue.type === 'menu') {
    const noeud = dialogue.noeud
    const estFichier = noeud.type === 'file'
    const editable = estFichier && maybeText(noeud.name, extOf(noeud.name))
    return (
      <Modale titre={noeud.name} icone={<MoreHorizontal size={17} aria-hidden />} onFermer={props.onFermer}>
        <p className="champ-aide mono">{noeud.path}</p>
        <div className="actions-grille">
          <button
            type="button"
            className="btn"
            onClick={() => {
              props.onDetail(noeud)
              props.onFermer()
            }}
          >
            <StickyNote size={15} /> Detail et note
          </button>
          {estFichier ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                props.onTelecharger(noeud)
                props.onFermer()
              }}
            >
              <Download size={15} /> Telecharger
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                props.onEditer(noeud.path)
                props.onFermer()
              }}
            >
              <FilePen size={15} /> Ouvrir
            </button>
          ) : null}
          {props.isServer ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                props.onOuvrirEmplacement(noeud.path)
                props.onFermer()
              }}
            >
              <FolderOpen size={15} /> Ouvrir l&apos;emplacement
            </button>
          ) : null}
          {!estFichier ? (
            <button
              type="button"
              className="btn"
              onClick={() => props.onDialogue({ type: 'nouveauDossier', parent: noeud.path })}
            >
              <FolderPlus size={15} /> Nouveau dossier
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => props.onDialogue({ type: 'renommer', noeud })}>
            <Pencil size={15} /> Renommer
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => props.onDialogue({ type: 'deplacer', chemins: [noeud.path] })}
          >
            <FolderInput size={15} /> Deplacer
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => props.onDialogue({ type: 'supprimer', chemins: [noeud.path] })}
          >
            <Trash2 size={15} /> Supprimer
          </button>
        </div>
        {estFichier ? (
          <p className="champ-aide">
            {formatSize(noeud.size)} - modifie le {new Date(noeud.mtime).toLocaleDateString('fr-FR')}
          </p>
        ) : null}
      </Modale>
    )
  }

  if (dialogue.type === 'guide') {
    return (
      <Modale
        titre="A finir"
        icone={<Sparkles size={17} aria-hidden />}
        onFermer={props.onFermer}
      >
        {props.aFinir.length === 0 ? (
          <p className="champ-aide">Rien en attente.</p>
        ) : (
          <div className="guide-liste">
            {props.aFinir.map((marque) => {
              const noeud = props.parChemin.get(marque.chemin)
              return (
                <div className={`guide-entree guide-${marque.ton}`} key={marque.chemin}>
                  <div className="guide-corps">
                    <div className="guide-nom">
                      {noeud ? noeud.name : baseName(marque.chemin) || marque.chemin}
                      {!noeud ? <span className="guide-absent">introuvable</span> : null}
                    </div>
                    <div className="ligne-sous">{marque.chemin}</div>
                    {marque.bulle ? <div className="guide-texte">{marque.bulle}</div> : null}
                  </div>
                  <div className="guide-actions">
                    {noeud ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          props.onDetail(noeud)
                          props.onFermer()
                        }}
                      >
                        Aller voir
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-principal"
                      onClick={() => void props.onMarquerVu(marque)}
                    >
                      <Check size={15} /> Fait
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="champ-aide" style={{ marginTop: 10 }}>
          Ces marques viennent du fichier .hub-guide.json depose a la racine du Hub.
          Une marque reecrite par Claude Code se rallume toute seule.
        </p>
      </Modale>
    )
  }

  // dialogue.type === 'plus' : menu du telephone
  return (
    <Modale titre="Actions" icone={<MoreHorizontal size={17} aria-hidden />} onFermer={props.onFermer}>
      <div className="actions-grille">
        <button
          type="button"
          className="btn"
          onClick={() => {
            props.onTeleverser()
            props.onFermer()
          }}
        >
          <Upload size={15} /> Televerser
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => props.onDialogue({ type: 'nouveauDossier', parent: props.dossierActif })}
        >
          <FolderPlus size={15} /> Nouveau dossier
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            props.onActualiser()
            props.onFermer()
          }}
        >
          <RefreshCw size={15} /> Actualiser
        </button>
        <Link className="btn" href="/corbeille">
          <Trash2 size={15} /> Corbeille
        </Link>
        {props.isServer ? (
          <Link className="btn" href="/admin">
            <Settings size={15} /> Reglages
          </Link>
        ) : null}
        <button type="button" className="btn" onClick={props.onDeconnexion}>
          <LogOut size={15} /> Se deconnecter
        </button>
      </div>
      <p className="champ-aide">Dossier actif : {libelleDossier(props.dossierActif)}</p>
    </Modale>
  )
}
