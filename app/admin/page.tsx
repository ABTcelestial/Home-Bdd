import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { estAdresseLocale } from '@/lib/api'
import { PageAdmin } from '@/components/PageAdmin'
import { FournisseurToasts } from '@/components/Toasts'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Reglages - Celestial Hub' }

/**
 * Interface admin (PRD 5.9) : accessible uniquement depuis le PC serveur.
 * Depuis un autre PC la page n'existe simplement pas (404), et chaque route
 * API refait la verification de son cote.
 */
export default async function Admin() {
  const entetes = await headers()
  if (!estAdresseLocale(entetes.get('x-hub-remote-addr') || '')) notFound()

  return (
    <FournisseurToasts>
      <PageAdmin />
    </FournisseurToasts>
  )
}
