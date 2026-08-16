import Link from 'next/link'
import { Database } from 'lucide-react'

export default function Introuvable() {
  return (
    <main className="connexion">
      <div className="connexion-carte">
        <span className="connexion-logo" aria-hidden>
          <Database size={26} strokeWidth={1.7} />
        </span>
        <h1 style={{ fontSize: 18, margin: 0 }}>Page introuvable</h1>
        <p className="champ-aide" style={{ margin: 0 }}>
          Cette page n&apos;existe pas, ou n&apos;est accessible que depuis le PC serveur.
        </p>
        <Link className="btn btn-principal btn-bloc" href="/">
          Retour au Hub
        </Link>
      </div>
    </main>
  )
}
