/** Build a paste-ready Copilot summarize prompt from selected or full text. */
export function buildCopilotSummarizePrompt(body: string): string {
  const trimmed = body.trim();
  return `Please summarize the following text clearly and concisely:\n\n${trimmed}`;
}

/**
 * Copy text for summarization and open Microsoft Copilot.
 * Pages cannot open the Edge Copilot sidebar via API; clipboard + Copilot web is the reliable path.
 */
export async function openCopilotSummarize(body: string): Promise<'ok' | 'empty' | 'clipboard_failed'> {
  const trimmed = body.trim();
  if (!trimmed) return 'empty';

  const prompt = buildCopilotSummarizePrompt(trimmed);
  let clipboardOk = false;
  try {
    await navigator.clipboard.writeText(prompt);
    clipboardOk = true;
  } catch {
    clipboardOk = false;
  }

  window.open('https://copilot.microsoft.com/', '_blank', 'noopener,noreferrer');
  return clipboardOk ? 'ok' : 'clipboard_failed';
}
