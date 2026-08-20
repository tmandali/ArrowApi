import { fileURLToPath, URL } from 'node:url';

import { createLogger, defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { env } from 'process';

const customLogger = createLogger();
const originalWarn = customLogger.warn.bind(customLogger);
customLogger.warn = (msg, options) => {
    if (msg.includes('points to a source file outside its package') || msg.includes('@duckdb')) {
        return;
    }
    originalWarn(msg, options);
};

const baseFolder =
    env.APPDATA !== undefined && env.APPDATA !== ''
        ? `${env.APPDATA}/ASP.NET/https`
        : `${env.HOME}/.aspnet/https`;

const certificateName = "sims.client";
const certFilePath = path.join(baseFolder, `${certificateName}.pem`);
const keyFilePath = path.join(baseFolder, `${certificateName}.key`);

if (!fs.existsSync(baseFolder)) {
    fs.mkdirSync(baseFolder, { recursive: true });
}

if (!fs.existsSync(certFilePath) || !fs.existsSync(keyFilePath)) {
    if (0 !== child_process.spawnSync('dotnet', [
        'dev-certs',
        'https',
        '--export-path',
        certFilePath,
        '--format',
        'Pem',
        '--no-password',
    ], { stdio: 'inherit', }).status) {
        throw new Error("Could not create certificate.");
    }
}

const target = env.ASPNETCORE_HTTPS_PORT ? `https://localhost:${env.ASPNETCORE_HTTPS_PORT}` :
    env.ASPNETCORE_URLS ? env.ASPNETCORE_URLS.split(';')[0] : 'https://localhost:7137';

const isTauri = Boolean(
    env.TAURI_ENV_PLATFORM ||
    env.TAURI_PLATFORM ||
    process.env.TAURI_ENV_PLATFORM ||
    process.env.TAURI_PLATFORM
);

const httpsConfig = (!isTauri && fs.existsSync(certFilePath) && fs.existsSync(keyFilePath))
    ? {
        key: fs.readFileSync(keyFilePath),
        cert: fs.readFileSync(certFilePath),
    }
    : undefined;

// https://vitejs.dev/config/
export default defineConfig({
    customLogger,
    plugins: [plugin()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    server: {
        // Makine adı / LAN erişimi için tüm arayüzlerde dinle (localhost + TIMURMANDALI2...)
        host: true,
        proxy: {
            '^/weatherforecast': {
                target,
                secure: false
            },
            '^/api': {
                target,
                secure: false
            }
        },
        port: parseInt(env.DEV_SERVER_PORT || '56402'),
        strictPort: true,
        https: httpsConfig,
    },
    build: {
        rollupOptions: {
            onwarn(warning, defaultHandler) {
                if (
                    warning.message?.includes('points to a source file outside its package') ||
                    warning.code === 'SOURCEMAP_BROKEN' ||
                    warning.code === 'SOURCEMAP_ERROR'
                ) {
                    return;
                }
                defaultHandler(warning);
            },
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('apache-arrow')) {
                            return 'vendor-arrow';
                        }
                        if (id.includes('@duckdb')) {
                            return 'vendor-duckdb';
                        }
                        if (id.includes('recharts') || id.includes('d3-')) {
                            return 'vendor-charts';
                        }
                        if (id.includes('shiki') || id.includes('@shikijs')) {
                            return 'vendor-shiki';
                        }
                        if (id.includes('lucide-react')) {
                            return 'vendor-lucide';
                        }
                        if (id.includes('react-router') || id.includes('react-dom') || id.includes('react')) {
                            return 'vendor-react';
                        }
                    }
                }
            }
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('apache-arrow')) {
                            return 'vendor-arrow';
                        }
                        if (id.includes('@duckdb')) {
                            return 'vendor-duckdb';
                        }
                        if (id.includes('recharts') || id.includes('d3-')) {
                            return 'vendor-charts';
                        }
                        if (id.includes('shiki') || id.includes('@shikijs')) {
                            return 'vendor-shiki';
                        }
                        if (id.includes('lucide-react')) {
                            return 'vendor-lucide';
                        }
                        if (id.includes('react-router') || id.includes('react-dom') || id.includes('react')) {
                            return 'vendor-react';
                        }
                    }
                }
            }
        }
    }
})
