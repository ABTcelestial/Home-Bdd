import { Suspense } from 'react'
import { hasPassword } from '@/lib/config'
import { FormulaireConnexion } from '@/components/FormulaireConnexion'

export const dynamic = 'force-dynamic'

export default function PageConnexion() {
  return (
    <Suspense>
      <FormulaireConnexion motDePasseConfigure={hasPassword()} />
    </Suspense>
  )
}
