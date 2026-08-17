'use client'

import { useEffect, useState } from 'react'
import {
  Download,
  FilePen,
  FolderInput,
  FolderOpen,
  Pencil,
  StickyNote,
  Trash2,
  X,
  Save,
  Loader2,
} from 'lucide-react'
import { IconeElement } from './Icones'
import { formatDate, formatSize, extOf, maybeText } from '@/lib/filetypes'
import type { FsNode } from '@/lib/types'

/**
 * Panneau de detail (PRD 5.2). Troisieme colonne sur PC, tiroir lateral sur
 * tablette, feuille remontante sur telephone : meme composant, la mise en page
 * est entierement geree en CSS.
 */
export function PanneauDetail({
  noeud,
  note,
  isServer,
  onFermer,
  onTelecharger,
  onOuvrir,
  onOuvrirEmplacement,
  onRenommer,
  onDeplacer,
  onSupprimer,
  onEnregistrerNote,
}: {
  noeud: FsNode
  note: string
  /** Vrai depuis le PC serveur : lui seul peut ouvrir l'Explorateur Windows. */
  isServer: boolean
  onFermer: () => void
  onTelecharger: () => void
  onOuvrir: () => void
  onOuvrirEmplacement: () => void
  onRenommer: () => void
  onDeplacer: () => void
  onSupprimer: () => void
  onEnregistrerNote: (note: string) => Promise<void>
}) {
  const [brouillon, setBrouillon] = useState(note)
  const [enregistrement, setEnregistrement] = useState(false)

  useEffect(() => {
    setBrouillon(note)
  }, [note, noeud.path])

  const estFichier = noeud.type === 'file'
  const ext = extOf(noeud.name)
  const editable = estFichier && maybeText(noeud.name, ext)
  const modifiee = brouillon !== note

  const enregistrer = async () => {
    setEnregistrement(true)
    try {
      await onEnregistrerNote(brouillon)
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <div className="detail">
      <div className="detail-entete">
        <IconeElement noeud={noeud} taille={22} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="detail-nom">{noeud.name}</div>
          <div className="ligne-sous" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
            {noeud.path}
          </div>
        </div>
        <button type="button" className="btn-icone" onClick={onFermer} aria-label="Fermer le detail">
          <X size={18} />
        </button>
      </div>

      <div className="detail-corps">
        <dl className="fiche">
          <dt>Type</dt>
          <dd>{estFichier ? (ext ? `Fichier ${ext.toUpperCase()}` : 'Fichier') : 'Dossier'}</dd>
          <dt>Taille</dt>
          <dd>{estFichier ? formatSize(noeud.size) : `${noeud.count ?? 0} element(s)`}</dd>
          <dt>Modifie</dt>
          <dd>{formatDate(noeud.mtime)}</dd>
        </dl>

        <div>
          <div className="bloc-titre">
            <StickyNote size={13} aria-hidden /> Note
          </div>
          <textarea
            className="champ"
            rows={4}
            placeholder="Mode d'emploi du fichier : ou est la cle, comment l'installer..."
            value={brouillon}
            onChange={(e) => setBrouillon(e.target.value)}
            aria-label="Note du fichier"
          />
          <button
            type="button"
            className="btn btn-bloc"
            style={{ marginTop: 6 }}
            onClick={enregistrer}
            disabled={!modifiee || enregistrement}
          >
            {enregistrement ? <Loader2 size={15} className="tourne" /> : <Save size={15} />}
            {modifiee ? 'Enregistrer la note' : 'Note a jour'}
          </button>
        </div>

        <div>
          <div className="bloc-titre">Actions</div>
          <div className="actions-grille">
            {estFichier ? (
              <button type="button" className="btn btn-principal" onClick={onTelecharger}>
                <Download size={15} /> Telecharger
              </button>
            ) : null}
            {editable ? (
              <button type="button" className="btn" onClick={onOuvrir}>
                <FilePen size={15} /> Ouvrir
              </button>
            ) : null}
            {isServer ? (
              <button
                type="button"
                className="btn"
                onClick={onOuvrirEmplacement}
                title="Ouvrir le dossier dans l'Explorateur Windows du PC serveur"
              >
                <FolderOpen size={15} /> Ouvrir l&apos;emplacement
              </button>
            ) : null}
            <button type="button" className="btn" onClick={onRenommer}>
              <Pencil size={15} /> Renommer
            </button>
            <button type="button" className="btn" onClick={onDeplacer}>
              <FolderInput size={15} /> Deplacer
            </button>
            <button type="button" className="btn btn-danger" onClick={onSupprimer}>
              <Trash2 size={15} /> Supprimer
            </button>
          </div>
          {!estFichier ? (
            <p className="champ-aide" style={{ marginTop: 8 }}>
              Supprimer un dossier envoie tout son contenu dans la corbeille.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
