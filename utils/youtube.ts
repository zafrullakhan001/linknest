/** Extract a YouTube video id from common watch / share / embed / shorts URLs. */
export function parseYouTubeVideoId(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  // Bare 11-char id
  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] || '';
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;

    const parts = url.pathname.split('/').filter(Boolean);
    // /embed/ID, /shorts/ID, /live/ID, /v/ID
    if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
      const id = parts[1];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
  }

  return null;
}

export function isYouTubeUrl(input: string): boolean {
  return parseYouTubeVideoId(input) !== null;
}

export function toYouTubeEmbedUrl(input: string, opts?: { autoplay?: boolean }): string | null {
  const id = parseYouTubeVideoId(input);
  if (!id) return null;
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (opts?.autoplay) params.set('autoplay', '1');
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function toYouTubeWatchUrl(input: string): string | null {
  const id = parseYouTubeVideoId(input);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function toYouTubeThumbnailUrl(input: string): string | null {
  const id = parseYouTubeVideoId(input);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
