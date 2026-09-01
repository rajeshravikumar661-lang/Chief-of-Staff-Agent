/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis", "googleapis"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
