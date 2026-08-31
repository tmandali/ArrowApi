import path from "node:path";
import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "https://localhost:7137";

const nextConfig: NextConfig = {
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
