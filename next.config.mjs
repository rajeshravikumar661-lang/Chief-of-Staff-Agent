/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output is only for the Docker image (server.js runtime — see
  // Dockerfile). Platforms that run `next start` directly (Render, Vercel)
  // must NOT get this: under standalone + `next start`, Next.js mis-resolves
  // dynamic catch-all API routes — broke NextAuth's [...nextauth] route with
  // "UnknownAction: Unsupported action" on every sign-in attempt.
  output: process.env.DOCKER_STANDALONE_BUILD === "1" ? "standalone" : undefined,
  // @whiskeysockets/baileys + ws must NOT be bundled by Next: webpack mangles
  // the `ws` package's conditional bufferutil require, and the WebSocket frame
  // masking path then throws "TypeError: b.mask is not a function" the moment a
  // WhatsApp socket opens — pairing produces no QR and silently closes.
  serverExternalPackages: [
    "@prisma/client",
    "bullmq",
    "ioredis",
    "googleapis",
    "@whiskeysockets/baileys",
    "ws",
    "pino",
    "pino-pretty",
  ],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
