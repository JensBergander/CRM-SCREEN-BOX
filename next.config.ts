import type { NextConfig } from "next";

// Interne App: jede Seite liest die Sitzung und wird pro Anfrage gerendert,
// daher ohne Cache Components.
const nextConfig: NextConfig = {
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
