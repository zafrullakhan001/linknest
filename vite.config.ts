import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProduction = mode === 'production';
    const base = isProduction ? '/linknest/' : '/';
    const apiBase = isProduction ? '/linknest/api' : '/api';
    
    /**
     * HTTPS Support Configuration
     * 
     * To enable HTTPS in production, create a .env file with:
     * VITE_PROTOCOL=https
     * VITE_HOST=your-domain.com
     * VITE_PORT=443 (optional, defaults to 443 for HTTPS)
     * 
     * For development with HTTPS:
     * VITE_PROTOCOL=https
     * VITE_HOST=localhost
     * VITE_PORT=8443 (or your HTTPS port)
     * 
     * The application uses relative URLs for API calls, so it automatically
     * works with both HTTP and HTTPS without code changes.
     */
    const protocol = env.VITE_PROTOCOL || (isProduction ? 'https' : 'http');
    const host = env.VITE_HOST || 'localhost';
    const port = env.VITE_PORT || (protocol === 'https' ? '443' : '80');
    
    // Build proxy target URL - supports both HTTP and HTTPS
    const portSuffix = (port === '80' && protocol === 'http') || (port === '443' && protocol === 'https') 
      ? '' 
      : `:${port}`;
    const proxyTarget = `${protocol}://${host}${portSuffix}/linknest`;
    
    return {
      base: base,
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
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Optimize HMR
        hmr: {
          overlay: true
        },
        proxy: {
          '/api': {
            target: proxyTarget,
            changeOrigin: true,
            secure: protocol === 'https', // Enable SSL verification for HTTPS
            rewrite: (path) => {
              // Extract the API path (e.g., /tiles, /auth/me)
              const apiPath = path.replace(/^\/api/, '');
              // Route to index.php with path as query parameter
              return `/api/index.php?path=${encodeURIComponent(apiPath)}`;
            }
          },
          '/uploads': {
            target: proxyTarget,
            changeOrigin: true,
            secure: protocol === 'https'
          },
          '/linknest/uploads': {
            target: `${protocol}://${host}${portSuffix}`,
            changeOrigin: true,
            secure: protocol === 'https'
          }
        }
      },
      // Optimize dependencies
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react/jsx-runtime'
        ],
        exclude: ['@google/genai'] // Exclude large library, load on demand
      },
      plugins: [
        react({
          // Optimize JSX runtime
          jsxRuntime: 'automatic'
        })
      ],
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
