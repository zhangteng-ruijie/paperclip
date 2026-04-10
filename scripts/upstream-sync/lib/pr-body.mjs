function formatConflictLine(diagnostics) {
  const conflictCount = diagnostics?.conflicts?.length ?? 0;
  if (conflictCount === 0) {
    return '- conflicts: none';
  }

  return `- conflicts: ${conflictCount} file(s)`;
}

function formatManualReviewItem(item) {
  if (item.type === 'markdown-review') {
    return `- markdown review: \`${item.path}\` ← \`${item.sourcePath}\` (${item.reason})`;
  }

  if (item.type === 'copy-stale') {
    return `- stale zh-CN key: \`${item.path}\` → \`${item.key}\``;
  }

  if (item.type === 'copy-missing') {
    return `- missing zh-CN key: \`${item.path}\` → \`${item.key}\``;
  }

  if (item.type === 'copy-changed') {
    return `- changed English copy: \`${item.path}\` → \`${item.key}\``;
  }

  return `- review: \`${item.path}\``;
}

export function renderPrBody({
  branchName,
  status,
  upstreamRef,
  maintenanceRef,
  commits = [],
  diagnostics,
  translationSummary = {},
  validationSummary = {},
  localizationSummary = {},
}) {
  const translatedFiles = translationSummary.translatedFiles ?? [];
  const manualReviewItems = localizationSummary.manualReviewItems ?? [];
  const checkI18n = validationSummary.checkI18n ?? { status: 'not-run', summary: 'Task 5 will populate check:i18n results.' };

  return [
    '# Upstream sync',
    '',
    `- replay status: \`${status}\``,
    `- branch: \`${branchName}\``,
    `- upstream ref/tag: \`${upstreamRef}\``,
    `- maintenance ref: \`${maintenanceRef}\``,
    formatConflictLine(diagnostics),
    '',
    '## Replayed commits',
    ...(commits.length > 0 ? commits.map((commit) => `- \`${commit}\``) : ['- none']),
    '',
    '## Auto-translated files',
    ...(translatedFiles.length > 0
      ? translatedFiles.map((filePath) => `- \`${filePath}\``)
      : [`- none (${translationSummary.mode ?? 'review-only'})`]),
    '',
    '## Validation',
    `- overall: \`${validationSummary.status ?? 'not-run'}\``,
    `- check:i18n: \`${checkI18n.status ?? 'not-run'}\` — ${checkI18n.summary ?? 'Task 5 will populate check:i18n results.'}`,
    '',
    '## Manual review items',
    ...(manualReviewItems.length > 0 ? manualReviewItems.map(formatManualReviewItem) : ['- none']),
    '',
  ].join('\n');
}
