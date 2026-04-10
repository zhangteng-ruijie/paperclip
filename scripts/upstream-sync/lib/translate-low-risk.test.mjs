import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { scanAndMaybeTranslateLowRisk } from './translate-low-risk.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function createSandbox(name) {
  const sandboxRoot = path.join(repoRoot, 'scripts', 'upstream-sync', '.test-artifacts', name);
  const sandbox = sandboxRoot;
  fs.mkdirSync(sandbox, { recursive: true });
  return { sandboxRoot, sandbox };
}

function createRunMock(responses) {
  const calls = [];
  const run = async (command) => {
    calls.push(command);
    const key = JSON.stringify(command);
    const response = responses[key];
    if (response instanceof Error) {
      throw response;
    }

    return response ?? '';
  };

  return { calls, run };
}

const baselineSource = `
const inboxCopy = {
  en: {
    title: 'Inbox',
    cta: 'Retry',
  },
  'zh-CN': {
    title: '收件箱',
    cta: '重试',
    orphaned: '旧字段',
  },
} as const;
`;

const currentSource = `
const inboxCopy = {
  en: {
    title: 'Inbox overview',
    cta: 'Retry',
    helper: 'Read more',
  },
  'zh-CN': {
    title: '收件箱',
    cta: '重试',
    orphaned: '旧字段',
  },
} as const;
`;

const currentEnglishMarkdown = '# Quickstart\n\nUse `paperclipai onboard --yes`.\n';
const currentChineseMarkdown = '# 快速开始\n\n使用 `paperclipai run`。\n';

async function writeFixtureFiles(sandbox) {
  fs.mkdirSync(path.join(sandbox, 'ui', 'src', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'docs', 'start'), { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'ui', 'src', 'lib', 'inbox-copy.ts'), currentSource, 'utf8');
  fs.writeFileSync(path.join(sandbox, 'docs', 'start', 'quickstart.md'), currentEnglishMarkdown, 'utf8');
  fs.writeFileSync(path.join(sandbox, 'docs', 'start', 'quickstart-zh-cn.md'), currentChineseMarkdown, 'utf8');
}

