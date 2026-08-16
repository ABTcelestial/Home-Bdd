'use client'

import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Package,
} from 'lucide-react'
import { KIND_COLOR, kindOf, type FileKind } from '@/lib/filetypes'
import type { FsNode } from '@/lib/types'

const COMPOSANT: Record<FileKind, typeof File> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  archive: FileArchive,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  binaire: Package,
  code: FileCode,
  texte: FileText,
  defaut: File,
}

/** Icone d'un element : dossier jaune, fichier teinte selon son type (PRD 5.2). */
export function IconeElement({
  noeud,
  ouvert = false,
  taille = 17,
}: {
  noeud: Pick<FsNode, 'type' | 'ext'>
  ouvert?: boolean
  taille?: number
}) {
  if (noeud.type === 'dir') {
    const Icone = ouvert ? FolderOpen : Folder
    return <Icone size={taille} color="#ca8a04" fill="#fde68a" strokeWidth={1.7} aria-hidden />
  }
  const kind = kindOf(noeud.ext)
  const Icone = COMPOSANT[kind]
  return <Icone size={taille} color={KIND_COLOR[kind]} strokeWidth={1.7} aria-hidden />
}
