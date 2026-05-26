/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    },
    // Keep native/server-only DB packages out of the bundle so they load at runtime.
    serverComponentsExternalPackages: [
      "@prisma/client",
      "@prisma/adapter-pg",
      "pg",
      "@google-cloud/cloud-sql-connector",
      "@anthropic-ai/vertex-sdk"
    ]
  }
};

export default nextConfig;
