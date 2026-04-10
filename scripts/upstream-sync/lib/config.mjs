function readConfigValue(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function parseSyncConfig(env = process.env, argv = process.argv.slice(2)) {
  const githubRepository = readConfigValue(env.GITHUB_REPOSITORY);

  if (!githubRepository) {
    throw new Error('GITHUB_REPOSITORY is required');
  }

  return {
    githubRepository,
    baseBranch: readConfigValue(env.BASE_BRANCH) ?? 'zh-enterprise',
    upstreamRemote: readConfigValue(env.UPSTREAM_REMOTE) ?? 'upstream',
    upstreamRef: readConfigValue(env.UPSTREAM_REF) ?? 'upstream/master',
    maintenanceRef: readConfigValue(env.MAINTENANCE_REF) ?? 'origin/zh-enterprise',
    branchPrefix: readConfigValue(env.BRANCH_PREFIX) ?? 'bot-upgrade',
    dryRun: argv.includes('--dry-run'),
    llmApiBase: readConfigValue(env.LLM_API_BASE),
    llmApiKey: readConfigValue(env.LLM_API_KEY),
    llmModel: readConfigValue(env.LLM_MODEL),
  };
}
