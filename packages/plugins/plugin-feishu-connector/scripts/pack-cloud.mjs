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

async function main() {
  const sourcePackage = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  run("pnpm", ["--filter", sourcePackage.name, "build"], { stdio: "inherit" });

  await cp(path.join(packageDir, "dist"), path.join(stageDir, "dist"), { recursive: true });
  await cp(path.join(packageDir, "README.md"), path.join(stageDir, "README.md"));

  const cloudPackageJson = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    description: sourcePackage.description,
    type: "module",
    author: sourcePackage.author,
    license: sourcePackage.license,
    keywords: sourcePackage.keywords,
    paperclipPlugin: sourcePackage.paperclipPlugin,
    files: [
      "dist",
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
  const manifestPath = path.join(installDir, "node_modules", ...sourcePackage.name.split("/"), "dist", "manifest.js");
  const manifestModule = await import(pathToFileURL(manifestPath).href);
  const manifest = manifestModule.default ?? manifestModule;
  if (manifest.id !== "paperclipai.feishu-connector") {
    throw new Error(`Packed plugin manifest id mismatch: ${manifest.id}`);
  }

  console.log(JSON.stringify({
    ok: true,
    tarballPath,
    packageName: sourcePackage.name,
    version: sourcePackage.version,
    installVerified: true,
    manifestId: manifest.id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
