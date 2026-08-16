import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Celestial Hub',
  description: 'Gestionnaire de fichiers en reseau local',
  applicationName: 'Celestial Hub',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icone.svg', apple: '/icone.svg' },
  formatDetection: { telephone: false, email: false, address: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // On laisse le zoom possible : accessibilite avant tout.
  maximumScale: 5,
  userScalable: true,
  // Le contenu passe sous l'encoche ; les paddings safe-area font le reste.
  viewportFit: 'cover',
  themeColor: '#ffffff',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
