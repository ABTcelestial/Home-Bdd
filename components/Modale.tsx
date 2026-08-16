'use client'

import { useEffect, useRef } from 'react'

/**
 * Boite de dialogue unique de l'app. Sur PC c'est une fenetre centree, sur
 * telephone la meme structure devient une feuille qui monte du bas (CSS).
 */
export function Modale({
  titre,
  icone,
  children,
  pied,
  onFermer,
  large = false,
}: {
  titre: string
  icone?: React.ReactNode
  children: React.ReactNode
  pied?: React.ReactNode
  onFermer: () => void
  large?: boolean
}) {
  const boite = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', surTouche)
    // Met le focus sur le premier champ : au clavier comme au doigt, on peut
    // taper immediatement.
    const premier = boite.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([data-secondaire])',
    )
    premier?.focus()
    return () => document.removeEventListener('keydown', surTouche)
  }, [onFermer])

  return (
    <div
      className="voile"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer()
      }}
    >
      <div
        className="modale"
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        ref={boite}
        style={large ? { maxWidth: 620 } : undefined}
      >
        <div className="poignee" aria-hidden />
        <div className="modale-entete">
          {icone}
          <span>{titre}</span>
        </div>
        <div className="modale-corps">{children}</div>
        {pied ? <div className="modale-pied">{pied}</div> : null}
      </div>
    </div>
  )
}
