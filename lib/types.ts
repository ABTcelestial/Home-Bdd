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

/** Couleur d'une bulle de guidage : simple information, chose a faire, alerte. */
export type TonGuide = 'info' | 'action' | 'alerte'

/**
 * Marque posee sur un element depuis `.hub-guide.json` (ecrit par Claude Code
 * ou par un script de build). Le Hub la lit, ne l'ecrit jamais.
 */
export type MarqueGuide = {
  /** Chemin relatif a la racine, normalise en slashs. */
  chemin: string
  brille: boolean
  bulle: string
  ton: TonGuide
  /** Empreinte du contenu : si le texte change, la marque redevient a voir. */
  signature: string
  /** Ryan a clique "fait" sur cette version de la marque. */
  vu: boolean
}

export type TreePayload = {
  /** Chemin absolu de la racine configuree (affiche a cote de l'icone BDD). */
  racine: string
  version: number
  tree: FsNode[]
  notes: Record<string, string>
  /** La requete vient-elle du PC serveur (localhost) ? */
  isServer: boolean
  /** Marques de guidage, dans l'ordre du fichier .hub-guide.json. */
  guide: MarqueGuide[]
  /** Le fichier de guidage existe mais est illisible : on le dit plutot que de l'ignorer. */
  guideErreur?: string
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
