import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { runUpstreamSync } from './orchestrator.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function createSandbox(name) {
  const sandboxRoot = path.join(repoRoot, 'scripts', 'upstream-sync', '.test-artifacts');
  const sandbox = path.join(sandboxRoot, name);
  fs.mkdirSync(sandbox, { recursive: true });
  return { sandboxRoot, sandbox };
}

function createRunMock(responses) {
  const calls = [];
  const run = async (command) => {
    calls.push(command);
    const key = JSON.stringify(command);
    return responses[key] ?? '';
  };

  return { calls, run };
}

test('runUpstreamSync dry-run prepares a bot branch name without replaying commits', async () => {
  const { sandboxRoot, sandbox } = createSandbox(`dry-run-${Date.now()}`);
  const previousCwd = process.cwd();
  process.chdir(sandbox);

  const { calls, run } = createRunMock({
    '{"command":"git","args":["merge-base","origin/master","HEAD"]}': 'base-sha\n',
    '{"command":"git","args":["rev-list","--reverse","base-sha..HEAD"]}': 'c3\nc2\nc1\n',
    '{"command":"git","args":["rev-parse","--short=12","origin/master"]}': 'abc123def456\n',
  });

  try {
    const result = await runUpstreamSync({
      config: {
        githubRepository: 'paperclip/paperclip',
        baseBranch: 'zh-enterprise',
        upstreamRemote: 'upstream',
        upstreamRef: 'origin/master',
        maintenanceRef: 'HEAD',
        branchPrefix: 'bot-upgrade',
        dryRun: true,
        llmApiBase: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
      },
      run,
    });

    assert.equal(result.status, 'dry-run');
    assert.equal(result.branchName, 'bot-upgrade/abc123def456');
    assert.deepEqual(result.commits, ['c3', 'c2', 'c1']);
    assert.equal(fs.existsSync(path.join(sandbox, result.reportPath)), true);
    assert.equal(fs.existsSync(path.join(sandbox, result.prBodyPath)), true);
    assert.match(fs.readFileSync(path.join(sandbox, result.reportPath), 'utf8'), /c3/);
    assert.match(fs.readFileSync(path.join(sandbox, result.prBodyPath), 'utf8'), /bot-upgrade\/abc123def456/);
    assert.deepEqual(calls, [
      { command: 'git', args: ['merge-base', 'origin/master', 'HEAD'] },
      { command: 'git', args: ['rev-list', '--reverse', 'base-sha..HEAD'] },
      { command: 'git', args: ['rev-parse', '--short=12', 'origin/master'] },
    ]);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
});

test('runUpstreamSync replays commits when not in dry-run mode', async () => {
  const { sandboxRoot, sandbox } = createSandbox(`replay-${Date.now()}`);
  const previousCwd = process.cwd();
  process.chdir(sandbox);

  const { calls, run } = createRunMock({
    '{"command":"git","args":["merge-base","origin/master","HEAD"]}': 'base-sha\n',
    '{"command":"git","args":["rev-list","--reverse","base-sha..HEAD"]}': 'c1\nc2\n',
    '{"command":"git","args":["rev-parse","--short=12","origin/master"]}': 'abc123def456\n',
    '{"command":"git","args":["checkout","-B","bot-upgrade/abc123def456","origin/master"]}': '',
    '{"command":"git","args":["cherry-pick","c1"]}': '',
    '{"command":"git","args":["cherry-pick","c2"]}': '',
  });

  try {
    const result = await runUpstreamSync({
      config: {
        githubRepository: 'paperclip/paperclip',
        baseBranch: 'zh-enterprise',
        upstreamRemote: 'upstream',
        upstreamRef: 'origin/master',
        maintenanceRef: 'HEAD',
        branchPrefix: 'bot-upgrade',
        dryRun: false,
        llmApiBase: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
      },
      run,
    });

    assert.equal(result.status, 'replayed');
    assert.deepEqual(result.commits, ['c1', 'c2']);
    assert.equal(fs.existsSync(path.join(sandbox, result.reportPath)), true);
    assert.equal(fs.existsSync(path.join(sandbox, result.prBodyPath)), true);
    assert.deepEqual(calls, [
      { command: 'git', args: ['merge-base', 'origin/master', 'HEAD'] },
      { command: 'git', args: ['rev-list', '--reverse', 'base-sha..HEAD'] },
      { command: 'git', args: ['rev-parse', '--short=12', 'origin/master'] },
      { command: 'git', args: ['checkout', '-B', 'bot-upgrade/abc123def456', 'origin/master'] },
      { command: 'git', args: ['cherry-pick', 'c1'] },
      { command: 'git', args: ['cherry-pick', 'c2'] },
    ]);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
});
