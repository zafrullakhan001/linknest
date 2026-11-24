import { createLogger, type Logger } from 'vite';

/** Stale caniuse-lite prints a stderr warning that App Updates has treated as a failed rebuild. */
process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';

const QUIET_WARN_SNIPPETS = [
  "can't be bundled without type=\"module\"",
  'dynamically imported by',
  'Some chunks are larger than',
  'Browserslist: browsers data',
  'update-browserslist-db',
];

export const LINKNEST_CHUNK_SIZE_WARNING_LIMIT_KB = 2500;

function shouldQuiet(msg: string): boolean {
  return QUIET_WARN_SNIPPETS.some((snippet) => msg.includes(snippet));
}

export function linknestBuildLogger(): Logger {
  const logger = createLogger();
  const origWarn = logger.warn.bind(logger);
  const origWarnOnce = logger.warnOnce.bind(logger);
  logger.warn = (msg, opts) => {
    if (shouldQuiet(String(msg))) return;
    origWarn(msg, opts);
  };
  logger.warnOnce = (msg, opts) => {
    if (shouldQuiet(String(msg))) return;
    origWarnOnce(msg, opts);
  };
  return logger;
}

export function linknestRollupOnWarn(
  warning: { message?: string; code?: string },
  warn: (w: { message?: string; code?: string }) => void
): void {
  if (shouldQuiet(String(warning.message || ''))) return;
  warn(warning);
}
