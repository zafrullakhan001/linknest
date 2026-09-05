import path from 'path';
import http from 'node:http';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { phpDevServerPlugin } from './scripts/vite-php-dev-plugin.mjs';
import {
  LINKNEST_CHUNK_SIZE_WARNING_LIMIT_KB,
  linknestBuildLogger,
  linknestRollupOnWarn,
} from './scripts/vite-build-shared';

/** Never proxy Vite source modules (the `/s` short-link prefix used to swallow `/services/*.ts`). */
function bypassViteModules(req: { url?: string }): string | undefined {
  const pathname = (req.url || '').split('?')[0];
  if (/\.(tsx?|jsx?|mjs|cjs|css|map)$/i.test(pathname)) return pathname;
  if (
    pathname.includes('/@vite/') ||
    pathname.includes('/@react-refresh') ||
    pathname.includes('/node_modules/') ||
    pathname.includes('/services/')
  ) {
    return pathname;
  }
}

function shortUrlProxy(target: string, secure: boolean, stripPrefix = ''): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure,
    cookiePathRewrite: '/',
    bypass: bypassViteModules,
    rewrite: (reqPath) => {
      const stripped = stripPrefix ? reqPath.replace(new RegExp(`^${stripPrefix}`), '') : reqPath;
      const code = stripped.replace(/^\/s\/?/, '').split('/')[0];
      return `/s.php?code=${encodeURIComponent(code)}`;
    }
  };
}

