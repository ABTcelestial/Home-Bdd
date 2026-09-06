import { PageTerminal } from '@/components/PageTerminal'
import { FournisseurToasts } from '@/components/Toasts'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Terminal LAN - Celestial Hub' }

export default function Terminal() {
  return (
    <FournisseurToasts>
      <PageTerminal />
    </FournisseurToasts>
  )
}
