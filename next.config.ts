import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.OUTPUT_EXPORT === 'true' ? { output: 'export' as const } : {}),
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
