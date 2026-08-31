/** @type {import('next').NextConfig} */
const nextConfig = {
  // L'app tourne en LAN derriere un serveur node maison (server.js) : pas de
  // telemetrie, pas d'optimisation qui necessite le reseau.
  reactStrictMode: true,
  poweredByHeader: false,
  // Sortie autonome : .next/standalone contient le serveur et UNIQUEMENT les
  // dependances reellement utilisees. C'est ce qui permet de fabriquer le
  // Hub portable (deploiement/portable.mjs) sans embarquer tout node_modules.
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Les uploads passent en flux brut (pas de formData), mais on garde une
    // limite haute pour les server actions eventuelles.
    serverActions: { bodySizeLimit: '512mb' },
  },
}

export default nextConfig
