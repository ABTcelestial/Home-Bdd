/**
 * Celestial Hub - serveur HTTP maison autour de Next.js.
 *
 * Pourquoi un serveur custom plutot que `next start` :
 *  - on a besoin de l'adresse IP reelle du client (req.socket.remoteAddress)
 *    pour distinguer le PC serveur (localhost) des PC clients du reseau ;
 *  - on neutralise tout en-tete `x-hub-remote-addr` envoye par un client qui
 *    tenterait de se faire passer pour localhost.
 *
 * Usage :
 *   node server.js          (production, apres `npm run build`)
 *   node server.js --dev    (developpement)
 */
const { createServer } = require('node:http')
const os = require('node:os')
const next = require('next')

/**
 * Le Hub ne doit JAMAIS mourir a cause d'une seule requete.
 *
 * Cas reel : un telephone qui verrouille son ecran coupe son flux SSE ; Next
 * essaie d'ecrire dans un flux deja ferme et leve `ERR_INVALID_STATE` hors de
 * toute pile rattrapable. Par defaut Node arrete alors le processus — et le
 * serveur de fichiers de la maison disparait parce qu'un onglet s'est ferme.
 *
 * On journalise bruyamment et on continue : pour ce serveur, rester debout vaut
 * mieux qu'un arret propre. Les erreurs de requete, elles, restent traitees
 * individuellement plus bas.
 */
process.on('uncaughtException', (err) => {
  console.error('[hub] exception non rattrapee (le serveur continue) :', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[hub] promesse rejetee sans traitement (le serveur continue) :', err)
})

const dev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development'
const port = parseInt(process.env.PORT || '3000', 10)
const hostname = process.env.HOST || '0.0.0.0'

const app = next({ dev, hostname: '0.0.0.0', port })
const handle = app.getRequestHandler()

/** Normalise ::ffff:127.0.0.1 -> 127.0.0.1 */
function normalizeAddr(addr) {
  if (!addr) return ''
  if (addr.startsWith('::ffff:')) return addr.slice(7)
  return addr
}

function localAddresses() {
  const out = []
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Anti-spoofing : on ecrase toujours l'en-tete avec l'adresse reelle.
    delete req.headers['x-hub-remote-addr']
    req.headers['x-hub-remote-addr'] = normalizeAddr(req.socket.remoteAddress)
    handle(req, res).catch((err) => {
      console.error('[hub] erreur de requete', err)
      res.statusCode = 500
      res.end('Erreur interne')
    })
  })

  // Gros fichiers : on laisse le temps aux transferts lents (5 Go en WiFi).
  server.requestTimeout = 0
  server.headersTimeout = 120_000
  server.keepAliveTimeout = 120_000
  server.timeout = 0

  server.listen(port, hostname, () => {
    const ips = localAddresses()
    console.log('')
    console.log('  Celestial Hub demarre')
    console.log(`  Local    : http://localhost:${port}`)
    for (const ip of ips) console.log(`  Reseau   : http://${ip}:${port}`)
    console.log('')
  })
})
