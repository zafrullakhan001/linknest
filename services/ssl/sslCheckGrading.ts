/** Letter grade and SSL Labs–style category scoring for SSL URL checker */

export type SslLabsCategory = 'certificate' | 'protocol_support' | 'key_exchange' | 'cipher_strength';

/** @deprecated Use SslLabsCategory */
export type ScoreCategory = SslLabsCategory | 'headers' | 'dns_http' | 'protocol';

export type LetterGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

export type CategoryScore = {
  id: SslLabsCategory;
  label: string;
  score: number;
  max: number;
};

export type GradeNotice = {
  severity: 'info' | 'warn' | 'cap';
  message: string;
};

export type GradeResult = {
  letter: LetterGrade;
  numeric: number;
  categories: CategoryScore[];
  /** Letter after SSL Labs–style caps (TLS 1.0/1.1, etc.) */
  cappedLetter: LetterGrade;
  notices: GradeNotice[];
};

const SSL_LABS_LABELS: Record<SslLabsCategory, string> = {
  certificate: 'Certificate',
  protocol_support: 'Protocol Support',
  key_exchange: 'Key Exchange',
  cipher_strength: 'Cipher Strength',
};

const GRADE_ORDER: LetterGrade[] = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];

/** Map 0–100 numeric score to letter grade (SSL Labs–style bands). */
export function scoreToLetterGrade(score: number): LetterGrade {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 98) return 'A+';
  if (s >= 93) return 'A';
  if (s >= 90) return 'A-';
  if (s >= 87) return 'B+';
  if (s >= 83) return 'B';
  if (s >= 80) return 'B-';
  if (s >= 77) return 'C+';
  if (s >= 73) return 'C';
  if (s >= 70) return 'C-';
  if (s >= 60) return 'D';
  return 'F';
}

export function minLetterGrade(a: LetterGrade, b: LetterGrade): LetterGrade {
  const ia = GRADE_ORDER.indexOf(a);
  const ib = GRADE_ORDER.indexOf(b);
  if (ia < 0 || ib < 0) return a;
  return GRADE_ORDER[Math.min(ia, ib)];
}

export type FindingForCategory = {
  label: string;
  severity: 'info' | 'warn' | 'bad';
  scoreDelta: number;
};

export type SslLabsGradeInput = {
  findings: FindingForCategory[];
  protocol?: string | null;
  cipher?: string | null;
  cert_meta?: {
    key_type?: string | null;
    key_bits?: number | null;
    signature_algorithm?: string | null;
  } | null;
  deep_tls?: {
    rows: { version: string; supported: boolean }[];
  } | null;
  chain_browser_valid?: boolean | null;
  tls_report_weak?: boolean;
};

export function categoryForLabel(label: string): SslLabsCategory | 'other' {
  const l = label.toLowerCase();
  if (
    l.includes('expired') ||
    l.includes('expiring') ||
    l.includes('renew') ||
    l.includes('hostname') ||
    l.includes('chain') ||
    l.includes('intermediate') ||
    l.includes('trusted') ||
    l.includes('trust store') ||
    l.includes('signature') ||
    l.includes('leaf ca') ||
    l.includes('dane') ||
    l.includes('caa') ||
    l.includes('sct')
  ) {
    return 'certificate';
  }
  if (
    l.includes('protocol') ||
    l.includes('deep tls') ||
    l.includes('old protocol') ||
    l.includes('tls 1.3') ||
    l.includes('tls 1.2')
  ) {
    return 'protocol_support';
  }
  if (l.includes('key size') || l.includes('weak key')) {
    return 'key_exchange';
  }
  if (l.includes('cipher') || l.includes('tls suite')) {
    return 'cipher_strength';
  }
  if (l.includes('ocsp')) {
    return 'protocol_support';
  }
  return 'other';
}

function scoreProtocolSupport(protocol?: string | null, deepTls?: SslLabsGradeInput['deep_tls']): number {
  let score = 90;
  const p = protocol ?? '';
  if (p.includes('1.3')) score = 100;
  else if (p.includes('1.2')) score = 95;
  else if (p.includes('1.1')) score = 70;
  else if (p.includes('1.0') || (p.includes('TLSv1') && !p.includes('1.'))) score = 50;

  const rows = deepTls?.rows ?? [];
  const tls10 = rows.find((r) => r.version === 'TLSv1' && r.supported);
  const tls11 = rows.find((r) => r.version === 'TLSv1.1' && r.supported);
  const tls13 = rows.find((r) => r.version === 'TLSv1.3' && r.supported);
  if (tls13?.supported) score = Math.max(score, 100);
  if (tls10?.supported) score = Math.min(score, 50);
  if (tls11?.supported) score = Math.min(score, 70);
  if (!tls10?.supported && !tls11?.supported && rows.length > 0) score = Math.max(score, 90);
  return score;
}

function scoreKeyExchange(
  cipher?: string | null,
  certMeta?: SslLabsGradeInput['cert_meta']
): number {
  let score = 90;
  const c = (cipher ?? '').toLowerCase();
  if (/ecdhe|dhe/.test(c)) score = Math.max(score, 95);
  else if (/rsa/.test(c) && !/ecdhe|dhe/.test(c)) score = 75;

  const bits = certMeta?.key_bits ?? 0;
  const kt = (certMeta?.key_type ?? '').toLowerCase();
  if (kt.includes('rsa')) {
    if (bits >= 4096) score = Math.max(score, 100);
    else if (bits >= 2048) score = Math.max(score, 90);
    else if (bits > 0 && bits < 2048) score = Math.min(score, 40);
  } else if (kt.includes('ec') || kt.includes('ecdsa')) {
    if (bits >= 256) score = Math.max(score, 95);
    else if (bits > 0) score = Math.min(score, 60);
  }
  return score;
}

