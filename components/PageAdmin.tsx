'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Settings,
  FolderSearch,
  Loader2,
  Check,
  KeyRound,
  RefreshCw,
  Trash2,
  Network,
  AlertTriangle,
  Folder,
  ChevronUp,
  HardDrive,
  Database,
} from 'lucide-react'
import { apiGet, apiPost, messageErreur } from '@/lib/client'
import { formatSize } from '@/lib/filetypes'
import { Modale } from './Modale'
import { useToasts } from './Toasts'

type Reglages = {
  racine: string
  racineParDefaut: string
  racineValide: boolean
  erreurRacine?: string
  motDePassePersonnalise: boolean
  port: number
  adresses: string[]
  hote: string
  plateforme: string
  totals: { dossiers: number; fichiers: number; taille: number }
}

type Parcours = {
  chemin: string
  parent: string | null
  dossiers: { nom: string; chemin: string }[]
  raccourcis?: { nom: string; chemin: string }[]
}

export function PageAdmin() {
  const toasts = useToasts()
  const [reglages, setReglages] = useState<Reglages | null>(null)
  const [racine, setRacine] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [occupe, setOccupe] = useState<string | null>(null)
  const [explorateur, setExplorateur] = useState(false)

  const charger = useCallback(async () => {
    try {
      const rep = await apiGet<{ ok: true } & Reglages>('/api/admin/reglages')
      setReglages(rep)
      setRacine(rep.racine)
    } catch (err) {
      toasts.erreur(messageErreur(err))
    }
  }, [toasts])

  useEffect(() => {
    void charger()
  }, [charger])

  const appliquerRacine = async (chemin: string) => {
    setOccupe('racine')
    try {
      await apiPost('/api/admin/reglages', { action: 'racine', chemin })
      toasts.succes('Dossier racine mis a jour.')
      setExplorateur(false)
      await charger()
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setOccupe(null)
    }
  }

  const changerMotDePasse = async () => {
    setOccupe('mdp')
    try {
      await apiPost('/api/admin/reglages', { action: 'motdepasse', motDePasse })
      setMotDePasse('')
      toasts.succes('Mot de passe change. Les sessions ouvertes restent valides.')
      await charger()
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setOccupe(null)
    }
  }

  const rescanner = async () => {
    setOccupe('rescan')
    try {
      const rep = await apiPost<{ totals: Reglages['totals'] }>('/api/admin/reglages', { action: 'rescan' })
      toasts.succes(`Scan termine : ${rep.totals.fichiers} fichier(s), ${rep.totals.dossiers} dossier(s).`)
      await charger()
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setOccupe(null)
    }
  }

  const viderCorbeille = async () => {
    if (!window.confirm('Vider definitivement la corbeille ?')) return
    setOccupe('corbeille')
    try {
      const rep = await apiPost<{ supprimes: number }>('/api/corbeille/vider')
      toasts.succes(`Corbeille videe (${rep.supprimes} element(s)).`)
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setOccupe(null)
    }
  }

  return (
    <div className="app">
      <header className="entete">
        <Link href="/" className="btn-icone" aria-label="Retour au Hub">
          <ArrowLeft size={19} />
        </Link>
        <div className="entete-titre">
          <Settings size={19} strokeWidth={1.7} aria-hidden />
          <span>Reglages du serveur</span>
        </div>
      </header>

      <div className="page">
        <div className="page-contenu">
          <div className="alerte alerte-info">
            <Settings size={16} aria-hidden />
            <span>Cette page n&apos;est visible que depuis le PC serveur.</span>
          </div>

          {/* Dossier racine */}
          <section className="carte">
            <div className="carte-entete">
              <Database size={16} aria-hidden /> Dossier racine
            </div>
            <div className="carte-corps">
              <p className="champ-aide">
                Tout ce que contient ce dossier apparait dans le Hub. Pointez-le par exemple sur votre dossier
                de travail pour que les fichiers generes y apparaissent automatiquement.
              </p>
              <div className="ligne-champ">
                <input
                  className="champ mono"
                  value={racine}
                  onChange={(e) => setRacine(e.target.value)}
                  placeholder="D:\Projets\Celestial"
                  spellCheck={false}
                  aria-label="Chemin du dossier racine"
                />
                <button type="button" className="btn" onClick={() => setExplorateur(true)}>
                  <FolderSearch size={15} /> Parcourir
                </button>
                <button
                  type="button"
                  className="btn btn-principal"
                  onClick={() => appliquerRacine(racine.trim())}
                  disabled={occupe === 'racine' || !racine.trim() || racine.trim() === reglages?.racine}
                >
                  {occupe === 'racine' ? <Loader2 size={15} className="tourne" /> : <Check size={15} />}
                  Appliquer
                </button>
              </div>

              {reglages && !reglages.racineValide ? (
                <div className="alerte alerte-danger">
                  <AlertTriangle size={16} aria-hidden />
                  <span>{reglages.erreurRacine}</span>
                </div>
              ) : null}

              {reglages ? (
                <p className="champ-aide">
                  Contenu actuel : {reglages.totals.fichiers} fichier(s), {reglages.totals.dossiers} dossier(s),{' '}
                  {formatSize(reglages.totals.taille)}. Par defaut :{' '}
                  <span className="mono">{reglages.racineParDefaut}</span>
                </p>
              ) : null}
            </div>
          </section>

          {/* Mot de passe */}
          <section className="carte">
            <div className="carte-entete">
              <KeyRound size={16} aria-hidden /> Mot de passe partage
            </div>
            <div className="carte-corps">
              <p className="champ-aide">
                {reglages?.motDePassePersonnalise
                  ? 'Un mot de passe personnalise est actif (il remplace la variable HUB_PASSWORD).'
                  : 'Le mot de passe vient de la variable HUB_PASSWORD. Le changer ici le remplace definitivement.'}
              </p>
              <div className="ligne-champ">
                <input
                  className="champ"
                  type="password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  placeholder="Nouveau mot de passe"
                  autoComplete="new-password"
                  aria-label="Nouveau mot de passe"
                />
                <button
                  type="button"
                  className="btn btn-principal"
                  onClick={changerMotDePasse}
                  disabled={occupe === 'mdp' || motDePasse.trim().length < 4}
                >
                  {occupe === 'mdp' ? <Loader2 size={15} className="tourne" /> : <KeyRound size={15} />}
                  Changer
                </button>
              </div>
            </div>
          </section>

          {/* Maintenance */}
          <section className="carte">
            <div className="carte-entete">
              <RefreshCw size={16} aria-hidden /> Maintenance
            </div>
            <div className="carte-corps">
              <div className="ligne-champ">
                <button type="button" className="btn" onClick={rescanner} disabled={occupe === 'rescan'}>
                  {occupe === 'rescan' ? <Loader2 size={15} className="tourne" /> : <RefreshCw size={15} />}
                  Re-scanner le disque
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={viderCorbeille}
                  disabled={occupe === 'corbeille'}
                >
                  {occupe === 'corbeille' ? <Loader2 size={15} className="tourne" /> : <Trash2 size={15} />}
                  Vider la corbeille
                </button>
                <Link className="btn" href="/corbeille">
                  <Trash2 size={15} /> Ouvrir la corbeille
                </Link>
              </div>
            </div>
          </section>

          {/* Acces reseau */}
          <section className="carte">
            <div className="carte-entete">
              <Network size={16} aria-hidden /> Acces depuis les autres PC
            </div>
            <div className="carte-corps">
              <p className="champ-aide">
                Adresse a mettre en raccourci sur le bureau du PC client (reseau local uniquement) :
              </p>
              {reglages?.adresses.length ? (
                reglages.adresses.map((ip) => (
                  <div key={ip} className="ligne-champ">
                    <input
                      className="champ mono"
                      readOnly
                      value={`http://${ip}:${reglages.port}`}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`Adresse ${ip}`}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        void navigator.clipboard?.writeText(`http://${ip}:${reglages.port}`)
                        toasts.succes('Adresse copiee.')
                      }}
                    >
                      Copier
                    </button>
                  </div>
                ))
              ) : (
                <p className="champ-aide">Aucune adresse reseau detectee.</p>
              )}
              <p className="champ-aide">
                Machine : <span className="mono">{reglages?.hote}</span> - port{' '}
                <span className="mono">{reglages?.port}</span>. Pensez a la reservation DHCP dans la box pour
                que l&apos;adresse ne change jamais.
              </p>
            </div>
          </section>
        </div>
      </div>

      <nav className="nav-mobile" aria-label="Navigation">
        <Link href="/">
          <ArrowLeft size={19} aria-hidden />
          Retour au Hub
        </Link>
      </nav>

      {explorateur ? (
        <Explorateur
          depart={reglages?.racine ?? ''}
          onFermer={() => setExplorateur(false)}
          onChoisir={(chemin) => {
            setRacine(chemin)
            void appliquerRacine(chemin)
          }}
        />
      ) : null}
    </div>
  )
}

