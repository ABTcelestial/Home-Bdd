import { Hub } from '@/components/Hub'
import { FournisseurToasts } from '@/components/Toasts'

export const dynamic = 'force-dynamic'

export default function Accueil() {
  return (
    <FournisseurToasts>
      <Hub />
    </FournisseurToasts>
  )
}
