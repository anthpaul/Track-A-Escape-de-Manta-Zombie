import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Hide the Next.js dev badge over the map; compile and runtime errors are still shown.
  devIndicators: false,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;