/** Explorateur de dossiers du PC serveur (PRD 5.9 : "saisir ou parcourir"). */
function Explorateur({
  depart,
  onFermer,
  onChoisir,
}: {
  depart: string
  onFermer: () => void
  onChoisir: (chemin: string) => void
}) {
  const toasts = useToasts()
  const [parcours, setParcours] = useState<Parcours | null>(null)
  const [chargement, setChargement] = useState(true)

  const aller = useCallback(
    async (chemin: string) => {
      setChargement(true)
      try {
        const rep = await apiGet<{ ok: true } & Parcours>(
          `/api/admin/parcourir?chemin=${encodeURIComponent(chemin)}`,
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
    void aller(depart)
  }, [aller, depart])

  return (
    <Modale
      titre="Choisir un dossier"
      icone={<FolderSearch size={17} aria-hidden />}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer} data-secondaire>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-principal"
            disabled={!parcours?.chemin}
            onClick={() => parcours?.chemin && onChoisir(parcours.chemin)}
          >
            <Check size={15} /> Utiliser ce dossier
          </button>
        </>
      }
    >
      <div className="mono" style={{ wordBreak: 'break-all' }}>
        {parcours?.chemin || 'Postes et lecteurs'}
      </div>

      <div style={{ maxHeight: '46dvh', overflow: 'auto', border: '1px solid var(--bordure)', borderRadius: 8 }}>
        {chargement ? (
          <div className="vide">
            <Loader2 size={18} className="tourne" aria-hidden /> Lecture...
          </div>
        ) : (
          <>
            {parcours?.parent !== null && parcours?.parent !== undefined ? (
              <button type="button" className="ligne" onClick={() => aller(parcours.parent as string)}>
                <ChevronUp size={16} aria-hidden />
                <span className="ligne-nom">Dossier parent</span>
              </button>
            ) : null}
            {parcours?.chemin ? (
              <button type="button" className="ligne" onClick={() => aller('')}>
                <HardDrive size={16} aria-hidden />
                <span className="ligne-nom">Lecteurs</span>
              </button>
            ) : null}
            {parcours?.raccourcis?.map((raccourci) => (
              <button type="button" className="ligne" key={raccourci.chemin} onClick={() => aller(raccourci.chemin)}>
                <Folder size={16} color="#ca8a04" fill="#fde68a" strokeWidth={1.7} aria-hidden />
                <span className="ligne-nom">{raccourci.nom}</span>
              </button>
            ))}
            {parcours?.dossiers.map((dossier) => (
              <button type="button" className="ligne" key={dossier.chemin} onClick={() => aller(dossier.chemin)}>
                <Folder size={16} color="#ca8a04" fill="#fde68a" strokeWidth={1.7} aria-hidden />
                <span className="ligne-nom">{dossier.nom}</span>
              </button>
            ))}
            {parcours && parcours.dossiers.length === 0 ? (
              <div className="vide" style={{ padding: 20 }}>
                Aucun sous-dossier.
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modale>
  )
}
