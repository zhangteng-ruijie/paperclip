import { Command } from "commander";
import { onboard } from "./commands/onboard.js";
import { doctor } from "./commands/doctor.js";
import { envCommand } from "./commands/env.js";
import { configure } from "./commands/configure.js";
import { addAllowedHostname } from "./commands/allowed-hostname.js";
import { heartbeatRun } from "./commands/heartbeat-run.js";
import { runCommand } from "./commands/run.js";
import { bootstrapCeoInvite } from "./commands/auth-bootstrap-ceo.js";
import { dbBackupCommand } from "./commands/db-backup.js";
import { registerEnvLabCommands } from "./commands/env-lab.js";
import { registerContextCommands } from "./commands/client/context.js";
import { registerCompanyCommands } from "./commands/client/company.js";
import { registerIssueCommands } from "./commands/client/issue.js";
import { registerAgentCommands } from "./commands/client/agent.js";
import { registerProjectCommands } from "./commands/client/project.js";
import { registerGoalCommands } from "./commands/client/goal.js";
import { registerApprovalCommands } from "./commands/client/approval.js";
import { registerActivityCommands } from "./commands/client/activity.js";
import { registerDashboardCommands } from "./commands/client/dashboard.js";
import { registerRoutineCommands } from "./commands/routines.js";
import { registerPipelineCommands } from "./commands/pipelines.js";
import { registerFeedbackCommands } from "./commands/client/feedback.js";
import { registerSecretCommands } from "./commands/client/secrets.js";
import { registerCloudCommands } from "./commands/client/cloud.js";
import { registerSkillsCommands } from "./commands/client/skills.js";
import { registerTeamCommands } from "./commands/client/teams.js";
import { applyDataDirOverride, type DataDirOptionLike } from "./config/data-dir.js";
import { loadPaperclipEnvFile } from "./config/env.js";
import { initTelemetryFromConfigFile, flushTelemetry } from "./telemetry.js";
import { registerWorktreeCommands } from "./commands/worktree.js";
import { registerPluginCommands } from "./commands/client/plugin.js";
import { registerClientAuthCommands } from "./commands/client/auth.js";
import { cliT } from "./localization.js";
import { registerConnectCommand } from "./commands/client/connect.js";
import { registerTokenCommands } from "./commands/client/token.js";
import { registerPromptCommands } from "./commands/client/prompt.js";
import { registerRunCommands } from "./commands/client/run.js";
import { registerCostCommands } from "./commands/client/cost.js";
import { registerWorkspaceCommands } from "./commands/client/workspace.js";
import { registerAccessCommands } from "./commands/client/access.js";
import { registerRoutineApiCommands } from "./commands/client/routine-api.js";
import { registerAdapterCommands } from "./commands/client/adapter.js";
import { registerAssetCommands } from "./commands/client/asset.js";
import { registerSkillCommands } from "./commands/client/skill.js";
import { cliVersion } from "./version.js";

const program = new Command();
const DATA_DIR_OPTION_HELP = cliT("option.dataDir");

program
  .name("paperclipai")
  .description(cliT("program.description"))
  .version(cliVersion);

program.hook("preAction", (_thisCommand, actionCommand) => {
  const options = actionCommand.optsWithGlobals() as DataDirOptionLike;
  const optionNames = new Set(actionCommand.options.map((option) => option.attributeName()));
  applyDataDirOverride(options, {
    hasConfigOption: optionNames.has("config"),
    hasContextOption: optionNames.has("context"),
  });
  loadPaperclipEnvFile(options.config);
  initTelemetryFromConfigFile(options.config);
});

