import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffCopyResource,
  diffMarkdownPair,
  extractCopyEntries,
} from './localization-diff.mjs';

test('extractCopyEntries flattens en and zh-CN copy tables from helper source', () => {
  const sourceText = `
    const copy = {
      en: {
        title: 'Inbox',
        nested: {
          cta: 'Retry',
        },
      },
      'zh-CN': {
        title: '收件箱',
        nested: {
          cta: '重试',
        },
      },
    } as const;
  `;

  assert.deepEqual(extractCopyEntries(sourceText), {
    english: {
      title: 'Inbox',
      'nested.cta': 'Retry',
    },
    chinese: {
      title: '收件箱',
      'nested.cta': '重试',
    },
  });
});

test('diffCopyResource reports missing and changed zh-CN entries for changed English copy', () => {
  const diff = diffCopyResource({
    resourcePath: 'ui/src/lib/inbox-copy.ts',
    baselineEnglish: {
      title: 'Inbox',
      description: 'Old description',
      cta: 'Retry',
    },
    english: {
      title: 'Inbox',
      description: 'New description',
      cta: 'Retry now',
      helper: 'Read more',
    },
    chinese: {
      title: '收件箱',
      description: '旧说明',
      cta: '重试',
    },
  });

  assert.deepEqual(diff, {
    resourcePath: 'ui/src/lib/inbox-copy.ts',
    missing: [
      {
        key: 'helper',
        english: 'Read more',
      },
    ],
    changed: [
      {
        key: 'cta',
        baselineEnglish: 'Retry',
        english: 'Retry now',
        chinese: '重试',
      },
      {
        key: 'description',
        baselineEnglish: 'Old description',
        english: 'New description',
        chinese: '旧说明',
      },
    ],
    hasDiff: true,
  });
});

test('diffMarkdownPair flags quickstart markdown drift for review', () => {
  const diff = diffMarkdownPair({
    englishPath: 'docs/start/quickstart.md',
    chinesePath: 'docs/start/quickstart-zh-cn.md',
    baselineEnglish: '# Quickstart\n\nUse `paperclipai run`.\n',
    english: '# Quickstart\n\nUse `paperclipai onboard --yes`.\n',
    chinese: '# 快速开始\n\n使用 `paperclipai run`。\n',
  });

  assert.deepEqual(diff, {
    englishPath: 'docs/start/quickstart.md',
    chinesePath: 'docs/start/quickstart-zh-cn.md',
    needsReview: true,
    reason: 'english-changed',
  });
});