function scoreCipherStrength(cipher?: string | null, tlsWeak?: boolean): number {
  if (tlsWeak) return 40;
  const c = (cipher ?? '').toLowerCase();
  if (!c) return 80;
  if (/null|anon|export|rc4|md5/.test(c)) return 0;
  if (/\bdes\b|3des/.test(c)) return 30;
  if (/gcm|poly1305|chacha/.test(c)) return 100;
  if (/cbc/.test(c)) return 70;
  return 85;
}

function scoreCertificate(findings: FindingForCategory[], browserValid?: boolean | null): number {
  let score = 100;
  for (const f of findings) {
    if (categoryForLabel(f.label) !== 'certificate') continue;
    score = Math.max(0, score + f.scoreDelta);
  }
  if (browserValid === false) score = Math.min(score, 40);
  if (browserValid === true) score = Math.max(score, 85);
  return score;
}

function applyGradeCaps(
  letter: LetterGrade,
  input: SslLabsGradeInput
): { letter: LetterGrade; notices: GradeNotice[] } {
  const notices: GradeNotice[] = [];
  let cap: LetterGrade | null = null;

  const rows = input.deep_tls?.rows ?? [];
  const legacyEnabled = rows.some(
    (r) => (r.version === 'TLSv1' || r.version === 'TLSv1.1') && r.supported
  );
  if (legacyEnabled) {
    notices.push({
      severity: 'cap',
      message: 'This server supports TLS 1.0 and/or TLS 1.1. Grade capped to B.',
    });
    cap = 'B';
  }

  const p = input.protocol ?? '';
  if (
    p &&
    ((p.includes('TLSv1.1') || p.includes('TLS 1.1')) ||
      (p.includes('TLSv1') && !p.includes('1.2') && !p.includes('1.3')))
  ) {
    notices.push({
      severity: 'cap',
      message: 'Negotiated protocol is TLS 1.0 or 1.1. Grade capped to B.',
    });
    cap = cap ? minLetterGrade(cap, 'B') : 'B';
  }

  if (input.tls_report_weak) {
    notices.push({
      severity: 'warn',
      message: 'Weak or legacy cipher/protocol indicators detected.',
    });
    cap = cap ? minLetterGrade(cap, 'B-') : 'B-';
  }

  const final = cap ? minLetterGrade(letter, cap) : letter;
  return { letter: final, notices };
}

/** Build SSL Labs–style four-category scores and capped grade. */
export function buildSslLabsGradeResult(input: SslLabsGradeInput): GradeResult {
  const buckets: Record<SslLabsCategory, number> = {
    certificate: scoreCertificate(input.findings, input.chain_browser_valid),
    protocol_support: scoreProtocolSupport(input.protocol, input.deep_tls),
    key_exchange: scoreKeyExchange(input.cipher, input.cert_meta),
    cipher_strength: scoreCipherStrength(input.cipher, input.tls_report_weak),
  };

  for (const f of input.findings) {
    const cat = categoryForLabel(f.label);
    if (cat === 'other' || cat === 'certificate') continue;
    buckets[cat] = Math.max(0, buckets[cat] + f.scoreDelta);
  }

  const categories: CategoryScore[] = (Object.keys(buckets) as SslLabsCategory[]).map((id) => ({
    id,
    label: SSL_LABS_LABELS[id],
    score: Math.round(buckets[id]),
    max: 100,
  }));

  const numeric = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);
  const rawLetter = scoreToLetterGrade(numeric);
  const { letter: cappedLetter, notices } = applyGradeCaps(rawLetter, input);

  return {
    letter: cappedLetter,
    numeric,
    categories,
    cappedLetter,
    notices,
  };
}

/** @deprecated Use buildSslLabsGradeResult */
export function buildCategoryScores(findings: FindingForCategory[]): CategoryScore[] {
  return buildSslLabsGradeResult({ findings }).categories;
}

/** @deprecated Use buildSslLabsGradeResult */
export function buildGradeResult(overallScore: number, findings: FindingForCategory[]): GradeResult {
  return buildSslLabsGradeResult({ findings });
}

export const GRADE_LEGEND: { range: string; grades: string; desc: string }[] = [
  { range: '98–100', grades: 'A+', desc: 'Exceptional' },
  { range: '90–97', grades: 'A / A−', desc: 'Strong configuration' },
  { range: '80–89', grades: 'B+ / B / B−', desc: 'Good with minor issues' },
  { range: '70–79', grades: 'C+ / C / C−', desc: 'Notable weaknesses' },
  { range: '60–69', grades: 'D', desc: 'Serious problems' },
  { range: '0–59', grades: 'F', desc: 'Critical failures' },
];

export const SCORE_RULES_TEXT =
  'Overall score and letter grade use the average of four SSL Labs–style categories (Certificate, Protocol Support, Key Exchange, Cipher Strength), then letter caps when TLS 1.0/1.1 is enabled (max B). The findings list below adds detail; penalties apply inside the matching category, not as a separate total.';

export function gradeColorClass(letter: LetterGrade): string {
  if (letter.startsWith('A')) return 'bg-emerald-500 text-white';
  if (letter.startsWith('B')) return 'bg-amber-400 text-amber-950';
  if (letter.startsWith('C')) return 'bg-orange-500 text-white';
  if (letter === 'D') return 'bg-rose-500 text-white';
  return 'bg-red-700 text-white';
}

export function categoryLabelForFinding(label: string): string {
  const cat = categoryForLabel(label);
  return cat === 'other' ? 'Other (detail only)' : SSL_LABS_LABELS[cat];
}

export function gradeBarColor(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 80) return 'bg-amber-400';
  if (score >= 70) return 'bg-orange-500';
  return 'bg-rose-500';
}
