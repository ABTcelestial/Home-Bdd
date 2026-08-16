'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Loader2, Pencil, Save, X, AlertTriangle, Download } from 'lucide-react'
import { apiGet, apiPost, messageErreur, urlTelechargement, ApiError } from '@/lib/client'
import { renderMarkdown, toggleCase } from '@/lib/markdown'
import { useToasts } from './Toasts'

type Reponse = {
  chemin: string
  nom: string
  contenu: string
  taille: number
  mtime: number
  markdown: boolean
  lectureSeule: boolean
  tronque: boolean
}

/**
 * Editeur de texte integre (PRD 5.8) : plein ecran sur tous les appareils,
 * apercu Markdown avec cases a cocher cliquables, Ctrl+S, avertissement si
 * l'on quitte sans enregistrer.
 */
export function Editeur({ chemin, onFermer }: { chemin: string; onFermer: () => void }) {
  const toasts = useToasts()
  const [fichier, setFichier] = useState<Reponse | null>(null)
  const [contenu, setContenu] = useState('')
  const [reference, setReference] = useState('')
  const [mtime, setMtime] = useState(0)
  const [mode, setMode] = useState<'edition' | 'apercu'>('edition')
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistrement, setEnregistrement] = useState(false)
  const zone = useRef<HTMLTextAreaElement>(null)
  const gouttiere = useRef<HTMLDivElement>(null)

  const modifie = contenu !== reference
  const lectureSeule = fichier?.lectureSeule ?? false

  useEffect(() => {
    let vivant = true
    setChargement(true)
    apiGet<{ ok: true } & Reponse>(`/api/fichier?chemin=${encodeURIComponent(chemin)}`)
      .then((rep) => {
        if (!vivant) return
        setFichier(rep)
        setContenu(rep.contenu)
        setReference(rep.contenu)
        setMtime(rep.mtime)
        setMode(rep.markdown ? 'apercu' : 'edition')
        setErreur(null)
      })
      .catch((err) => {
        if (vivant) setErreur(messageErreur(err))
      })
      .finally(() => {
        if (vivant) setChargement(false)
      })
    return () => {
      vivant = false
    }
  }, [chemin])

  const enregistrer = useCallback(
    async (texte: string, forcer = false): Promise<boolean> => {
      if (lectureSeule) {
        toasts.erreur('Fichier trop volumineux : ouvert en lecture seule.')
        return false
      }
      setEnregistrement(true)
      try {
        const rep = await apiPost<{ mtime: number }>('/api/fichier', {
          chemin,
          contenu: texte,
          mtimeConnu: mtime,
          forcer,
        })
        setReference(texte)
        setMtime(rep.mtime)
        toasts.succes('Enregistre.')
        return true
      } catch (err) {
        if (err instanceof ApiError && err.statut === 409) {
          const ecraser = window.confirm(
            "Ce fichier a ete modifie ailleurs depuis son ouverture.\n\nEnregistrer quand meme ecrasera l'autre version.",
          )
          if (ecraser) return enregistrer(texte, true)
          return false
        }
        toasts.erreur(messageErreur(err))
        return false
      } finally {
        setEnregistrement(false)
      }
    },
    [chemin, lectureSeule, mtime, toasts],
  )

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (modifie) void enregistrer(contenu)
      }
      if (e.key === 'Escape') fermer()
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  })

  // Avertissement de fermeture d'onglet avec des modifications en cours.
  useEffect(() => {
    const surSortie = (e: BeforeUnloadEvent) => {
      if (!modifie) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', surSortie)
    return () => window.removeEventListener('beforeunload', surSortie)
  }, [modifie])

  const fermer = () => {
    if (modifie && !window.confirm('Des modifications ne sont pas enregistrees. Fermer quand meme ?')) {
      return
    }
    onFermer()
  }

  /** Cocher une case depuis l'apercu ecrit immediatement sur le disque. */
  const surClicApercu = async (e: React.MouseEvent<HTMLDivElement>) => {
    const cible = e.target as HTMLElement
    if (cible.tagName !== 'INPUT' || (cible as HTMLInputElement).type !== 'checkbox') return
    e.preventDefault()
    const index = Number(cible.dataset.ligne)
    if (!Number.isFinite(index)) return
    const nouveau = toggleCase(contenu, index)
    if (nouveau === null) return
    setContenu(nouveau)
    const enregistre = await enregistrer(nouveau)
    if (!enregistre) setContenu(contenu) // retour arriere si l'ecriture a echoue
  }

  const html = useMemo(
    () => (fichier?.markdown && mode === 'apercu' ? renderMarkdown(contenu) : ''),
    [contenu, fichier?.markdown, mode],
  )

  const lignes = useMemo(() => contenu.split('\n').length, [contenu])

  return (
    <div className="editeur" role="dialog" aria-modal="true" aria-label={`Editeur : ${fichier?.nom ?? chemin}`}>
      <div className="editeur-entete">
        <button type="button" className="btn-icone" onClick={fermer} aria-label="Fermer l'editeur">
          <X size={19} />
        </button>

        <div className="editeur-titre" style={{ flex: 1 }}>
          <span className="nom">
            {fichier?.nom ?? chemin} {modifie ? <span className="point-modifie" aria-label="Non enregistre" /> : null}
          </span>
          <span className="chemin">{chemin}</span>
        </div>

        {fichier?.markdown ? (
          <div className="segments segments-editeur">
            <button type="button" aria-pressed={mode === 'apercu'} onClick={() => setMode('apercu')}>
              <Eye size={14} aria-hidden /> Apercu
            </button>
            <button type="button" aria-pressed={mode === 'edition'} onClick={() => setMode('edition')}>
              <Pencil size={14} aria-hidden /> Edition
            </button>
          </div>
        ) : null}

        <a className="btn btn-icone" href={urlTelechargement(chemin)} aria-label="Telecharger ce fichier">
          <Download size={17} />
        </a>

        <button
          type="button"
          className="btn btn-principal"
          onClick={() => enregistrer(contenu)}
          disabled={!modifie || enregistrement || lectureSeule}
        >
          {enregistrement ? <Loader2 size={15} className="tourne" /> : <Save size={15} />}
          Enregistrer
        </button>
      </div>

      {lectureSeule ? (
        <div className="alerte alerte-info" style={{ margin: 10 }}>
          <AlertTriangle size={16} aria-hidden />
          <span>
            Fichier de plus de 5 Mo : affichage partiel en lecture seule. Telechargez-le pour le modifier.
          </span>
        </div>
      ) : null}

      <div className="editeur-corps">
        {chargement ? (
          <div className="vide" style={{ margin: 'auto' }}>
            <Loader2 size={22} className="tourne" aria-hidden /> Ouverture...
          </div>
        ) : erreur ? (
          <div className="vide" style={{ margin: 'auto' }}>
            <AlertTriangle size={22} aria-hidden />
            <div>{erreur}</div>
            <button type="button" className="btn" onClick={onFermer}>
              Fermer
            </button>
          </div>
        ) : fichier?.markdown && mode === 'apercu' ? (
          <div className="apercu" onClick={surClicApercu}>
            <div className="apercu-contenu" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : (
          <div className="editeur-zone">
            <div className="gouttiere" ref={gouttiere} aria-hidden>
              {Array.from({ length: lignes }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={zone}
              className="editeur-texte"
              value={contenu}
              readOnly={lectureSeule}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setContenu(e.target.value)}
              onScroll={(e) => {
                if (gouttiere.current) gouttiere.current.scrollTop = e.currentTarget.scrollTop
              }}
              aria-label="Contenu du fichier"
            />
          </div>
        )}
      </div>
    </div>
  )
}
