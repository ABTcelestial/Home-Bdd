'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Database, Eye, EyeOff, Loader2, LogIn, AlertTriangle } from 'lucide-react'
import { apiPost, messageErreur } from '@/lib/client'

/**
 * Ecran de connexion (PRD 5.1) : un champ, rien d'autre. Pense pour le doigt
 * autant que pour le clavier (champ haut, clavier "go", zoom iOS evite).
 */
export function FormulaireConnexion({ motDePasseConfigure }: { motDePasseConfigure: boolean }) {
  const parametres = useSearchParams()
  const suite = parametres.get('suite') || '/'
  const [motDePasse, setMotDePasse] = useState('')
  const [visible, setVisible] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!motDePasse || envoi) return
    setEnvoi(true)
    setErreur(null)
    try {
      await apiPost('/api/auth/login', { motDePasse })
      // Rechargement complet : le middleware voit le nouveau cookie.
      window.location.href = suite.startsWith('/') ? suite : '/'
    } catch (err) {
      setErreur(messageErreur(err))
      setMotDePasse('')
      setEnvoi(false)
    }
  }

  return (
    <main className="connexion">
      <form className="connexion-carte" onSubmit={soumettre}>
        <span className="connexion-logo" aria-hidden>
          <Database size={26} strokeWidth={1.7} />
        </span>
        <div>
          <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Celestial Hub</h1>
          <p className="champ-aide" style={{ margin: 0 }}>
            Fichiers partages de la maison. Reseau local uniquement.
          </p>
        </div>

        {!motDePasseConfigure ? (
          <div className="alerte alerte-danger" style={{ textAlign: 'left' }}>
            <AlertTriangle size={16} aria-hidden />
            <span>
              Aucun mot de passe configure sur le serveur. Definissez <span className="mono">HUB_PASSWORD</span>{' '}
              puis redemarrez le service.
            </span>
          </div>
        ) : null}

        <div className="champ-mdp">
          <input
            className="champ"
            type={visible ? 'text' : 'password'}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="Mot de passe"
            autoComplete="current-password"
            enterKeyHint="go"
            autoFocus
            aria-label="Mot de passe"
            disabled={envoi}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        {erreur ? (
          <div className="alerte alerte-danger" style={{ textAlign: 'left' }} role="alert">
            <AlertTriangle size={16} aria-hidden />
            <span>{erreur}</span>
          </div>
        ) : null}

        <button type="submit" className="btn btn-principal btn-bloc" disabled={envoi || !motDePasse}>
          {envoi ? <Loader2 size={16} className="tourne" /> : <LogIn size={16} />} Se connecter
        </button>
      </form>
    </main>
  )
}
