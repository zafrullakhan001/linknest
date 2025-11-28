import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';
    const base = isProduction ? '/linknest/' : '/';
    const apiBase = isProduction ? '/linknest/api' : '/api';
    
    return {
      base: base,
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true,
        sourcemap: false,
        minify: 'esbuild',
        chunkSizeWarningLimit: 1000, // Increase limit to 1MB (chunks are still optimized)
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              // Split node_modules into separate chunks
              if (id.includes('node_modules')) {
                // React and React DOM
                if (id.includes('react') || id.includes('react-dom')) {
                  return 'react-vendor';
                }
                // DnD Kit libraries
                if (id.includes('@dnd-kit')) {
                  return 'dnd-vendor';
                }
                // Google GenAI (can be large)
                if (id.includes('@google/genai') || id.includes('google')) {
                  return 'genai-vendor';
                }
                // Other vendor libraries
                return 'vendor';
              }
            }
          }
        }
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost/linknest',
            changeOrigin: true,
            secure: false,
            rewrite: (path) => {
              // Extract the API path (e.g., /tiles, /auth/me)
              const apiPath = path.replace(/^\/api/, '');
              // Route to index.php with path as query parameter
              return `/api/index.php?path=${encodeURIComponent(apiPath)}`;
            }
          },
          '/uploads': {
            target: 'http://localhost/linknest',
            changeOrigin: true,
            secure: false
          },
          '/linknest/uploads': {
            target: 'http://localhost',
            changeOrigin: true,
            secure: false
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.NODE_ENV': JSON.stringify(mode),
        'import.meta.env.VITE_API_BASE': JSON.stringify(apiBase)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
