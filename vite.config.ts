import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProduction = mode === 'production';

  // Make base path configurable via environment variable
  // Default to empty string (root) if not set, or use VITE_BASE_PATH
  const basePath = env.VITE_BASE_PATH || '';
  const base = basePath ? (basePath.endsWith('/') ? basePath : basePath + '/') : '/';
  const apiBase = basePath ? `${basePath}/api` : '/api';

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
  const proxyTarget = `${protocol}://${host}${portSuffix}${basePath}`;

  return {
    base: base,
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'esbuild',
      cssCodeSplit: false, // Disable CSS code splitting to avoid HTML proxy plugin issues with base paths
      chunkSizeWarningLimit: 1000,
      target: 'esnext',
      // Workaround for Vite 6.x HTML proxy plugin issue with base paths
      cssMinify: 'esbuild',
      // Disable asset inlining to avoid HTML proxy plugin issues with base paths
      assetsInlineLimit: 0,
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
              // Leave Recharts/D3 out of the shared vendor chunk. Forcing
              // recharts+d3+victory into charts-vendor caused circular TDZ errors
              // ("Cannot access 'T' before initialization"). Returning nothing
              // lets Rollup attach them to the lazy monitoring dashboard chunks.
              if (
                id.includes('recharts') ||
                id.includes('victory-vendor') ||
                id.includes('d3-') ||
                id.includes('/d3/') ||
                id.includes('\\d3\\') ||
                id.includes('internmap') ||
                id.includes('delaunator') ||
                id.includes('robust-predicates')
              ) {
                return;
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
      // Optimize HMR for Fast Refresh
      hmr: {
        overlay: true,
        // When server host is 0.0.0.0, ensure HMR connects to localhost
        // This is critical for Fast Refresh to work in dev mode
        host: mode === 'development' ? 'localhost' : undefined,
        port: 3000
      },
      // Ensure proper WebSocket connection for HMR
      watch: {
        usePolling: false,
        interval: 100
      },
      proxy: {
        // Proxy /api requests (for root deployment or when basePath is empty)
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: protocol === 'https', // Enable SSL verification for HTTPS
          rewrite: (path) => {
            // Extract the API path (e.g., /tiles, /auth/me)
            const apiPath = path.replace(/^\/api/, '');
            // Route to index.php with path as query parameter
            // In dev mode, proxyTarget already includes basePath, so we use relative path
            return `/api/index.php?path=${encodeURIComponent(apiPath)}`;
          }
        },
        // Proxy basePath/api requests (when basePath is set, e.g., /linknest/api)
        ...(basePath ? {
          [`${basePath}/api`]: {
            target: proxyTarget,
            changeOrigin: true,
            secure: protocol === 'https',
            rewrite: (path) => {
              // Remove basePath prefix to get the API path (e.g., /linknest/api/settings -> /settings)
              const apiPath = path.replace(new RegExp(`^${basePath}/api`), '');
              // Ensure it starts with / for the query parameter
              const normalizedPath = apiPath.startsWith('/') ? apiPath : '/' + apiPath;
              return `/api/index.php?path=${encodeURIComponent(normalizedPath)}`;
            }
          }
        } : {}),
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
          secure: protocol === 'https',
          rewrite: (path) => {
            // Remove /uploads prefix and return just the path for the backend
            // Backend expects /uploads/filename
            return path;
          }
        },
        // Proxy basePath/uploads requests (when basePath is set)
        ...(basePath ? {
          [`${basePath}/uploads`]: {
            target: proxyTarget,
            changeOrigin: true,
            secure: protocol === 'https',
            rewrite: (path) => {
              // Remove basePath prefix to get /uploads/filename
              // e.g., /linknest/uploads/logo.jpg -> /uploads/logo.jpg
              return path.replace(new RegExp(`^${basePath}`), '');
            }
          }
        } : {})
      }
    },
    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'recharts'
      ],
      exclude: ['@google/genai'] // Exclude large library, load on demand
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
