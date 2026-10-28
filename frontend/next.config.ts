import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Oculta el indicador de desarrollo de Next.js sobre el mapa; los errores de compilación y de ejecución se siguen mostrando.
  devIndicators: false,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;