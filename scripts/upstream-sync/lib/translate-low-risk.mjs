import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as ts from 'typescript';

import { diffCopyResource, diffMarkdownPair, extractCopyEntries } from './localization-diff.mjs';
import { LOCALIZATION_MANIFEST } from './localization-manifest.mjs';

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isTranslationEnabled(config) {
  return Boolean(
    config.dryRun === false
    && hasValue(config.llmApiBase)
    && hasValue(config.llmApiKey)
    && hasValue(config.llmModel),
  );
}

function resolveTranslationMode(config) {
  if (config.dryRun) {
    return {
      enabled: false,
      mode: 'review-only',
      reason: 'dry-run',
    };
  }

  if (!isTranslationEnabled(config)) {
    return {
      enabled: false,
      mode: 'review-only',
      reason: 'missing-llm-config',
    };
  }

  return {
    enabled: true,
    mode: 'auto-translate',
    reason: undefined,
  };
}

function toOutputText(result) {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result.stdout === 'string') {
    return result.stdout;
  }

  return '';
}

async function runGit(run, args) {
  return toOutputText(await run({ command: 'git', args }));
}

async function readWorkspaceFile(cwd, filePath) {
  try {
    return await readFile(path.join(cwd, filePath), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

async function readGitFile(run, ref, filePath) {
  try {
    return await runGit(run, ['show', `${ref}:${filePath}`]);
  } catch {
    return undefined;
  }
}

function getPropertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return undefined;
}

function unwrapExpression(node) {
  if (!node) {
    return undefined;
  }

  let current = node;
  while (
    ts.isAsExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function getObjectProperty(objectLiteral, propertyName) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    if (getPropertyName(property.name) === propertyName) {
      return property;
    }
  }

  return undefined;
}

function findCopyObjectLiteral(sourceFile) {
  let match;

  function visit(node) {
    if (match) {
      return;
    }

    if (ts.isObjectLiteralExpression(node)) {
      const englishProperty = getObjectProperty(node, 'en');
      const chineseProperty = getObjectProperty(node, 'zh-CN');
      const english = englishProperty ? unwrapExpression(englishProperty.initializer) : undefined;
      const chinese = chineseProperty ? unwrapExpression(chineseProperty.initializer) : undefined;

      if (
        englishProperty
        && chineseProperty
        && english
        && chinese
        && ts.isObjectLiteralExpression(english)
        && ts.isObjectLiteralExpression(chinese)
      ) {
        match = {
          copyObject: node,
          chineseProperty,
          chineseObject: chinese,
        };
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return match;
}

function setNestedValue(target, dottedKey, value) {
  const segments = dottedKey.split('.');
  let current = target;

  for (const segment of segments.slice(0, -1)) {
    if (!current[segment] || typeof current[segment] !== 'object') {
      current[segment] = {};
    }

    current = current[segment];
  }

  current[segments[segments.length - 1]] = value;
}

function buildNestedObject(entries) {
  const root = {};
  for (const [key, value] of Object.entries(entries)) {
    setNestedValue(root, key, value);
  }
  return root;
}

function escapeStringLiteral(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('"', '\\"');
}

function serializeObjectLiteral(value, indent = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `"${escapeStringLiteral(value)}"`;
  }

  const childIndent = `${indent}  `;
  const entries = Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${childIndent}${/^[A-Za-z_$][\w$]*$/u.test(key) ? key : `"${escapeStringLiteral(key)}"`}: ${serializeObjectLiteral(value[key], childIndent)}`);

  if (entries.length === 0) {
    return '{}';
  }

  return `{\n${entries.join(',\n')}\n${indent}}`;
}

function detectIndentation(sourceText, node, sourceFile) {
  const start = node.getStart(sourceFile);
  const lineStart = sourceText.lastIndexOf('\n', start - 1) + 1;
  const linePrefix = sourceText.slice(lineStart, start);
  const match = linePrefix.match(/^\s*/u);
  return match ? match[0] : '';
}

export function replaceChineseCopyEntries(sourceText, chineseEntries) {
  const sourceFile = ts.createSourceFile('copy-helper.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const match = findCopyObjectLiteral(sourceFile);

  if (!match) {
    throw new Error('Could not find copy helper en/zh-CN tables');
  }

  const replacementText = serializeObjectLiteral(
    buildNestedObject(chineseEntries),
    detectIndentation(sourceText, match.chineseObject, sourceFile),
  );

  return `${sourceText.slice(0, match.chineseObject.getStart(sourceFile))}${replacementText}${sourceText.slice(match.chineseObject.getEnd())}`;
}

function formatChangedEntry(entry) {
  return {
    key: entry.key,
    english: entry.english,
    previousEnglish: entry.baselineEnglish,
    previousChinese: entry.chinese,
    kind: 'changed',
  };
}

function formatMissingEntry(entry) {
  return {
    key: entry.key,
    english: entry.english,
    kind: 'missing',
  };
}

function buildManualReviewItems({ resourceDiff, markdownPairs, translationEnabled, translatedKeysByFile }) {
  const reviewItems = [];

  for (const file of resourceDiff) {
    const translatedKeys = translatedKeysByFile.get(file.resourcePath) ?? new Set();

    for (const entry of file.changed) {
      if (translationEnabled && translatedKeys.has(entry.key)) {
        continue;
      }

      reviewItems.push({
        type: 'copy-changed',
        path: file.resourcePath,
        key: entry.key,
        english: entry.english,
        chinese: entry.chinese,
      });
    }

    for (const entry of file.missing) {
      if (translationEnabled && translatedKeys.has(entry.key)) {
        continue;
      }

      reviewItems.push({
        type: 'copy-missing',
        path: file.resourcePath,
        key: entry.key,
        english: entry.english,
      });
    }

    for (const entry of file.stale) {
      reviewItems.push({
        type: 'copy-stale',
        path: file.resourcePath,
        key: entry.key,
        chinese: entry.chinese,
        baselineEnglish: entry.baselineEnglish,
      });
    }
  }

  for (const entry of markdownPairs) {
    if (!entry.needsReview) {
      continue;
    }

    reviewItems.push({
      type: 'markdown-review',
      path: entry.chinesePath,
      sourcePath: entry.englishPath,
      reason: entry.reason,
    });
  }

  return reviewItems;
}

export function createOpenAiCompatibleTranslator({ apiBase, apiKey, model, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required for the default translator');
  }

  const endpoint = `${apiBase.replace(/\/+$/u, '')}/chat/completions`;

  return async ({ resourcePath, entries }) => {
    if (entries.length === 0) {
      return {};
    }

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You translate Paperclip UI copy into Simplified Chinese. Return only valid JSON mapping keys to translated strings. Preserve product names, variables, placeholders, punctuation intent, and keys.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              resourcePath,
              locale: 'zh-CN',
              entries,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation request failed: ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('Translation response did not include message content');
    }

    const translations = JSON.parse(content);
    if (!translations || typeof translations !== 'object' || Array.isArray(translations)) {
      throw new Error('Translation response must be a JSON object');
    }

    return translations;
  };
}

export async function scanAndMaybeTranslateLowRisk({
  config,
  cwd = process.cwd(),
  manifest = LOCALIZATION_MANIFEST,
  run,
  translateEntries = isTranslationEnabled(config)
    ? createOpenAiCompatibleTranslator({
      apiBase: config.llmApiBase,
      apiKey: config.llmApiKey,
      model: config.llmModel,
    })
    : async () => ({}),
} = {}) {
  const translationMode = resolveTranslationMode(config);
  const lowRiskFiles = [];
  const markdownPairs = [];
  const translatedFiles = [];
  const translatedEntries = [];
  const translatedKeysByFile = new Map();

  for (const resourcePath of manifest.autoTranslationTargets) {
    const currentSource = await readWorkspaceFile(cwd, resourcePath);
    if (typeof currentSource !== 'string') {
      continue;
    }

    const baselineSource = (await readGitFile(run, config.upstreamRef, resourcePath)) ?? '';
    const { english, chinese } = extractCopyEntries(currentSource);
    const baselineEntries = baselineSource ? extractCopyEntries(baselineSource) : { english: {}, chinese: {} };
    const diff = diffCopyResource({
      resourcePath,
      baselineEnglish: baselineEntries.english,
      english,
      chinese,
    });

    const fileSummary = {
      ...diff,
      translatedKeys: [],
      autoTranslated: false,
    };

    const pendingTranslations = [
      ...diff.missing.map(formatMissingEntry),
      ...diff.changed.map(formatChangedEntry),
    ];

    if (translationMode.enabled && pendingTranslations.length > 0) {
      const translations = await translateEntries({
        resourcePath,
        entries: pendingTranslations,
        english,
        chinese,
        baselineEnglish: baselineEntries.english,
      });

      const nextChinese = { ...chinese };
      const translatedKeys = [];

      for (const entry of pendingTranslations) {
        const translatedValue = translations?.[entry.key];
        if (!hasValue(translatedValue)) {
          continue;
        }

        nextChinese[entry.key] = translatedValue;
        translatedKeys.push(entry.key);
        translatedEntries.push({
          resourcePath,
          key: entry.key,
          english: entry.english,
          chinese: translatedValue,
        });
      }

      if (translatedKeys.length > 0) {
        const updatedSource = replaceChineseCopyEntries(currentSource, nextChinese);
        await writeFile(path.join(cwd, resourcePath), updatedSource, 'utf8');
        fileSummary.autoTranslated = true;
        fileSummary.translatedKeys = translatedKeys;
        translatedKeysByFile.set(resourcePath, new Set(translatedKeys));
        translatedFiles.push(resourcePath);
      }
    }

    lowRiskFiles.push(fileSummary);
  }

  for (const entry of manifest.reviewOnlyPaths) {
    const englishSource = await readWorkspaceFile(cwd, entry.englishPath);
    if (typeof englishSource !== 'string') {
      continue;
    }

    const chineseSource = (await readWorkspaceFile(cwd, entry.chinesePath)) ?? '';
    const baselineEnglish = (await readGitFile(run, config.upstreamRef, entry.englishPath)) ?? '';
    markdownPairs.push(diffMarkdownPair({
      englishPath: entry.englishPath,
      chinesePath: entry.chinesePath,
      baselineEnglish,
      english: englishSource,
      chinese: chineseSource,
    }));
  }

  const localizationSummary = {
    lowRiskFiles,
    markdownPairs,
    manualReviewItems: buildManualReviewItems({
      resourceDiff: lowRiskFiles,
      markdownPairs,
      translationEnabled: translationMode.enabled,
      translatedKeysByFile,
    }),
  };

  return {
    localizationSummary,
    translationSummary: {
      ...translationMode,
      translatedFiles,
      translatedEntryCount: translatedEntries.length,
      translatedEntries,
    },
  };
}
