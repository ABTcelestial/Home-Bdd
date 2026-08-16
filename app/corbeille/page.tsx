import { PageCorbeille } from '@/components/PageCorbeille'
import { FournisseurToasts } from '@/components/Toasts'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Corbeille - Celestial Hub' }

export default function Corbeille() {
  return (
    <FournisseurToasts>
      <PageCorbeille />
    </FournisseurToasts>
  )
}
