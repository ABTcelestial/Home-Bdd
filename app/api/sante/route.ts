export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Verification de service (NSSM / raccourci) : publique et sans donnee. */
export async function GET() {
  return Response.json({ ok: true, app: 'celestial-hub', heure: new Date().toISOString() })
}
