/** Build a summarize prompt from selected or full text. */
export function buildCopilotSummarizePrompt(body: string): string {
  const trimmed = body.trim();
  return `Please summarize the following text clearly and concisely:\n\n${trimmed}`;
}

/**
 * Encoded `q` budget for Bing/Copilot deep links.
 * Longer values are often truncated or rejected by browsers/proxies.
 */
const MAX_ENCODED_Q_LEN = 1800;

function fitPromptForUrl(prompt: string): { q: string; truncated: boolean } {
  if (encodeURIComponent(prompt).length <= MAX_ENCODED_Q_LEN) {
    return { q: prompt, truncated: false };
  }

  const suffix =
    '\n\n[Text truncated for browser URL length. Full text is on your clipboard if you need it.]';
  let body = prompt;
  let q = body + suffix;
  while (encodeURIComponent(q).length > MAX_ENCODED_Q_LEN && body.length > 80) {
    body = body.slice(0, Math.floor(body.length * 0.85)).trimEnd();
    q = `${body}${suffix}`;
  }
  return { q, truncated: true };
}

/**
 * Open Microsoft Copilot (via Bing chat) with the summarize prompt prefilled and auto-sent.
 * Uses showconv=1&sendquery=1 so the user does not need to paste.
 * Full prompt is also copied as a fallback when the text is too long for the URL.
 *
 * Note: copilot.microsoft.com no longer injects ?q= into the chat box (Microsoft security change).
 */
export async function openCopilotSummarize(
  body: string
): Promise<'ok' | 'empty' | 'truncated' | 'clipboard_failed'> {
  const trimmed = body.trim();
  if (!trimmed) return 'empty';

  const prompt = buildCopilotSummarizePrompt(trimmed);
  const { q, truncated } = fitPromptForUrl(prompt);

  let clipboardOk = false;
  try {
    await navigator.clipboard.writeText(prompt);
    clipboardOk = true;
  } catch {
    clipboardOk = false;
  }

  const url = `https://www.bing.com/search?showconv=1&sendquery=1&q=${encodeURIComponent(q)}`;
  window.open(url, '_blank', 'noopener,noreferrer');

  if (truncated) return 'truncated';
  if (!clipboardOk) return 'clipboard_failed';
  return 'ok';
}
