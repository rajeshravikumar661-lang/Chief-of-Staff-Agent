/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output is only for the Docker image (server.js runtime — see
  // Dockerfile). Platforms that run `next start` directly (Render, Vercel)
  // must NOT get this: under standalone + `next start`, Next.js mis-resolves
  // dynamic catch-all API routes — broke NextAuth's [...nextauth] route with
  // "UnknownAction: Unsupported action" on every sign-in attempt.
  output: process.env.DOCKER_STANDALONE_BUILD === "1" ? "standalone" : undefined,
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis", "googleapis"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
