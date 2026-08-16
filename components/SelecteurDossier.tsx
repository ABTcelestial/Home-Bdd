'use client'

import { useState } from 'react'
import { ChevronRight, Database, Folder } from 'lucide-react'
import { Modale } from './Modale'
import { isInside } from '@/lib/chemins'
import type { FsNode } from '@/lib/types'

/**
 * Choix d'un dossier de destination dans l'arbre (deplacement, PRD 5.3).
 * Les dossiers deplaces et leurs enfants sont grises : on ne peut pas
 * deplacer un dossier dans lui-meme.
 */
export function SelecteurDossier({
  noeuds,
  exclus,
  titre,
  intitule,
  onChoisir,
  onFermer,
}: {
  noeuds: FsNode[]
  exclus: string[]
  titre: string
  intitule: string
  onChoisir: (destination: string) => void
  onFermer: () => void
}) {
  const [choisi, setChoisi] = useState<string>('')
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())

  const basculer = (chemin: string) => {
    setOuverts((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(chemin)) suivant.delete(chemin)
      else suivant.add(chemin)
      return suivant
    })
  }

  const interdit = (chemin: string) => exclus.some((exclu) => isInside(exclu, chemin))

  const rendre = (liste: FsNode[]) => (
    <div className="branche">
      {liste
        .filter((noeud) => noeud.type === 'dir')
        .map((noeud) => {
          const ouvert = ouverts.has(noeud.path)
          const bloque = interdit(noeud.path)
          const enfants = (noeud.children || []).filter((e) => e.type === 'dir')
          return (
            <div className="noeud" key={noeud.path}>
              <div className="ligne" aria-selected={choisi === noeud.path}>
                {enfants.length ? (
                  <button
                    type="button"
                    className={`chevron ${ouvert ? 'ouvert' : ''}`}
                    onClick={() => basculer(noeud.path)}
                    aria-label={ouvert ? 'Replier' : 'Deplier'}
                  >
                    <ChevronRight size={15} />
                  </button>
                ) : (
                  <span className="chevron-vide" aria-hidden />
                )}
                <button
                  type="button"
                  className="ligne"
                  style={{ padding: 0, minHeight: 0, flex: 1, opacity: bloque ? 0.4 : 1 }}
                  disabled={bloque}
                  onClick={() => setChoisi(noeud.path)}
                >
                  <Folder size={16} color="#ca8a04" fill="#fde68a" strokeWidth={1.7} aria-hidden />
                  <span className="ligne-nom">{noeud.name}</span>
                </button>
              </div>
              {ouvert && enfants.length ? rendre(enfants) : null}
            </div>
          )
        })}
    </div>
  )

  return (
    <Modale
      titre={titre}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="btn" onClick={onFermer} data-secondaire>
            Annuler
          </button>
          <button type="button" className="btn btn-principal" onClick={() => onChoisir(choisi)}>
            {intitule}
          </button>
        </>
      }
    >
      <p className="champ-aide">Destination : {choisi === '' ? 'racine du Hub' : choisi}</p>
      <div style={{ maxHeight: '48dvh', overflow: 'auto', border: '1px solid var(--bordure)', borderRadius: 8, padding: 6 }}>
        <div className="ligne" aria-selected={choisi === ''}>
          <button
            type="button"
            className="ligne"
            style={{ padding: 0, minHeight: 0, flex: 1 }}
            onClick={() => setChoisi('')}
          >
            <Database size={16} aria-hidden />
            <span className="ligne-nom">Celestial Hub (racine)</span>
          </button>
        </div>
        {rendre(noeuds)}
      </div>
    </Modale>
  )
}
