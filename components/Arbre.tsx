'use client'

import { useState } from 'react'
import { ChevronRight, Database, MoreVertical, StickyNote, Check } from 'lucide-react'
import { IconeElement } from './Icones'
import { formatSize } from '@/lib/filetypes'
import type { FsNode } from '@/lib/types'

export type ArbreProps = {
  noeuds: FsNode[]
  racine: string
  notes: Record<string, string>
  ouverts: Set<string>
  onBasculer: (chemin: string) => void
  cheminActif: string | null
  onOuvrir: (noeud: FsNode) => void
  selection: Set<string>
  onSelectionner: (chemin: string) => void
  modeSelection: boolean
  onMenu: (noeud: FsNode | null) => void
  surligne: string | null
  dossierActif: string
  onDossierActif: (chemin: string) => void
  onDepot: (dossier: string, dt: DataTransfer) => void
}

/**
 * Arborescence (PRD 5.2). La racine n'est jamais un noeud : elle est
 * representee par l'icone BDD en haut, et son contenu s'affiche juste dessous.
 */
export function Arbre(props: ArbreProps) {
  const [cible, setCible] = useState<string | null>(null)

  const propsDepot = (chemin: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy' as const
      setCible(chemin)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target) setCible(null)
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      setCible(null)
      props.onDepot(chemin, e.dataTransfer)
    },
  })

  return (
    <div className="arbre">
      <div
        className={`arbre-racine ${cible === '' ? 'zone-depot' : ''}`}
        {...propsDepot('')}
        onClick={() => props.onDossierActif('')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') props.onDossierActif('')
        }}
        aria-label={`Racine ${props.racine}`}
      >
        <Database size={22} strokeWidth={1.6} aria-hidden />
        <div style={{ minWidth: 0 }}>
          <div className="titre">Celestial Hub</div>
          <div className="chemin">{props.racine}</div>
        </div>
        {props.dossierActif === '' ? (
          <span className="compteur" style={{ marginLeft: 'auto' }}>
            dossier actif
          </span>
        ) : null}
      </div>

      <Branche {...props} noeuds={props.noeuds} niveau={0} cible={cible} propsDepot={propsDepot} />

      {props.noeuds.length === 0 ? (
        <div className="vide">
          <Database size={26} strokeWidth={1.4} aria-hidden />
          <div>
            Aucun fichier pour l&apos;instant.
            <br />
            Deposez un fichier ici ou utilisez le bouton Televerser.
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Branche(
  props: ArbreProps & {
    noeuds: FsNode[]
    niveau: number
    cible: string | null
    propsDepot: (chemin: string) => Record<string, unknown>
  },
) {
  return (
    <div className="branche">
      {props.noeuds.map((noeud) => (
        <Noeud key={noeud.path} {...props} noeud={noeud} />
      ))}
    </div>
  )
}

function Noeud(
  props: ArbreProps & {
    noeud: FsNode
    niveau: number
    cible: string | null
    propsDepot: (chemin: string) => Record<string, unknown>
  },
) {
  const { noeud } = props
  const estDossier = noeud.type === 'dir'
  const ouvert = props.ouverts.has(noeud.path)
  const actif = props.cheminActif === noeud.path
  const selectionne = props.selection.has(noeud.path)
  const note = props.notes[noeud.path]
  const depot = estDossier ? props.propsDepot(noeud.path) : {}

  return (
    <div className="noeud" data-chemin={noeud.path}>
      <div
        className={`ligne ${props.surligne === noeud.path ? 'surlignee' : ''} ${
          props.cible === noeud.path ? 'zone-depot' : ''
        }`}
        aria-selected={actif || (estDossier && props.dossierActif === noeud.path)}
        {...depot}
      >
        <button
          type="button"
          className="case"
          role="checkbox"
          aria-checked={selectionne}
          aria-label={`Selectionner ${noeud.name}`}
          onClick={(e) => {
            e.stopPropagation()
            props.onSelectionner(noeud.path)
          }}
          style={props.modeSelection || selectionne ? undefined : { display: 'none' }}
        >
          <Check size={14} strokeWidth={3} />
        </button>

        {estDossier ? (
          <button
            type="button"
            className={`chevron ${ouvert ? 'ouvert' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              props.onBasculer(noeud.path)
            }}
            aria-label={ouvert ? `Replier ${noeud.name}` : `Deplier ${noeud.name}`}
            aria-expanded={ouvert}
          >
            <ChevronRight size={15} />
          </button>
        ) : (
          <span className="chevron-vide" aria-hidden />
        )}

        <button
          type="button"
          className="ligne"
          style={{ padding: 0, minHeight: 0, background: 'none', flex: 1 }}
          onClick={() => {
            if (estDossier) {
              // Un dossier se contente de s'ouvrir et devient la cible des
              // envois : sur telephone, la feuille de detail masquerait l'arbre
              // alors qu'on est justement en train de naviguer. Son detail
              // reste accessible par le menu "...".
              props.onDossierActif(noeud.path)
              props.onBasculer(noeud.path)
              return
            }
            props.onOuvrir(noeud)
          }}
        >
          <IconeElement noeud={noeud} ouvert={ouvert} />
          <span className="ligne-texte">
            <span className="ligne-nom">{noeud.name}</span>
          </span>
          {note ? <StickyNote size={13} color="#b45309" aria-label="Contient une note" /> : null}
          {estDossier ? (
            <span className="compteur">{noeud.count ?? 0}</span>
          ) : (
            <span className="ligne-meta masque-mobile">{formatSize(noeud.size)}</span>
          )}
        </button>

        <div className="ligne-actions">
          <button
            type="button"
            className="btn-icone"
            aria-label={`Actions sur ${noeud.name}`}
            onClick={(e) => {
              e.stopPropagation()
              props.onMenu(noeud)
            }}
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {estDossier && ouvert && noeud.children && noeud.children.length > 0 ? (
        <Branche {...props} noeuds={noeud.children} niveau={props.niveau + 1} />
      ) : null}
      {estDossier && ouvert && (!noeud.children || noeud.children.length === 0) ? (
        <div className="branche">
          {/* Enveloppe .noeud : le placeholder recoit le meme coude que les
              vrais enfants, sinon le trait du parent s'arrete dans le vide. */}
          <div className="noeud">
            <div className="ligne" style={{ color: 'var(--texte-faible)', fontSize: 12.5 }}>
              Dossier vide
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
