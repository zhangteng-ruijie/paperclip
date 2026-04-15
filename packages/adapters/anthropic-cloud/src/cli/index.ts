export const type = "anthropic_cloud";

export function formatStdoutEvent(line: string, _debug: boolean): void {
  process.stdout.write(line);
}
