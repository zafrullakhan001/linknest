/**
 * Link URL diagnostics — explain what is wrong with a typed URL and how to fix it.
 *
 * This is not a full RFC 3986 parser. Browsers quietly rewrite many typos
 * (https:/host → https://host). LinkNest does not, and relative hrefs like
 * wd12.example.com/path will not open the site you meant.
 *
 * Checks run in layers:
 *  1. Empty / still-typing → no issues
 *  2. Copy/paste junk (wrappers, spaces, backslashes, invisible chars)
 *  3. Scheme grammar (typos, missing colon, one vs two vs three slashes)
 *  4. Missing scheme on a domain-like value
 *  5. Host / port once a URL can be parsed
 */

export type UrlIssueSeverity = 'error' | 'warning';

export type UrlIssue = {
  id: string;
  severity: UrlIssueSeverity;
  title: string;
  detail: string;
  fix: string;
  found?: string;
  expected?: string;
};

export type UrlDiagnosis = {
  trimmed: string;
  ok: boolean;
  issues: UrlIssue[];
  suggestedUrl: string | null;
};

const LINK_SCHEMES = new Set([
  'http',
  'https',
  'ssh',
  'vnc',
  'auto',
  'auto-vnc',
  'mailto',
  'tel',
  'ftp',
  'sftp',
  'file',
  'rdp',
  'ws',
  'wss'
]);

const WEB_SCHEMES = new Set(['http', 'https']);

const SCHEME_TYPOS: Record<string, string> = {
  htp: 'http',
  htt: 'http',
  hhtp: 'http',
  htttp: 'http',
  ttp: 'http',
  htps: 'https',
  htts: 'https',
  htpps: 'https',
  httpss: 'https',
  htttps: 'https',
  hhtps: 'https',
  ttpps: 'https',
  ttps: 'https',
  shttps: 'https',
  httpshttp: 'https',
  hypertext: 'https'
};

