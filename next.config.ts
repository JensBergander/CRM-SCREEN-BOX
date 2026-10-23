import type { NextConfig } from "next";

// Interne App: jede Seite liest die Sitzung und wird pro Anfrage gerendert,
// daher ohne Cache Components.
//
// Der Hostinger-Server begrenzt Prozesse und Threads stark. Deshalb wird mit
// Webpack statt Turbopack gebaut, mit begrenzten Thread-Pools (siehe
// package.json) und ohne zusätzliche Build-Worker. Ohne diese Grenzen bricht
// der Build ab oder hängt und blockiert das ganze Hosting-Konto.
const nextConfig: NextConfig = {
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
    workerThreads: true,
    staticGenerationMaxConcurrency: 1,
  },
};

export default nextConfig;
