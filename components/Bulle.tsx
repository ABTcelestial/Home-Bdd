'use client'

import { MessageCircle, CircleAlert, CircleCheckBig } from 'lucide-react'
import type { MarqueGuide } from '@/lib/types'

const ICONE = {
  info: MessageCircle,
  action: CircleCheckBig,
  alerte: CircleAlert,
} as const

/**
 * Petite bulle accrochee a une ligne : le texte qu'un outil exterieur
 * (Claude Code, script de build) a laisse sur ce fichier via .hub-guide.json.
 *
 * Purement decorative : c'est la ligne qui reste cliquable, la bulle n'attrape
 * aucun clic. Le texte complet est dans le title et dans le panneau "A finir",
 * la version affichee peut donc etre tronquee sans rien perdre.
 */
export function Bulle({ marque }: { marque: MarqueGuide }) {
  if (!marque.bulle) return null
  const Icone = ICONE[marque.ton]
  return (
    <span className={`bulle bulle-${marque.ton}`} title={marque.bulle}>
      <Icone size={12} strokeWidth={2} aria-hidden />
      <span className="bulle-texte">{marque.bulle}</span>
    </span>
  )
}