const INVISIBLE_RE = /[\u0000-\u001F\u007F\u00A0\u1680\u2000-\u200F\u2028-\u202F\u205F\u2060\u3000\uFEFF]/;
const UNICODE_SLASH_RE = /[\u2044\u2215\u29F8\uFF0F]/;
/** Scheme names only (http, auto-vnc). Dots are hostnames, not schemes. */
const SCHEME_TOKEN_RE = /^([a-z][a-z0-9+-]*)(:)?(\/*)/i;

/** True scheme prefix — not a hostname like wd12.example.com/path. */
function matchSchemePrefix(value: string): { typed: string; colon: string; slashes: string; rest: string } | null {
  const m = value.match(SCHEME_TOKEN_RE);
  if (!m) return null;
  const typed = m[1];
  const colon = m[2] || '';
  const slashes = m[3] || '';
  if (!colon && !slashes) return null;
  if (!colon) {
    const typedLower = typed.toLowerCase();
    const known = LINK_SCHEMES.has(typedLower) ? typedLower : closestScheme(typedLower);
    if (!known) return null;
  }
  return {
    typed,
    colon,
    slashes,
    rest: value.slice(m[0].length)
  };
}

function issue(
  id: string,
  title: string,
  detail: string,
  fix: string,
  extra?: Pick<UrlIssue, 'found' | 'expected' | 'severity'>
): UrlIssue {
  return {
    id,
    severity: extra?.severity || 'error',
    title,
    detail,
    fix,
    found: extra?.found,
    expected: extra?.expected
  };
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cur = row[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[n];
}

function closestScheme(raw: string): string | null {
  const key = raw.toLowerCase();
  if (SCHEME_TYPOS[key]) return SCHEME_TYPOS[key];
  let best: string | null = null;
  let bestDist = 3;
  for (const candidate of ['https', 'http', 'ssh', 'vnc']) {
    const d = editDistance(key, candidate);
    if (d > 0 && d < bestDist) {
      best = candidate;
      bestDist = d;
    }
  }
  return best;
}

function looksLikeWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function looksLikeSshBare(value: string): boolean {
  return /^[^\s/@]+@[^\s/@]+:\d+$/.test(value);
}

/** Domain, subdomain, or IPv4 with optional port / path / query / hash. */
function looksLikeBareWebAddress(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (looksLikeWindowsPath(value) || looksLikeSshBare(value)) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?(?:[/?#].*)?$/.test(value)) return true;
  return /^(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d{1,5})?(?:[/?#].*)?$/i.test(
    value
  );
}

function stripWrappers(value: string): { next: string; stripped: boolean; found?: string } {
  let next = value;
  let stripped = false;
  let found: string | undefined;

  const wrapped = next.match(/^<([^<>]+)>$/);
  if (wrapped) {
    next = wrapped[1].trim();
    stripped = true;
    found = `<…>`;
  }

  const quoted = next.match(/^(['"])(.+)\1$/);
  if (quoted) {
    next = quoted[2].trim();
    stripped = true;
    found = quoted[1];
  }

  const markdown = next.match(/^\[[^\]]*]\((https?:\/\/[^)\s]+)\)$/i);
  if (markdown) {
    next = markdown[1].trim();
    stripped = true;
    found = '[text](url)';
  }

  return { next, stripped, found };
}

function diagnoseHostAndPort(parsed: URL): UrlIssue[] {
  const issues: UrlIssue[] = [];
  const host = parsed.hostname || '';

  if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !host) {
    issues.push(
      issue(
        'missing-host',
        'Missing hostname',
        'There is nothing like example.com after the scheme, so this cannot open as a website.',
        'Put the host after two slashes, for example https://example.com/path.',
        { expected: 'https://hostname/…' }
      )
    );
    return issues;
  }

  if (host.includes('..')) {
    issues.push(
      issue(
        'empty-dns-label',
        'Extra dot in hostname',
        `The hostname "${host}" has an empty part (two dots in a row).`,
        'Remove the extra dot, for example example.com not example..com.',
        { found: host }
      )
    );
  } else if (host.startsWith('.')) {
    issues.push(
      issue(
        'hostname-starts-with-dot',
        'Hostname starts with a dot',
        `The hostname "${host}" begins with "." which is not valid.`,
        'Remove the leading dot.',
        { found: host }
      )
    );
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const bad = host.split('.').some((part) => Number(part) > 255);
    if (bad) {
      issues.push(
        issue(
          'invalid-ipv4',
          'Invalid IP address',
          `Each number in an IPv4 address must be 0–255. "${host}" is not a valid address.`,
          'Correct the IP or use a hostname instead.',
          { found: host }
        )
      );
    }
  }

  if (parsed.port) {
    const port = Number(parsed.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      issues.push(
        issue(
          'invalid-port',
          'Invalid port',
          `Port "${parsed.port}" is not allowed. Ports are numbers from 1 to 65535.`,
          'Use a valid port (443 for HTTPS, 80 for HTTP) or omit it.',
          { found: parsed.port, expected: '1–65535' }
        )
      );
    }
  }

  return issues;
}

function mechanicalFix(raw: string): string {
  let s = raw.trim();
  s = stripWrappers(s).next;
  s = s.replace(UNICODE_SLASH_RE, '/');
  s = s.replace(/\\/g, '/');
  s = s.replace(/[,\s]+$/g, '');
  s = s.replace(/^[,\s]+/g, '');

  const dup = s.match(/^(https?:\/\/)https?:\/\//i);
  if (dup) {
    s = s.replace(/^https?:\/\/https?:\/\//i, dup[1].toLowerCase().startsWith('http:') ? 'http://' : 'https://');
  }

  const schemeMatch = matchSchemePrefix(s);
  if (schemeMatch) {
    const { typed, colon, slashes, rest } = schemeMatch;
    const typedLower = typed.toLowerCase();
    const known = LINK_SCHEMES.has(typedLower) ? typedLower : closestScheme(typedLower);
    if (known && (WEB_SCHEMES.has(known) || known === 'ssh' || known === 'vnc' || known === 'auto' || known === 'auto-vnc')) {
      if (!colon || slashes !== '//') {
        s = `${known}://${rest.replace(/^\/+/, '')}`;
      } else if (typedLower !== known) {
        s = `${known}://${rest.replace(/^\/+/, '')}`;
      }
    }
  } else if (looksLikeBareWebAddress(s)) {
    s = `https://${s.replace(/^\/+/, '')}`;
  }

  return s;
}

/**
 * Diagnose a link URL as the user typed it.
 * Empty values have no issues (the field is simply unused yet).
 */
export function diagnoseLinkUrl(url: string, opts?: { suggest?: boolean }): UrlDiagnosis {
  const original = String(url || '');
  const trimmed = original.trim();
  const issues: UrlIssue[] = [];
  const canSuggest = opts?.suggest !== false;

  if (!trimmed) {
    return { trimmed, ok: true, issues: [], suggestedUrl: null };
  }

  // Avoid nagging while the first characters of https:// are being typed.
  if (trimmed.length < 4 && !trimmed.includes('.') && !trimmed.includes('/')) {
    return { trimmed, ok: true, issues: [], suggestedUrl: null };
  }

  if (looksLikeWindowsPath(trimmed)) {
    issues.push(
      issue(
        'windows-path',
        'Windows file path',
        'This looks like a disk path (C:\\…), not a web or ssh URL.',
        'Use a website address such as https://example.com, or ssh://user@host:22 for SSH.'
      )
    );
    if (trimmed.includes('\\')) {
      issues.push(
        issue(
          'backslash',
          'Backslashes instead of slashes',
          'URLs use forward slashes (/). Backslashes (\\) are for Windows folders.',
          'Replace \\ with / — for example https://example.com/path.',
          { found: '\\', expected: '/' }
        )
      );
    }
    return { trimmed, ok: false, issues, suggestedUrl: null };
  }

  if (INVISIBLE_RE.test(trimmed) || UNICODE_SLASH_RE.test(trimmed)) {
    issues.push(
      issue(
        'invisible-or-unicode',
        'Unusual characters',
        'The URL contains an invisible character or a look-alike slash. That often happens when copying from a document.',
        'Delete the address and type or paste it again from the browser address bar.'
      )
    );
  }

  if (/\s/.test(trimmed)) {
    issues.push(
      issue(
        'whitespace',
        'Spaces in the URL',
        'Spaces are not valid in a URL.',
        'Remove the spaces, or encode a space in the path as %20.',
        { found: 'space' }
      )
    );
  }

  if (trimmed.includes('\\')) {
    issues.push(
      issue(
        'backslash',
        'Backslashes instead of slashes',
        'URLs use forward slashes (/). Backslashes (\\) are for Windows folders.',
        'Replace \\ with / — for example https://example.com/path.',
        { found: '\\', expected: '/' }
      )
    );
  }

  const wrapped = stripWrappers(trimmed);
  if (wrapped.stripped) {
    issues.push(
      issue(
        'wrappers',
        'Extra quotes or brackets',
        'The address is wrapped in quotes, <angle brackets>, or markdown link syntax.',
        'Keep only the URL itself, for example https://example.com.',
        { found: wrapped.found }
      )
    );
  }

  const work = wrapped.next;

  if (/^https?:\/\/https?:\/\//i.test(work)) {
    issues.push(
      issue(
        'duplicate-scheme',
        'https:// appears twice',
        'The URL starts with two schemes (https://https://…).',
        'Keep a single https:// at the start.',
        { found: 'https://https://', expected: 'https://' }
      )
    );
  }

  const schemeMatch = matchSchemePrefix(work);
  if (schemeMatch) {
    const { typed, colon, slashes } = schemeMatch;
    const typedLower = typed.toLowerCase();
    const known = LINK_SCHEMES.has(typedLower) ? typedLower : closestScheme(typedLower);

    if (!LINK_SCHEMES.has(typedLower) && known) {
      issues.push(
        issue(
          'scheme-typo',
          'Scheme looks mistyped',
          `"${typed}:" is not a valid URL scheme.`,
          `Did you mean ${known}:// ?`,
          { found: `${typed}${colon}${slashes}`, expected: `${known}://` }
        )
      );
    } else if (!LINK_SCHEMES.has(typedLower) && colon) {
      issues.push(
        issue(
          'unknown-scheme',
          'Unknown URL scheme',
          `"${typed}:" is not a scheme this app uses for links (http, https, ssh, vnc).`,
          'Use https:// for websites, ssh://user@host:22 for SSH, or vnc://host:5900 for VNC.',
          { found: `${typed}:`, severity: 'warning' }
        )
      );
    }

    const slashSchemes = new Set(['http', 'https', 'ssh', 'vnc', 'auto', 'auto-vnc', 'ftp', 'sftp', 'ws', 'wss', 'file', 'rdp']);
    const effective = LINK_SCHEMES.has(typedLower) ? typedLower : known;
    if (effective && slashSchemes.has(effective)) {
      if (!colon && slashes) {
        issues.push(
          issue(
            'missing-colon',
            'Missing colon after the scheme',
            `Found "${typed}${slashes}" — the colon before the slashes is missing.`,
            `Use ${effective}:// (colon, then two slashes).`,
            { found: `${typed}${slashes}`, expected: `${effective}://` }
          )
        );
      } else if (colon && slashes.length === 1) {
        issues.push(
          issue(
            'single-slash',
            'Only one slash after the scheme',
            `Found "${typed}:/" — web URLs need two slashes.`,
            `Change it to ${effective}:// so the host is not treated as a path.`,
            { found: `${typed}:/`, expected: `${effective}://` }
          )
        );
      } else if (colon && slashes.length === 0) {
        issues.push(
          issue(
            'missing-slashes',
            'Missing slashes after the scheme',
            `Found "${typed}:" with no //. The host must follow ${effective}://.`,
            `Use ${effective}://hostname — two slashes after the colon.`,
            { found: `${typed}:`, expected: `${effective}://` }
          )
        );
      } else if (colon && slashes.length > 2) {
        issues.push(
          issue(
            'extra-slashes',
            'Too many slashes after the scheme',
            `Found "${typed}:${slashes}" — the extra slash makes the hostname empty.`,
            `Use exactly two slashes: ${effective}://hostname/path.`,
            { found: `${typed}:${slashes}`, expected: `${effective}://` }
          )
        );
      }
    }
  } else if (looksLikeBareWebAddress(work)) {
    issues.push(
      issue(
        'missing-scheme',
        'Missing http:// or https://',
        'This looks like a website, but it has no scheme. Without https:// the browser may treat it as a relative path, and URL stats will not run.',
        `Add https:// in front: https://${work.replace(/^\/+/, '')}.`,
        { found: work.split('/')[0], expected: `https://${work.replace(/^\/+/, '')}` }
      )
    );
  }

  let parsed: URL | null = null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(work) && !/\s/.test(work)) {
    try {
      parsed = new URL(work);
    } catch {
      issues.push(
        issue(
          'unparsed',
          'Not a valid URL',
          'The address could not be parsed. Check punctuation around the host, port, and path.',
          'Use the form https://hostname/path — hostname, then optional /path.'
        )
      );
    }
  }

  if (parsed) {
    issues.push(...diagnoseHostAndPort(parsed));
  }

  const blocking = issues.filter((item) => item.severity === 'error');
  let suggestedUrl: string | null = null;
  if (canSuggest && blocking.length > 0) {
    const fixed = mechanicalFix(original);
    if (fixed && fixed !== trimmed) {
      const again = diagnoseLinkUrl(fixed, { suggest: false });
      const stillBlocked = again.issues.some((item) => item.severity === 'error');
      if (!stillBlocked) {
        suggestedUrl = fixed;
      }
    }
  }

  return {
    trimmed,
    ok: blocking.length === 0,
    issues,
    suggestedUrl
  };
}

export function hasBlockingUrlIssues(diagnosis: UrlDiagnosis): boolean {
  return diagnosis.issues.some((item) => item.severity === 'error');
}
