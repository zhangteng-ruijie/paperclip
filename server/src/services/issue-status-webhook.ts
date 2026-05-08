import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issueRelations, issues, projects } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { secretService } from "./secrets.js";

const PROJECT_STATUS_WEBHOOK_ENV_KEYS = [
  "PAPERCLIP_PROJECT_STATUS_WEBHOOK_URL",
  "PROJECT_STATUS_WEBHOOK_URL",
  "STATUS_WEBHOOK_URL",
  "PROJECT_WEBHOOK_URL",
] as const;
const WEBHOOK_TIMEOUT_MS = 2_500;
const WEBHOOK_MAX_ATTEMPTS = 2;
const WEBHOOK_RETRY_DELAY_MS = 100;

type IssueStatusWebhookSource =
  | "issue.update"
  | "issue.checkout"
  | "issue.release"
  | "issue.tree_cancel"
  | "issue.tree_restore";

type IssueStatusWebhookIssue = Pick<
  typeof issues.$inferSelect,
  | "id"
  | "companyId"
  | "projectId"
  | "goalId"
  | "parentId"
  | "identifier"
  | "title"
  | "status"
  | "assigneeAgentId"
  | "assigneeUserId"
  | "updatedAt"
>;

type IssueRelationPayload = {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
};

function readWebhookUrl(env: Record<string, string>) {
  for (const key of PROJECT_STATUS_WEBHOOK_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function normalizeWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFeishuBotWebhook(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "open.feishu.cn" && parsed.pathname.startsWith("/open-apis/bot/v2/hook/");
  } catch {
    return false;
  }
}

function readPayloadRecord(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatFeishuStatusText(payload: Record<string, unknown>) {
  const issue = readPayloadRecord(payload, "issue");
  const assignee = readPayloadRecord(issue ?? {}, "assignee");
  const agent = readPayloadRecord(assignee ?? {}, "agent");
  const identifier = typeof issue?.identifier === "string" && issue.identifier ? issue.identifier : issue?.id;
  const title = typeof issue?.title === "string" ? issue.title : "";
  const previousStatus = typeof issue?.previousStatus === "string" ? issue.previousStatus : "unknown";
  const status = typeof issue?.status === "string" ? issue.status : "unknown";
  const source = typeof payload.source === "string" ? payload.source : "unknown";
  const changedAt = typeof payload.changedAt === "string" ? payload.changedAt : new Date().toISOString();
  const assigneeName =
    typeof agent?.name === "string" && agent.name
      ? `${agent.name}${typeof agent.role === "string" && agent.role ? ` (${agent.role})` : ""}`
      : typeof assignee?.agentId === "string" && assignee.agentId
        ? assignee.agentId
        : "unassigned";

  return [
    "Paperclip issue status changed",
    `${identifier ?? "unknown"}${title ? ` ${title}` : ""}`,
    `Status: ${previousStatus} -> ${status}`,
    `Source: ${source}`,
    `Assignee: ${assigneeName}`,
    `Changed: ${changedAt}`,
  ].join("\n");
}

function buildWebhookRequest(url: string, payload: Record<string, unknown>) {
  if (!isFeishuBotWebhook(url)) {
    return JSON.stringify(payload);
  }
  return JSON.stringify({
    msg_type: "text",
    content: {
      text: formatFeishuStatusText(payload),
    },
  });
}

async function assertFeishuResponseOk(response: Response) {
  if (typeof response.text !== "function") return;
  const body = await response.text();
  if (!body) return;
  try {
    const parsed = JSON.parse(body) as { code?: unknown; msg?: unknown };
    const code = typeof parsed.code === "number" ? parsed.code : null;
    if (code !== null && code !== 0) {
      const message = typeof parsed.msg === "string" && parsed.msg ? parsed.msg : "unknown error";
      throw new Error(`Feishu webhook returned code ${code}: ${message}`);
    }
  } catch (err) {
    if (err instanceof SyntaxError) return;
    throw err;
  }
}

async function postWebhook(url: string, payload: Record<string, unknown>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: buildWebhookRequest(url, payload),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Project issue status webhook returned HTTP ${response.status}`);
      }
      if (isFeishuBotWebhook(url)) {
        await assertFeishuResponseOk(response);
      }
      return;
    } catch (err) {
      lastError = err;
      if (attempt < WEBHOOK_MAX_ATTEMPTS) {
        await delay(WEBHOOK_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

async function loadIssueRelationsPayload(db: Db, issue: IssueStatusWebhookIssue) {
  const [blockedByRows, blocksRows] = await Promise.all([
    db
      .select({
        id: issues.id,
        identifier: issues.identifier,
        title: issues.title,
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
      })
      .from(issueRelations)
      .innerJoin(issues, eq(issueRelations.issueId, issues.id))
      .where(
        and(
          eq(issueRelations.companyId, issue.companyId),
          eq(issueRelations.relatedIssueId, issue.id),
          eq(issueRelations.type, "blocks"),
        ),
      ),
    db
      .select({
        id: issues.id,
        identifier: issues.identifier,
        title: issues.title,
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
      })
      .from(issueRelations)
      .innerJoin(issues, eq(issueRelations.relatedIssueId, issues.id))
      .where(
        and(
          eq(issueRelations.companyId, issue.companyId),
          eq(issueRelations.issueId, issue.id),
          eq(issueRelations.type, "blocks"),
        ),
      ),
  ]);

  return {
    blockedBy: blockedByRows as IssueRelationPayload[],
    blocks: blocksRows as IssueRelationPayload[],
  };
}

async function deliverIssueStatusWebhook(input: {
  db: Db;
  issue: IssueStatusWebhookIssue;
  previousStatus: string;
  source: IssueStatusWebhookSource;
  changedAt?: Date;
}) {
  const { db, issue } = input;
  if (!issue.projectId || issue.status === input.previousStatus) return;

  const project = await db
    .select({
      id: projects.id,
      companyId: projects.companyId,
      env: projects.env,
    })
    .from(projects)
    .where(and(eq(projects.id, issue.projectId), eq(projects.companyId, issue.companyId)))
    .then((rows) => rows[0] ?? null);
  if (!project) return;

  const resolved = await secretService(db).resolveEnvBindings(project.companyId, project.env);
  const rawWebhookUrl = readWebhookUrl(resolved.env);
  if (!rawWebhookUrl) return;

  const webhookUrl = normalizeWebhookUrl(rawWebhookUrl);
  if (!webhookUrl) {
    logger.warn(
      { issueId: issue.id, projectId: project.id },
      "project issue status webhook URL is invalid; skipping delivery",
    );
    return;
  }

  const assigneeAgent = issue.assigneeAgentId
    ? await db
      .select({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        status: agents.status,
      })
      .from(agents)
      .where(and(eq(agents.id, issue.assigneeAgentId), eq(agents.companyId, issue.companyId)))
      .then((rows) => rows[0] ?? null)
    : null;
  const relations = await loadIssueRelationsPayload(db, issue);
  const changedAt = input.changedAt ?? new Date();

  await postWebhook(webhookUrl, {
    event: "issue.status_changed",
    source: input.source,
    changedAt: changedAt.toISOString(),
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      previousStatus: input.previousStatus,
      status: issue.status,
      projectId: issue.projectId,
      goalId: issue.goalId,
      parentId: issue.parentId,
      assignee: {
        agentId: issue.assigneeAgentId,
        userId: issue.assigneeUserId,
        agent: assigneeAgent,
      },
      updatedAt: new Date(issue.updatedAt).toISOString(),
      relations,
    },
  });
}

export function scheduleIssueStatusWebhook(input: {
  db: Db;
  issue: IssueStatusWebhookIssue;
  previousStatus: string;
  source: IssueStatusWebhookSource;
  changedAt?: Date;
}) {
  if (input.issue.status === input.previousStatus) return;
  void Promise.resolve()
    .then(() => deliverIssueStatusWebhook(input))
    .catch((err) => {
      logger.warn(
        {
          err,
          issueId: input.issue.id,
          identifier: input.issue.identifier,
          projectId: input.issue.projectId,
          previousStatus: input.previousStatus,
          status: input.issue.status,
          source: input.source,
        },
        "failed to deliver project issue status webhook",
      );
    });
}

export async function scheduleIssueStatusWebhookById(input: {
  db: Db;
  companyId: string;
  issueId: string;
  previousStatus: string;
  source: IssueStatusWebhookSource;
  changedAt?: Date;
}) {
  const issue = await input.db
    .select()
    .from(issues)
    .where(and(eq(issues.companyId, input.companyId), eq(issues.id, input.issueId)))
    .then((rows) => rows[0] ?? null);
  if (!issue) return;
  scheduleIssueStatusWebhook({
    db: input.db,
    issue,
    previousStatus: input.previousStatus,
    source: input.source,
    changedAt: input.changedAt,
  });
}
