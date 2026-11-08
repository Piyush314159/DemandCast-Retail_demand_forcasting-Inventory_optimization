import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Read the latest pipeline snapshot on each request.
  cacheComponents: false,
  devIndicators: false,
  transpilePackages: ["recharts", "lucide-react"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
