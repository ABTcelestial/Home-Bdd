'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Trash2,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Folder,
  File as FileIcon,
  ShieldAlert,
} from 'lucide-react'
import { apiGet, apiPost, messageErreur } from '@/lib/client'
import { formatDate, formatSize } from '@/lib/filetypes'
import { Modale } from './Modale'
import { useToasts } from './Toasts'
import type { TrashItem } from '@/lib/types'

/**
 * Corbeille (PRD 5.4). Restauration ouverte a tous ; le bouton "Vider" n'existe
 * que sur le PC serveur, et l'API le refuse de toute facon ailleurs.
 */
export function PageCorbeille() {
  const toasts = useToasts()
  const [elements, setElements] = useState<TrashItem[]>([])
  const [isServer, setIsServer] = useState(false)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState(false)

  const charger = useCallback(async () => {
    try {
      const rep = await apiGet<{ elements: TrashItem[]; isServer: boolean }>('/api/corbeille')
      setElements(rep.elements)
      setIsServer(rep.isServer)
      setErreur(null)
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void charger()
    const minuteur = window.setInterval(() => void charger(), 15_000)
    return () => window.clearInterval(minuteur)
  }, [charger])

  const restaurer = async (item: TrashItem) => {
    setOccupe(item.id)
    try {
      await apiPost('/api/corbeille/restaurer', { id: item.id })
      toasts.succes(`"${item.nom}" restaure dans ${item.origine.includes('/') ? item.origine.slice(0, item.origine.lastIndexOf('/')) : 'la racine'}.`)
      await charger()
    } catch (err) {
      toasts.erreur(messageErreur(err))
    } finally {
      setOccupe(null)
    }
  }

  const vider = async () => {
    setOccupe('vider')
    try {
      const rep = await apiPost<{ supprimes: number; erreurs: string[] }>('/api/corbeille/vider')
      if (rep.erreurs?.length) toasts.erreur(rep.erreurs.join(' '))
      toasts.succes(`Corbeille videe (${rep.supprimes} element(s)).`)
      setConfirmation(false)
      await charger()
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
          <Trash2 size={19} strokeWidth={1.7} aria-hidden />
          <span>Corbeille</span>
        </div>
        <div className="entete-actions">
          {isServer && elements.length > 0 ? (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmation(true)}>
              <Trash2 size={15} /> Vider
            </button>
          ) : null}
        </div>
      </header>

      <div className="page">
        <div className="page-contenu">
          {erreur ? (
            <div className="alerte alerte-danger">
              <AlertTriangle size={16} aria-hidden />
              <span>{erreur}</span>
            </div>
          ) : null}

          {!isServer ? (
            <div className="alerte alerte-info">
              <ShieldAlert size={16} aria-hidden />
              <span>
                Vous pouvez tout restaurer. Le vidage definitif se fait uniquement depuis le PC serveur.
              </span>
            </div>
          ) : null}

          <div className="carte">
            <div className="carte-entete">
              <Trash2 size={16} aria-hidden />
              {elements.length} element(s) supprime(s)
            </div>

            {chargement ? (
              <div className="vide">
                <Loader2 size={20} className="tourne" aria-hidden /> Chargement...
              </div>
            ) : elements.length === 0 ? (
              <div className="vide">
                <Trash2 size={24} strokeWidth={1.4} aria-hidden />
                <div>La corbeille est vide.</div>
              </div>
            ) : (
              elements.map((item) => (
                <div className="element-corbeille" key={item.id}>
                  {item.type === 'dir' ? (
                    <Folder size={18} color="#ca8a04" fill="#fde68a" strokeWidth={1.7} aria-hidden />
                  ) : (
                    <FileIcon size={18} color="#6b7280" strokeWidth={1.7} aria-hidden />
                  )}
                  <div className="infos">
                    <div style={{ fontWeight: 550, wordBreak: 'break-word' }}>{item.nom}</div>
                    <div className="ligne-sous" style={{ whiteSpace: 'normal' }}>
                      Etait dans : {item.origine.includes('/') ? item.origine.slice(0, item.origine.lastIndexOf('/')) : 'racine'}
                    </div>
                    <div className="ligne-sous" style={{ whiteSpace: 'normal' }}>
                      Supprime le {formatDate(item.supprimeLe)}
                      {item.type === 'file' ? ` - ${formatSize(item.taille)}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => restaurer(item)}
                    disabled={occupe === item.id}
                  >
                    {occupe === item.id ? (
                      <Loader2 size={15} className="tourne" />
                    ) : (
                      <RotateCcw size={15} />
                    )}
                    Restaurer
                  </button>
                </div>
              ))
            )}
          </div>

          <p className="champ-aide">
            Les elements supprimes sont deplaces dans le dossier cache{' '}
            <span className="mono">.corbeille</span> a la racine du Hub. Rien n&apos;est efface tant que la
            corbeille n&apos;est pas videe depuis le PC serveur.
          </p>
        </div>
      </div>

      <nav className="nav-mobile" aria-label="Navigation">
        <Link href="/">
          <ArrowLeft size={19} aria-hidden />
          Retour au Hub
        </Link>
      </nav>

      {confirmation ? (
        <Modale
          titre="Vider la corbeille"
          icone={<AlertTriangle size={17} aria-hidden />}
          onFermer={() => setConfirmation(false)}
          pied={
            <>
              <button type="button" className="btn" onClick={() => setConfirmation(false)} data-secondaire>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" onClick={vider} disabled={occupe === 'vider'}>
                {occupe === 'vider' ? <Loader2 size={15} className="tourne" /> : <Trash2 size={15} />}
                Supprimer definitivement
              </button>
            </>
          }
        >
          <div className="alerte alerte-danger">
            <AlertTriangle size={16} aria-hidden />
            <span>
              {elements.length} element(s) seront effaces du disque. Cette action est irreversible.
            </span>
          </div>
        </Modale>
      ) : null}
    </div>
  )
}
