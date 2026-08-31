'use client'

import { useMemo } from 'react'
import { Search, X, Files, Folder, FileText, Check, StickyNote } from 'lucide-react'
import { IconeElement } from './Icones'
import { Bulle } from './Bulle'
import { formatSize } from '@/lib/filetypes'
import type { FsNode, MarqueGuide } from '@/lib/types'

export type Filtre = 'tout' | 'dossiers' | 'fichiers'

const MAX_AFFICHE = 400

/**
 * Colonne de gauche (PRD 5.2) : recherche instantanee par nom, filtre a trois
 * etats, liste a plat avec le chemin complet en petit.
 */
export function ListePlate({
  elements,
  notes,
  marques,
  recherche,
  onRecherche,
  filtre,
  onFiltre,
  cheminActif,
  onChoisir,
  selection,
  onSelectionner,
  modeSelection,
}: {
  elements: FsNode[]
  notes: Record<string, string>
  /** Marques de guidage encore a voir, par chemin. */
  marques: Map<string, MarqueGuide>
  recherche: string
  onRecherche: (valeur: string) => void
  filtre: Filtre
  onFiltre: (valeur: Filtre) => void
  cheminActif: string | null
  onChoisir: (noeud: FsNode) => void
  selection: Set<string>
  onSelectionner: (chemin: string) => void
  modeSelection: boolean
}) {
  const resultats = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    return elements.filter((noeud) => {
      if (filtre === 'dossiers' && noeud.type !== 'dir') return false
      if (filtre === 'fichiers' && noeud.type !== 'file') return false
      if (!terme) return true
      return noeud.name.toLowerCase().includes(terme) || noeud.path.toLowerCase().includes(terme)
    })
  }, [elements, recherche, filtre])

  const affiches = resultats.slice(0, MAX_AFFICHE)

  return (
    <>
      <div className="volet-entete">
        <div className="champ-recherche">
          <span className="icone-gauche">
            <Search size={16} />
          </span>
          <input
            className="champ"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Rechercher un nom..."
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            aria-label="Rechercher un fichier ou un dossier"
          />
          {recherche ? (
            <button type="button" className="effacer" onClick={() => onRecherche('')} aria-label="Effacer">
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div className="segments" role="group" aria-label="Filtrer">
          <button type="button" aria-pressed={filtre === 'tout'} onClick={() => onFiltre('tout')}>
            <Files size={14} aria-hidden /> Tout
          </button>
          <button type="button" aria-pressed={filtre === 'dossiers'} onClick={() => onFiltre('dossiers')}>
            <Folder size={14} aria-hidden /> Dossiers
          </button>
          <button type="button" aria-pressed={filtre === 'fichiers'} onClick={() => onFiltre('fichiers')}>
            <FileText size={14} aria-hidden /> Fichiers
          </button>
        </div>
      </div>

      <div className="volet-defile">
        {affiches.length === 0 ? (
          <div className="vide">
            <Search size={24} strokeWidth={1.4} aria-hidden />
            <div>{recherche ? `Aucun resultat pour "${recherche}".` : 'Aucun element.'}</div>
          </div>
        ) : (
          <div style={{ padding: '6px 6px 0' }}>
            {affiches.map((noeud) => (
              <div
                key={noeud.path}
                className={`ligne ${marques.get(noeud.path)?.brille ? 'brille' : ''}`}
                aria-selected={cheminActif === noeud.path}
              >
                <button
                  type="button"
                  className="case"
                  role="checkbox"
                  aria-checked={selection.has(noeud.path)}
                  aria-label={`Selectionner ${noeud.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectionner(noeud.path)
                  }}
                  style={modeSelection || selection.has(noeud.path) ? undefined : { display: 'none' }}
                >
                  <Check size={14} strokeWidth={3} />
                </button>

                <button
                  type="button"
                  className="ligne"
                  style={{ padding: 0, minHeight: 0, background: 'none', flex: 1 }}
                  onClick={() => onChoisir(noeud)}
                >
                  <IconeElement noeud={noeud} />
                  <span className="ligne-texte">
                    <span className="ligne-nom">{noeud.name}</span>
                    <span className="ligne-sous">{noeud.path}</span>
                  </span>
                  {marques.has(noeud.path) ? <Bulle marque={marques.get(noeud.path)!} /> : null}
                  {notes[noeud.path] ? <StickyNote size={13} color="#b45309" aria-label="Note" /> : null}
                  {noeud.type === 'file' ? (
                    <span className="ligne-meta">{formatSize(noeud.size)}</span>
                  ) : (
                    <span className="compteur">{noeud.count ?? 0}</span>
                  )}
                </button>
              </div>
            ))}

            {resultats.length > affiches.length ? (
              <div className="vide" style={{ padding: '16px 12px' }}>
                {resultats.length - affiches.length} elements supplementaires. Affinez la recherche.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
