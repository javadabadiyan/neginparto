import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

function buildVersionManifestPlugin(buildId: string): Plugin {
  const payload = JSON.stringify({
    version: buildId,
    builtAt: new Date().toISOString(),
  });

  return {
    name: 'neginparto-version-manifest',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(payload);
      });
    },
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir || path.resolve(import.meta.dirname, 'dist');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'version.json'), payload, 'utf-8');
    },
  };
}

export default defineConfig(() => {
  const buildId = String(Date.now());

  return {
    base: './',
    plugins: [react(), tailwindcss(), buildVersionManifestPlugin(buildId)],
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/d3-') || id.includes('/node_modules/victory-vendor/')) {
              return 'vendor-charts';
            }
            if (id.includes('/node_modules/xlsx/')) {
              return 'vendor-xlsx';
            }
            if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) {
              return 'vendor-firebase';
            }
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/lucide-react/')
            ) {
              return 'vendor-react';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
