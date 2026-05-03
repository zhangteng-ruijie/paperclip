export const LOW_RISK_AUTO_TRANSLATION_TARGETS = [
  'ui/src/lib/agent-copy.ts',
  'ui/src/lib/costs-copy.ts',
  'ui/src/lib/dashboard-copy.ts',
  'ui/src/lib/goal-copy.ts',
  'ui/src/lib/inbox-copy.ts',
  'ui/src/lib/issue-chat-copy.ts',
  'ui/src/lib/issue-detail-copy.ts',
  'ui/src/lib/issue-documents-copy.ts',
  'ui/src/lib/issues-copy.ts',
  'ui/src/lib/org-chart-copy.ts',
  'ui/src/lib/routines-copy.ts',
  'ui/src/lib/run-detail-copy.ts',
  'ui/src/lib/shell-copy.ts',
];

export const REVIEW_ONLY_PATHS = [
  {
    englishPath: 'docs/start/quickstart.md',
    chinesePath: 'docs/start/quickstart-zh-cn.md',
  },
];

export const LOCALIZATION_MANIFEST = {
  autoTranslationTargets: LOW_RISK_AUTO_TRANSLATION_TARGETS,
  reviewOnlyPaths: REVIEW_ONLY_PATHS,
};
