export function hidePaperclipIngUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return parsed.hostname === "paperclip.ing" || parsed.hostname.endsWith(".paperclip.ing")
      ? null
      : trimmed;
  } catch {
    return trimmed.includes("paperclip.ing") ? null : trimmed;
  }
}
