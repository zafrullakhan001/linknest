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
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
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
