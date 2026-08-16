/** Types partages entre le serveur et les composants client. */

export type NodeType = 'file' | 'dir'

export type FsNode = {
  name: string
  /** Chemin relatif a la racine, en slashs. Vide = racine. */
  path: string
  type: NodeType
  size: number
  /** Date de modification (ms epoch). */
  mtime: number
  /** Extension en minuscules, sans le point ("" pour un dossier). */
  ext: string
  children?: FsNode[]
  /** Nombre d'elements directs (dossiers seulement). */
  count?: number
}

export type TreePayload = {
  /** Chemin absolu de la racine configuree (affiche a cote de l'icone BDD). */
  racine: string
  version: number
  tree: FsNode[]
  notes: Record<string, string>
  /** La requete vient-elle du PC serveur (localhost) ? */
  isServer: boolean
  totals: { dossiers: number; fichiers: number; taille: number }
  /** La racine existe-t-elle sur le disque ? */
  ok: boolean
  erreur?: string
}

export type TrashItem = {
  id: string
  nom: string
  origine: string
  supprimeLe: string
  type: NodeType
  taille: number
}
