import path from "node:path";
import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:5168";

const computerName = process.env.COMPUTERNAME || "timurmandali2";

const nextConfig: NextConfig = {
  // Makine adı ve yerel ağ (LAN) üzerinden erişimde Next.js 15/16 dev güvenlik engelini (403) kaldırır
  allowedDevOrigins: [
    "localhost",
    "localhost:56402",
    "localhost:5168",
    "127.0.0.1",
    "127.0.0.1:56402",
    "127.0.0.1:5168",
    "0.0.0.0",
    "0.0.0.0:56402",
    "0.0.0.0:5168",
    "timurmandali2",
    "timurmandali2:56402",
    "timurmandali2:5168",
    "TIMURMANDALI2",
    "TIMURMANDALI2:56402",
    "TIMURMANDALI2:5168",
    "10.60.52.40",
    "10.60.52.40:56402",
    "10.60.52.40:5168",
    "10.60.168.107",
    "10.60.168.107:56402",
    "10.60.168.107:5168",
    "172.20.16.1",
    "172.20.16.1:56402",
    "172.20.16.1:5168",
    computerName.toLowerCase(),
    `${computerName.toLowerCase()}:56402`,
    `${computerName.toLowerCase()}:5168`,
    computerName.toUpperCase(),
    `${computerName.toUpperCase()}:56402`,
    `${computerName.toUpperCase()}:5168`,
    "*.local",
    "*.local:56402",
    "*.local:5168",
    "*.lcwaikiki.local",
    "*.lcwaikiki.local:56402",
    "*.lcwaikiki.local:5168",
    "*.lan",
    "*.lan:56402",
    "*.lan:5168",
    "10.*",
    "172.*",
    "192.168.*",
  ],
  // Monorepo içinde ikinci package-lock nedeniyle kök çıkarımı kararsız olabiliyor;
  // grafiği bu proje dizinine sabitliyoruz.
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.yaml": {
        loaders: [require.resolve("raw-loader")],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.yaml$/,
      type: "asset/source",
    });
    return config;
  },
  async rewrites() {
    return [
      // Vite'taki ^/weatherforecast karşılığı (legacy dev endpoint'i).
      {
        source: "/weatherforecast/:path*",
        destination: `${backendUrl}/weatherforecast/:path*`,
      },
      // Yula'nın kendi route handler'ları (/api/agent/*) dosya sistemiyle
      // çözülür; dizi-formu rewrite dosyadan SONRA koşar, çakışma yoktur.
      // Kalan tüm /api/* ASP.NET'e proxylanır (eski ^/api proxy'si).
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
