/** @type {import('next').NextConfig} */
const nextConfig = {
  // L'app tourne en LAN derriere un serveur node maison (server.js) : pas de
  // telemetrie, pas d'optimisation qui necessite le reseau.
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Les uploads passent en flux brut (pas de formData), mais on garde une
    // limite haute pour les server actions eventuelles.
    serverActions: { bodySizeLimit: '512mb' },
  },
}

export default nextConfig
