import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/**
 * PRD 5.1 : toute route (pages + API) est protegee sauf le login.
 * Le middleware tourne en runtime Node pour pouvoir lire le secret local.
 */
export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icone.svg|manifest.webmanifest).*)'],
}

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/sante'])

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const authenticated = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)

  if (PUBLIC_PATHS.has(pathname)) {
    // Deja connecte : inutile de revoir l'ecran de login.
    if (pathname === '/login' && authenticated) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return NextResponse.next()
  }

  if (authenticated) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, erreur: 'Session expiree.', auth: false }, { status: 401 })
  }

  const url = new URL('/login', req.url)
  const suite = pathname + req.nextUrl.search
  if (suite && suite !== '/') url.searchParams.set('suite', suite)
  return NextResponse.redirect(url)
}
