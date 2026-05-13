#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile, cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "../../..");
const outputDir = path.resolve(repoRoot, "output", "plugin-feishu-connector-cloud");
const stageDir = path.join(outputDir, "package");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includesObject(items, predicate, label) {
  assert(Array.isArray(items) && items.some(predicate), `Packed plugin missing ${label}`);
}

async function main() {
  const sourcePackage = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  run("pnpm", ["--filter", sourcePackage.name, "build"], { stdio: "inherit" });

  await cp(path.join(packageDir, "dist"), path.join(stageDir, "dist"), { recursive: true });
  await cp(path.join(packageDir, "README.md"), path.join(stageDir, "README.md"));
  await cp(path.join(packageDir, "migrations"), path.join(stageDir, "migrations"), { recursive: true });

  const cloudPackageJson = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    description: sourcePackage.description,
    type: "module",
    author: sourcePackage.author,
    license: sourcePackage.license,
    keywords: sourcePackage.keywords,
    dependencies: {
      "@larksuite/cli": sourcePackage.dependencies["@larksuite/cli"],
    },
    paperclipPlugin: sourcePackage.paperclipPlugin,
    files: [
      "dist",
      "migrations",
      "README.md",
    ],
  };
  await writeFile(path.join(stageDir, "package.json"), `${JSON.stringify(cloudPackageJson, null, 2)}\n`, "utf8");

  const packOutput = run("npm", ["pack", stageDir, "--pack-destination", outputDir, "--json"]);
  const packed = JSON.parse(packOutput);
  const filename = packed?.[0]?.filename;
  if (typeof filename !== "string") throw new Error(`npm pack did not return a filename: ${packOutput}`);
  const tarballPath = path.join(outputDir, filename);

  const installDir = await mkdtemp(path.join(os.tmpdir(), "paperclip-feishu-plugin-install-"));
  run("npm", ["install", tarballPath, "--prefix", installDir, "--ignore-scripts"]);
  const installedPackageDir = path.join(installDir, "node_modules", ...sourcePackage.name.split("/"));
  const manifestPath = path.join(installedPackageDir, "dist", "manifest.js");
  const manifestModule = await import(pathToFileURL(manifestPath).href);
  const manifest = manifestModule.default ?? manifestModule;
  assert(manifest.id === "paperclipai.feishu-connector", `Packed plugin manifest id mismatch: ${manifest.id}`);

  const installedPackageJson = JSON.parse(await readFile(path.join(installedPackageDir, "package.json"), "utf8"));
  const dependencies = installedPackageJson.dependencies ?? {};
  assert(typeof dependencies["@larksuite/cli"] === "string", "Packed plugin must include @larksuite/cli dependency");
  assert(!JSON.stringify(dependencies).includes("workspace:"), "Packed plugin must not include workspace:* dependencies");
  assert(manifest.database?.migrationsDir === "migrations", "Packed plugin manifest must declare migrationsDir");
  assert(manifest.database?.namespaceSlug === "feishu_connector", "Packed plugin manifest must declare feishu_connector namespaceSlug");
  assert(manifest.capabilities?.includes("database.namespace.migrate"), "Packed plugin must declare database migration capability");
  assert(manifest.capabilities?.includes("api.routes.register"), "Packed plugin must declare scoped API route capability");
  assert(manifest.capabilities?.includes("webhooks.receive"), "Packed plugin must declare webhook capability");
  assert(manifest.capabilities?.includes("ui.sidebar.register"), "Packed plugin must declare sidebar capability");
  assert(manifest.capabilities?.includes("ui.action.register"), "Packed plugin must declare comment action capability");
  includesObject(manifest.webhooks, (item) => item.endpointKey === "feishu-events", "Feishu webhook declaration");
  includesObject(manifest.apiRoutes, (item) => item.routeKey === "simulate-inbound-message", "simulate inbound API route");
  includesObject(manifest.ui?.slots, (item) => item.type === "sidebar" && item.exportName === "FeishuSidebarLink", "sidebar slot");
  includesObject(manifest.ui?.slots, (item) => item.type === "commentContextMenuItem" && item.exportName === "FeishuCommentReplyAction", "comment context menu slot");
  const migrationSql = await readFile(path.join(installedPackageDir, "migrations", "001_feishu_connector.sql"), "utf8");
  for (const tableName of [
    "feishu_bots",
    "feishu_entries",
    "feishu_capabilities",
    "feishu_entry_capabilities",
    "feishu_agent_capabilities",
    "feishu_conversations",
    "feishu_message_routes",
    "feishu_event_logs",
    "feishu_conflicts",
    "feishu_permission_checks",
  ]) {
    assert(migrationSql.includes(tableName), `Packed migration missing table ${tableName}`);
  }

  console.log(JSON.stringify({
    ok: true,
    tarballPath,
    packageName: sourcePackage.name,
    version: sourcePackage.version,
    installVerified: true,
    manifestId: manifest.id,
    checked: {
      bundledLarkCli: true,
      noWorkspaceDependencies: true,
      migrations: true,
      webhook: true,
      apiRoutes: true,
      sidebar: true,
      commentAction: true,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
