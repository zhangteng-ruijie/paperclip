export type RuijieSsoConfig = {
  enabled?: boolean;
};

export function normalizeConfig(input: unknown): Required<RuijieSsoConfig> {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
  };
}
