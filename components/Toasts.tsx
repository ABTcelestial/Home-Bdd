'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

type Ton = 'info' | 'succes' | 'erreur'
type Toast = { id: number; texte: string; ton: Ton }

type ToastApi = {
  info: (texte: string) => void
  succes: (texte: string) => void
  erreur: (texte: string) => void
}

const Contexte = createContext<ToastApi | null>(null)

export function useToasts(): ToastApi {
  const api = useContext(Contexte)
  if (!api) throw new Error('useToasts doit etre utilise dans <FournisseurToasts>')
  return api
}

export function FournisseurToasts({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const compteur = useRef(0)

  const retirer = useCallback((id: number) => {
    setToasts((liste) => liste.filter((t) => t.id !== id))
  }, [])

  const ajouter = useCallback(
    (texte: string, ton: Ton) => {
      const id = ++compteur.current
      setToasts((liste) => [...liste.slice(-3), { id, texte, ton }])
      window.setTimeout(() => retirer(id), ton === 'erreur' ? 7000 : 3800)
    },
    [retirer],
  )

  const api = useMemo<ToastApi>(
    () => ({
      info: (t) => ajouter(t, 'info'),
      succes: (t) => ajouter(t, 'succes'),
      erreur: (t) => ajouter(t, 'erreur'),
    }),
    [ajouter],
  )

  return (
    <Contexte.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.ton}`}>
            {toast.ton === 'erreur' ? (
              <AlertTriangle size={16} style={{ flex: 'none', marginTop: 1 }} aria-hidden />
            ) : toast.ton === 'succes' ? (
              <CheckCircle2 size={16} style={{ flex: 'none', marginTop: 1 }} aria-hidden />
            ) : (
              <Info size={16} style={{ flex: 'none', marginTop: 1 }} aria-hidden />
            )}
            <span>{toast.texte}</span>
            <button type="button" onClick={() => retirer(toast.id)} aria-label="Fermer">
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </Contexte.Provider>
  )
}
