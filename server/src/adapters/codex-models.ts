import type { AdapterModel } from "./types.js";
import { models as codexFallbackModels } from "@paperclipai/adapter-codex-local";
function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

export async function listCodexModels(): Promise<AdapterModel[]> {
  return dedupeModels(codexFallbackModels);
}

export async function refreshCodexModels(): Promise<AdapterModel[]> {
  return listCodexModels();
}

export function resetCodexModelsCacheForTests() {
  // Codex model choices are intentionally pinned to the adapter whitelist.
}
