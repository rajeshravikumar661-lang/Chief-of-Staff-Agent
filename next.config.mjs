/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis", "googleapis"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