function httpReachable(url: string, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      const code = res.statusCode || 0;
      resolve(code > 0 && code < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export default defineConfig(async ({ mode, command }) => {
  const isProduction = mode === 'production';
  const isDevServe = command === 'serve';

  // Production XAMPP .env often has VITE_BASE_PATH=/linknest. That must not hijack
  // `npm run dev` — Vite should be http://localhost:3000/ with /api → PHP :8000.
  // Opt in to a subpath in dev with VITE_DEV_BASE_PATH=/linknest.
  if (isDevServe && process.env.VITE_DEV_KEEP_BASE !== '1') {
    process.env.VITE_BASE_PATH = process.env.VITE_DEV_BASE_PATH || '';
    process.env.VITE_API_BASE = process.env.VITE_DEV_API_BASE || '/api';
  }

  const env = loadEnv(mode, '.', '');

  // Make base path configurable via environment variable.
  // Use "./" | "relative" | "auto" | "portable" for one dist that works under
  // /ArchLinks, /ERP3, /linknest, or any other subfolder (hash-routed SPA).
  // Production default is relative so `npm run build` works on XAMPP subfolders
  // (absolute "/assets/..." 404s when the app is served from /linknest/).
  // Dev keeps "/" so the Vite server and API proxy stay on localhost:3000.
  const rawBase = String(env.VITE_BASE_PATH || (isProduction ? './' : '')).trim();
  const isRelativeBase =
    rawBase === './' ||
    rawBase === '.' ||
    /^(relative|auto|portable)$/i.test(rawBase);

  let basePath = '';
  let base = '/';
  if (isRelativeBase) {
    basePath = './';
    base = './';
  } else if (rawBase && rawBase !== '/') {
    basePath = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
    base = basePath.endsWith('/') ? basePath : basePath + '/';
  }

  // Absolute installs bake /Folder/api; portable uses ./api (rewritten at runtime to
  // /ArchLinks/api or /ERP3/api from the browser path — see resolveApiBase).
  const apiBase = isRelativeBase
    ? './api'
    : basePath
      ? `${basePath}/api`
      : '/api';

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
  const phpPort = Number(env.LINKNEST_PHP_PORT || 8000);
  const installFolder = path.basename(__dirname);
  const apacheOrigin = `http://127.0.0.1/${installFolder}`;

  // PHP's built-in server truncates the ~240KB tiles JSON through Vite's proxy
  // (ECONNRESET / unterminated JSON). Prefer Apache when this XAMPP folder is up.
  let useApache = false;
  if (isDevServe && !env.LINKNEST_DEV_PROXY_TARGET) {
    useApache = await httpReachable(`${apacheOrigin}/api/index.php?path=/settings`);
    console.log(`[linknest] API proxy → ${useApache ? apacheOrigin + ' (Apache)' : 'http://127.0.0.1:' + phpPort + ' (php -S)'}`);
  }

  const portSuffix = (port === '80' && protocol === 'http') || (port === '443' && protocol === 'https')
    ? ''
    : `:${port}`;
  const proxyTarget = isDevServe
    ? (env.LINKNEST_DEV_PROXY_TARGET || (useApache ? apacheOrigin : `http://127.0.0.1:${phpPort}`))
    : `${protocol}://${host}${portSuffix}${basePath}`;
  const proxySecure = !isDevServe && protocol === 'https';
  const proxyCookies: Pick<ProxyOptions, 'cookiePathRewrite'> = { cookiePathRewrite: '/' };

  return {
    base: base,
    customLogger: linknestBuildLogger(),
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      minify: 'esbuild',
      cssCodeSplit: false, // Disable CSS code splitting to avoid HTML proxy plugin issues with base paths
      chunkSizeWarningLimit: LINKNEST_CHUNK_SIZE_WARNING_LIMIT_KB,
      target: 'esnext',
      // Workaround for Vite 6.x HTML proxy plugin issue with base paths
      cssMinify: 'esbuild',
      // Disable asset inlining to avoid HTML proxy plugin issues with base paths
      assetsInlineLimit: 0,
      modulePreload: {
        polyfill: true,
        resolveDependencies: (filename, deps) => {
          // Preload critical chunks for the home grid
          if (filename.includes('index')) {
            return deps.filter(dep =>
              dep.includes('react-vendor') ||
              dep.includes('vendor') ||
              dep.includes('index') ||
              dep.includes('tile-grid')
            );
          }
          return deps;
        }
      },
      rollupOptions: {
        onwarn: linknestRollupOnWarn,
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
              if (id.includes('@mediapipe')) {
                return 'mediapipe-vendor';
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
              // Keep SSH/VNC/QR libraries with their lazy widgets — not the home-page vendor chunk
              if (
                id.includes('@xterm') ||
                id.includes('@novnc') ||
                id.includes('qrcode.react') ||
                id.includes('qrcode')
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
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: proxySecure,
          ...proxyCookies,
          bypass: bypassViteModules,
          rewrite: (reqPath) => {
            const qIndex = reqPath.indexOf('?');
            const pathname = qIndex >= 0 ? reqPath.slice(0, qIndex) : reqPath;
            const search = qIndex >= 0 ? reqPath.slice(qIndex + 1) : '';
            const apiPath = pathname.replace(/^\/api/, '');
            return `/api/index.php?path=${encodeURIComponent(apiPath)}${search ? `&${search}` : ''}`;
          }
        },
        ...(basePath && !basePath.startsWith('.') ? {
          [`${basePath}/api`]: {
            target: proxyTarget,
            changeOrigin: true,
            secure: proxySecure,
            ...proxyCookies,
            bypass: bypassViteModules,
            rewrite: (reqPath) => {
              const qIndex = reqPath.indexOf('?');
              const pathname = qIndex >= 0 ? reqPath.slice(0, qIndex) : reqPath;
              const search = qIndex >= 0 ? reqPath.slice(qIndex + 1) : '';
              const apiPath = pathname.replace(new RegExp(`^${basePath}/api`), '');
              const normalizedPath = apiPath.startsWith('/') ? apiPath : '/' + apiPath;
              return `/api/index.php?path=${encodeURIComponent(normalizedPath)}${search ? `&${search}` : ''}`;
            }
          }
        } : {}),
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
          secure: proxySecure,
          ...proxyCookies,
          bypass: bypassViteModules,
        },
        // Trailing slash is required: `/s` is a prefix of `/services` and 404'd every API module.
        '/s/': shortUrlProxy(proxyTarget, proxySecure),
        ...(basePath && !basePath.startsWith('.') ? {
          [`${basePath}/s/`]: shortUrlProxy(proxyTarget, proxySecure, basePath),
          [`${basePath}/uploads`]: {
            target: proxyTarget,
            changeOrigin: true,
            secure: proxySecure,
            ...proxyCookies,
            bypass: bypassViteModules,
            rewrite: (reqPath) => reqPath.replace(new RegExp(`^${basePath}`), ''),
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
      exclude: ['@google/genai', '@mediapipe/tasks-vision', '@novnc/novnc'],
      esbuildOptions: {
        target: 'esnext'
      }
    },
    plugins: [
      phpDevServerPlugin({ port: phpPort, disabled: useApache, proxyLabel: proxyTarget }),
      {
        name: 'linknest-dev-paths',
        apply: 'serve',
        configureServer(server) {
          const reserved = new Set([
            'api', 'uploads', 'src', 'components', 'services', 'contexts', 'hooks',
            'utils', 'public', 'node_modules', 'assets', 'tinymce', 'vendor', 'dist',
            '@vite', '@react-refresh', '@id', '@fs'
          ]);
          server.middlewares.use((req, res, next) => {
            const raw = req.url || '';
            const q = raw.indexOf('?');
            const pathname = q >= 0 ? raw.slice(0, q) : raw;
            const search = q >= 0 ? raw.slice(q) : '';

            if (pathname === '/linknest' || pathname === '/linknest/') {
              res.statusCode = 302;
              res.setHeader('Location', '/');
              res.end();
              return;
            }

            // DB/settings store /linknest/uploads/... from XAMPP. Vite is at / so
            // those URLs used to return index.html and show as broken images.
            const m = pathname.match(/^\/([^/]+)\/(uploads\/.+)$/);
            if (m && !reserved.has(m[1].toLowerCase())) {
              req.url = '/' + m[2] + search;
            }
            next();
          });
        }
      },
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