program
  .command("onboard")
  .description(cliT("command.onboard.description"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--bind <mode>", cliT("command.onboard.bind"))
  .option("-y, --yes", cliT("command.onboard.yes"), false)
  .option("--run", cliT("command.onboard.run"), false)
  .action(onboard);

program
  .command("doctor")
  .description(cliT("command.doctor.description"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--repair", cliT("command.doctor.repair"))
  .alias("--fix")
  .option("-y, --yes", cliT("command.doctor.yes"))
  .action(async (opts) => {
    await doctor(opts);
  });

program
  .command("env")
  .description(cliT("command.env.description"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(envCommand);

program
  .command("configure")
  .description(cliT("command.configure.description"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-s, --section <section>", cliT("command.configure.section"))
  .action(configure);

program
  .command("db:backup")
  .description(cliT("command.dbBackup.description"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--dir <path>", cliT("command.dbBackup.dir"))
  .option("--retention-days <days>", cliT("command.dbBackup.retention"), (value) => Number(value))
  .option("--filename-prefix <prefix>", cliT("command.dbBackup.prefix"), "paperclip")
  .option("--json", cliT("command.dbBackup.json"))
  .action(async (opts) => {
    await dbBackupCommand(opts);
  });

program
  .command("allowed-hostname")
  .description(cliT("command.allowedHostname.description"))
  .argument("<host>", cliT("command.allowedHostname.argument"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(addAllowedHostname);

const run = program
  .command("run")
  .description(cliT("command.run.description"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-i, --instance <id>", cliT("command.run.instance"))
  .option("--bind <mode>", cliT("command.run.bind"))
  .option("--repair", cliT("command.run.repair"), true)
  .option("--no-repair", cliT("command.run.noRepair"))
  .action(runCommand);

registerRunCommands(run);

const heartbeat = program.command("heartbeat").description(cliT("command.heartbeat.description"));

heartbeat
  .command("run")
  .description(cliT("command.heartbeat.run.description"))
  .requiredOption("-a, --agent-id <agentId>", cliT("command.heartbeat.agentId"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--context <path>", cliT("command.heartbeat.context"))
  .option("--profile <name>", cliT("command.heartbeat.profile"))
  .option("--api-base <url>", cliT("command.heartbeat.apiBase"))
  .option("--api-key <token>", cliT("command.heartbeat.apiKey"))
  .option(
    "--source <source>",
    cliT("command.heartbeat.source"),
    "on_demand",
  )
  .option("--trigger <trigger>", cliT("command.heartbeat.trigger"), "manual")
  .option("--timeout-ms <ms>", cliT("command.heartbeat.timeout"), "0")
  .option("--json", cliT("command.heartbeat.json"))
  .option("--debug", cliT("command.heartbeat.debug"))
  .action(heartbeatRun);

registerContextCommands(program);
registerConnectCommand(program);
registerCompanyCommands(program);
registerIssueCommands(program);
registerAgentCommands(program);
registerProjectCommands(program);
registerGoalCommands(program);
registerTokenCommands(program);
registerPromptCommands(program);
registerApprovalCommands(program);
registerActivityCommands(program);
registerDashboardCommands(program);
registerCostCommands(program);
registerWorkspaceCommands(program);
registerAccessCommands(program);
registerRoutineApiCommands(program);
registerAdapterCommands(program);
registerAssetCommands(program);
registerSkillCommands(program);
registerRoutineCommands(program);
registerPipelineCommands(program);
registerFeedbackCommands(program);
registerSecretCommands(program);
registerCloudCommands(program);
registerSkillsCommands(program);
registerTeamCommands(program);
registerWorktreeCommands(program);
registerEnvLabCommands(program);
registerPluginCommands(program);

const auth = program.command("auth").description(cliT("command.auth.description"));

auth
  .command("bootstrap-ceo")
  .description(cliT("command.auth.bootstrap.description"))
  .option("-c, --config <path>", cliT("option.config"))
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--force", cliT("command.auth.bootstrap.force"), false)
  .option("--expires-hours <hours>", cliT("command.auth.bootstrap.expires"), (value) => Number(value))
  .option("--base-url <url>", cliT("command.auth.bootstrap.baseUrl"))
  .action(bootstrapCeoInvite);

registerClientAuthCommands(auth);

async function main(): Promise<void> {
  let failed = false;
  try {
    await program.parseAsync();
  } catch (err) {
    failed = true;
    console.error(err instanceof Error ? err.message : String(err));
  } finally {
    await flushTelemetry();
  }

  if (failed) {
    process.exit(1);
  }
}

void main();
