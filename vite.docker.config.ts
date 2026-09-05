import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {
  LINKNEST_CHUNK_SIZE_WARNING_LIMIT_KB,
  linknestBuildLogger,
  linknestRollupOnWarn,
} from './scripts/vite-build-shared';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    return {
      base: '/', // Docker uses root path
      customLogger: linknestBuildLogger(),
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true,
        sourcemap: false,
        minify: 'esbuild',
        chunkSizeWarningLimit: LINKNEST_CHUNK_SIZE_WARNING_LIMIT_KB,
        // Required for @novnc/novnc (top-level await in RFB / WebCodecs probe)
        target: 'esnext',
        rollupOptions: {
          onwarn: linknestRollupOnWarn,
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
            }
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.NODE_ENV': JSON.stringify('production'),
        'import.meta.env.VITE_API_BASE': JSON.stringify('/api')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

