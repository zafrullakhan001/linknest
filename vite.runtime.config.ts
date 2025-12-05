import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    return {
      base: './', // Use relative paths for runtime deployment (works from any path)
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true,
        sourcemap: false,
        minify: 'esbuild',
        cssCodeSplit: true,
        chunkSizeWarningLimit: 1000,
        target: 'esnext',
        modulePreload: {
          polyfill: true,
          resolveDependencies: (filename, deps) => {
            // Preload critical chunks
            if (filename.includes('index')) {
              return deps.filter(dep => 
                dep.includes('react-vendor') || 
                dep.includes('vendor') ||
                dep.includes('index')
              );
            }
            return deps;
          }
        },
        rollupOptions: {
          output: {
            // Optimize chunk names for better caching
            chunkFileNames: (chunkInfo) => {
              const facadeModuleId = chunkInfo.facadeModuleId 
                ? chunkInfo.facadeModuleId.split('/').pop() 
                : 'chunk';
              return `assets/js/[name]-[hash].js`;
            },
            entryFileNames: 'assets/js/[name]-[hash].js',
            assetFileNames: (assetInfo) => {
              const info = assetInfo.name.split('.');
              const ext = info[info.length - 1];
              if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
                return `assets/img/[name]-[hash][extname]`;
              }
              if (/woff2?|eot|ttf|otf/i.test(ext)) {
                return `assets/fonts/[name]-[hash][extname]`;
              }
              return `assets/[name]-[hash][extname]`;
            },
            manualChunks: (id) => {
              // Split node_modules into separate chunks
              if (id.includes('node_modules')) {
                // React and React DOM (most critical, load first)
                if (id.includes('react') || id.includes('react-dom')) {
                  return 'react-vendor';
                }
                // DnD Kit libraries (only needed for drag and drop)
                if (id.includes('@dnd-kit')) {
                  return 'dnd-vendor';
                }
                // Google GenAI (large, lazy load when needed)
                if (id.includes('@google/genai') || id.includes('google')) {
                  return 'genai-vendor';
                }
                // UUID (small utility)
                if (id.includes('uuid')) {
                  return 'utils-vendor';
                }
                // Other vendor libraries
                return 'vendor';
              }
              // Split large components into separate chunks
              if (id.includes('components')) {
                if (id.includes('TileGrid')) {
                  return 'tile-grid';
                }
                if (id.includes('TileDetail')) {
                  return 'tile-detail';
                }
                if (id.includes('StyleManager')) {
                  return 'style-manager';
                }
                if (id.includes('AdminPanel')) {
                  return 'admin-panel';
                }
              }
            }
          }
        },
        // Optimize build performance
        reportCompressedSize: false // Faster builds
      },
      plugins: [
        react({
          // Optimize JSX runtime
          jsxRuntime: 'automatic',
          // Fast Refresh is enabled by default in dev mode for React 19
        })
      ],
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

















