test('scanAndMaybeTranslateLowRisk falls back to review-only mode when LLM config is incomplete', async () => {
  const { sandboxRoot, sandbox } = createSandbox(`translate-review-only-${Date.now()}`);
  await writeFixtureFiles(sandbox);

  const { calls, run } = createRunMock({
    '{"command":"git","args":["show","origin/master:ui/src/lib/inbox-copy.ts"]}': baselineSource,
    '{"command":"git","args":["show","origin/master:docs/start/quickstart.md"]}': '# Quickstart\n\nUse `paperclipai run`.\n',
  });

  let translatorCalls = 0;

  try {
    const result = await scanAndMaybeTranslateLowRisk({
      config: {
        upstreamRef: 'origin/master',
        dryRun: false,
        llmApiBase: 'https://example.invalid/v1',
        llmApiKey: undefined,
        llmModel: 'gpt-test',
      },
      cwd: sandbox,
      run,
      manifest: {
        autoTranslationTargets: ['ui/src/lib/inbox-copy.ts'],
        reviewOnlyPaths: [
          {
            englishPath: 'docs/start/quickstart.md',
            chinesePath: 'docs/start/quickstart-zh-cn.md',
          },
        ],
      },
      translateEntries: async () => {
        translatorCalls += 1;
        return {};
      },
    });

    assert.equal(result.translationSummary.mode, 'review-only');
    assert.equal(result.translationSummary.reason, 'missing-llm-config');
    assert.equal(result.translationSummary.translatedEntryCount, 0);
    assert.deepEqual(result.translationSummary.translatedFiles, []);
    assert.equal(translatorCalls, 0);
    assert.match(fs.readFileSync(path.join(sandbox, 'ui', 'src', 'lib', 'inbox-copy.ts'), 'utf8'), /helper: 'Read more'/);
    assert.deepEqual(result.localizationSummary.manualReviewItems, [
      {
        type: 'copy-changed',
        path: 'ui/src/lib/inbox-copy.ts',
        key: 'title',
        english: 'Inbox overview',
        chinese: '收件箱',
      },
      {
        type: 'copy-missing',
        path: 'ui/src/lib/inbox-copy.ts',
        key: 'helper',
        english: 'Read more',
      },
      {
        type: 'copy-stale',
        path: 'ui/src/lib/inbox-copy.ts',
        key: 'orphaned',
        chinese: '旧字段',
        baselineEnglish: undefined,
      },
      {
        type: 'markdown-review',
        path: 'docs/start/quickstart-zh-cn.md',
        sourcePath: 'docs/start/quickstart.md',
        reason: 'english-changed',
      },
    ]);
    assert.deepEqual(calls, [
      { command: 'git', args: ['show', 'origin/master:ui/src/lib/inbox-copy.ts'] },
      { command: 'git', args: ['show', 'origin/master:docs/start/quickstart.md'] },
    ]);
  } finally {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test('scanAndMaybeTranslateLowRisk updates low-risk copy files with injected translations', async () => {
  const { sandboxRoot, sandbox } = createSandbox(`translate-apply-${Date.now()}`);
  await writeFixtureFiles(sandbox);

  const { run } = createRunMock({
    '{"command":"git","args":["show","origin/master:ui/src/lib/inbox-copy.ts"]}': baselineSource,
    '{"command":"git","args":["show","origin/master:docs/start/quickstart.md"]}': '# Quickstart\n\nUse `paperclipai run`.\n',
  });

  const translatorCalls = [];

  try {
    const result = await scanAndMaybeTranslateLowRisk({
      config: {
        upstreamRef: 'origin/master',
        dryRun: false,
        llmApiBase: 'https://example.invalid/v1',
        llmApiKey: 'secret',
        llmModel: 'gpt-test',
      },
      cwd: sandbox,
      run,
      manifest: {
        autoTranslationTargets: ['ui/src/lib/inbox-copy.ts'],
        reviewOnlyPaths: [
          {
            englishPath: 'docs/start/quickstart.md',
            chinesePath: 'docs/start/quickstart-zh-cn.md',
          },
        ],
      },
      translateEntries: async (request) => {
        translatorCalls.push(request);
        return {
          title: '收件箱概览',
          helper: '了解更多',
        };
      },
    });

    assert.equal(result.translationSummary.mode, 'auto-translate');
    assert.equal(result.translationSummary.reason, undefined);
    assert.equal(result.translationSummary.translatedEntryCount, 2);
    assert.deepEqual(result.translationSummary.translatedFiles, ['ui/src/lib/inbox-copy.ts']);
    assert.equal(translatorCalls.length, 1);
    assert.deepEqual(translatorCalls[0].entries, [
      {
        key: 'helper',
        english: 'Read more',
        kind: 'missing',
      },
      {
        key: 'title',
        english: 'Inbox overview',
        previousEnglish: 'Inbox',
        previousChinese: '收件箱',
        kind: 'changed',
      },
    ]);

    const updatedSource = fs.readFileSync(path.join(sandbox, 'ui', 'src', 'lib', 'inbox-copy.ts'), 'utf8');
    assert.match(updatedSource, /title: "收件箱概览"/);
    assert.match(updatedSource, /helper: "了解更多"/);
    assert.match(updatedSource, /orphaned: "旧字段"/);
    assert.deepEqual(result.localizationSummary.manualReviewItems, [
      {
        type: 'copy-stale',
        path: 'ui/src/lib/inbox-copy.ts',
        key: 'orphaned',
        chinese: '旧字段',
        baselineEnglish: undefined,
      },
      {
        type: 'markdown-review',
        path: 'docs/start/quickstart-zh-cn.md',
        sourcePath: 'docs/start/quickstart.md',
        reason: 'english-changed',
      },
    ]);
  } finally {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
