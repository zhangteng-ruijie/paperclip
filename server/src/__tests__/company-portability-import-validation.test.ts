import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CompanyPortabilityFileEntry } from "@paperclipai/shared";

const companySvc = {
  getById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const agentSvc = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getById: vi.fn(),
};

const accessSvc = {
  ensureMembership: vi.fn(),
  listActiveUserMemberships: vi.fn(),
  copyActiveUserMemberships: vi.fn(),
  setPrincipalPermission: vi.fn(),
};

const projectSvc = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
};

const issueSvc = {
  list: vi.fn(),
  getById: vi.fn(),
  getByIdentifier: vi.fn(),
  create: vi.fn(),
};

const routineSvc = {
  list: vi.fn(),
  getDetail: vi.fn(),
  create: vi.fn(),
  createTrigger: vi.fn(),
};

const companySkillSvc = {
  list: vi.fn(),
  listFull: vi.fn(),
  readFile: vi.fn(),
  importPackageFiles: vi.fn(),
};

const assetSvc = {
  getById: vi.fn(),
  create: vi.fn(),
};

const secretSvc = {
  normalizeAdapterConfigForPersistence: vi.fn(async (_companyId: string, config: Record<string, unknown>) => config),
  resolveAdapterConfigForRuntime: vi.fn(async (_companyId: string, config: Record<string, unknown>) => ({ config, secretKeys: new Set<string>() })),
};

const agentInstructionsSvc = {
  materializeManagedBundle: vi.fn(),
};

const db = {
  query: vi.fn(async () => ({ rows: [] })),
  transaction: vi.fn(async (fn) => fn({ query: async () => ({ rows: [] }) })),
};

vi.mock("@paperclipai/db", () => ({
  getDb: vi.fn(() => db),
  schema: {},
}));

vi.mock("../services/companies.js", () => ({
  companyService: () => companySvc,
}));

vi.mock("../services/agents.js", () => ({
  agentService: () => agentSvc,
}));

vi.mock("../services/access.js", () => ({
  accessService: () => accessSvc,
}));

vi.mock("../services/projects.js", () => ({
  projectService: () => projectSvc,
}));

vi.mock("../services/issues.js", () => ({
  issueService: () => issueSvc,
}));

vi.mock("../services/routines.js", () => ({
  routineService: () => routineSvc,
}));

vi.mock("../services/company-skills.js", () => ({
  companySkillService: () => companySkillSvc,
}));

vi.mock("../services/assets.js", () => ({
  assetService: () => assetSvc,
}));

vi.mock("../services/secrets.js", () => ({
  secretService: () => secretSvc,
}));

vi.mock("../services/agent-instructions.js", () => ({
  agentInstructionsService: () => agentInstructionsSvc,
}));

async function createService() {
  const mod = await import("../services/company-portability.js");
  return mod.companyPortabilityService(db as any, undefined as any);
}

function makeInlineSource(files: Record<string, CompanyPortabilityFileEntry>) {
  return { type: "inline" as const, files };
}

function makeCompanyMarkdown(overrides: Record<string, unknown> = {}) {
  const frontmatter = {
    name: "Test Company",
    slug: "test-company",
    ...overrides,
  };
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  return `---\n${yaml}\n---\n\nCompany body.`;
}

function makeAgentMarkdown(overrides: Record<string, unknown> = {}) {
  const frontmatter = {
    name: "Test Agent",
    slug: "test-agent",
    role: "engineer",
    ...overrides,
  };
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join("\n");
  return `---\n${yaml}\n---\n\nAgent instructions.`;
}

function makeProjectMarkdown(overrides: Record<string, unknown> = {}) {
  const frontmatter = {
    name: "Test Project",
    slug: "test-project",
    ...overrides,
  };
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join("\n");
  return `---\n${yaml}\n---\n\nProject description.`;
}

function makeTaskMarkdown(overrides: Record<string, unknown> = {}) {
  const frontmatter = {
    title: "Test Task",
    slug: "test-task",
    ...overrides,
  };
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join("\n");
  return `---\n${yaml}\n---\n\nTask description.`;
}

function makeSkillMarkdown(overrides: Record<string, unknown> = {}) {
  const frontmatter = {
    name: "Test Skill",
    slug: "test-skill",
    ...overrides,
  };
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join("\n");
  return `---\n${yaml}\n---\n\nSkill content.`;
}

function makeExtensionYaml(overrides: Record<string, unknown> = {}) {
  const obj = {
    schema: "agentcompanies/v1",
    ...overrides,
  };
  return Object.entries(obj)
    .map(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        return `${k}:\n  ${Object.entries(v as Record<string, unknown>).map(([k2, v2]) => `${k2}: ${JSON.stringify(v2)}`).join("\n  ")}`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join("\n");
}

const baseTarget = { mode: "new_company" as const, newCompanyName: "Imported" };

describe("company portability import validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companySvc.getById.mockResolvedValue(null);
    agentSvc.list.mockResolvedValue([]);
    projectSvc.list.mockResolvedValue([]);
    companySkillSvc.listFull.mockResolvedValue([]);
  });

  describe("duplicate slug detection", () => {
    it("errors on duplicate agent slugs", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/alpha/AGENTS.md": makeAgentMarkdown({ slug: "alpha", name: "Alpha One" }),
          "agents/alpha-2/AGENTS.md": makeAgentMarkdown({ slug: "alpha", name: "Alpha Two" }),
        }),
        target: baseTarget,
        include: { agents: true },
      });

      expect(result.errors.some((e) => e.includes("Duplicate agent slug"))).toBe(true);
    });

    it("errors on duplicate project slugs", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "projects/launch/PROJECT.md": makeProjectMarkdown({ slug: "launch", name: "Launch One" }),
          "projects/launch-2/PROJECT.md": makeProjectMarkdown({ slug: "launch", name: "Launch Two" }),
        }),
        target: baseTarget,
        include: { projects: true },
      });

      expect(result.errors.some((e) => e.includes("Duplicate project slug"))).toBe(true);
    });

    it("errors on duplicate issue slugs", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "tasks/fix-bug/TASK.md": makeTaskMarkdown({ slug: "fix-bug", title: "Fix Bug One" }),
          "tasks/fix-bug-2/TASK.md": makeTaskMarkdown({ slug: "fix-bug", title: "Fix Bug Two" }),
        }),
        target: baseTarget,
        include: { issues: true },
      });

      expect(result.errors.some((e) => e.includes("Duplicate issue slug"))).toBe(true);
    });
  });

  describe("agent reportsToSlug validation", () => {
    it("errors when reportsToSlug references non-existent agent", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/junior/AGENTS.md": makeAgentMarkdown({ slug: "junior", name: "Junior", reportsTo: "nonexistent-lead" }),
        }),
        target: baseTarget,
        include: { agents: true },
      });

      expect(result.errors.some((e) => e.includes("reportsTo") && e.includes("nonexistent-lead"))).toBe(true);
    });

    it("passes when reportsToSlug references existing agent", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/lead/AGENTS.md": makeAgentMarkdown({ slug: "lead", name: "Lead" }),
          "agents/junior/AGENTS.md": makeAgentMarkdown({ slug: "junior", name: "Junior", reportsTo: "lead" }),
        }),
        target: baseTarget,
        include: { agents: true },
      });

      expect(result.errors.some((e) => e.includes("reportsTo"))).toBe(false);
    });

    it("passes when reportsToSlug is null", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/lead/AGENTS.md": makeAgentMarkdown({ slug: "lead", name: "Lead", reportsTo: null }),
        }),
        target: baseTarget,
        include: { agents: true },
      });

      expect(result.errors.some((e) => e.includes("reportsTo"))).toBe(false);
    });
  });

  describe("issue cross-reference validation", () => {
    it("errors when issue projectSlug references non-existent project", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "tasks/my-task/TASK.md": makeTaskMarkdown({ slug: "my-task", project: "nonexistent-project" }),
        }),
        target: baseTarget,
        include: { issues: true },
      });

      expect(result.errors.some((e) => e.includes("non-existent project"))).toBe(true);
    });

    it("errors when issue assigneeAgentSlug references non-existent agent", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/some-agent/AGENTS.md": makeAgentMarkdown({ slug: "some-agent", name: "Some Agent" }),
          "tasks/my-task/TASK.md": makeTaskMarkdown({ slug: "my-task", assignee: "ghost-agent" }),
        }),
        target: baseTarget,
        include: { issues: true, agents: true },
      });

      expect(result.errors.some((e) => e.includes("non-existent assignee"))).toBe(true);
    });

    it("passes when issue references valid project and agent", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/dev/AGENTS.md": makeAgentMarkdown({ slug: "dev", name: "Dev" }),
          "projects/launch/PROJECT.md": makeProjectMarkdown({ slug: "launch", name: "Launch" }),
          "tasks/my-task/TASK.md": makeTaskMarkdown({ slug: "my-task", project: "launch", assignee: "dev" }),
        }),
        target: baseTarget,
        include: { issues: true, agents: true, projects: true },
      });

      expect(result.errors.some((e) => e.includes("non-existent"))).toBe(false);
    });
  });

  describe("project agent reference validation", () => {
    it("warns when project leadAgentSlug references non-existent agent", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/some-agent/AGENTS.md": makeAgentMarkdown({ slug: "some-agent", name: "Some Agent" }),
          "projects/launch/PROJECT.md": makeProjectMarkdown({ slug: "launch", name: "Launch" }),
          ".paperclip.yaml": `schema: agentcompanies/v1
projects:
  launch:
    leadAgentSlug: "ghost-lead"
`,
        }),
        target: baseTarget,
        include: { projects: true, agents: true },
      });

      expect(result.warnings.some((w) => w.includes("lead agent"))).toBe(true);
    });

    it("warns when project ownerAgentSlug references non-existent agent", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/some-agent/AGENTS.md": makeAgentMarkdown({ slug: "some-agent", name: "Some Agent" }),
          "projects/launch/PROJECT.md": makeProjectMarkdown({ slug: "launch", name: "Launch", owner: "ghost-owner" }),
        }),
        target: baseTarget,
        include: { projects: true, agents: true },
      });

      expect(result.warnings.some((w) => w.includes("owner agent"))).toBe(true);
    });
  });

  describe("enum validation", () => {
    it("warns on unrecognized agent role", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "agents/weird/AGENTS.md": makeAgentMarkdown({ slug: "weird", name: "Weird", role: "unicorn-whisperer" }),
        }),
        target: baseTarget,
        include: { agents: true },
      });

      expect(result.warnings.some((w) => w.includes("unrecognized role"))).toBe(true);
    });

    it("warns on unrecognized issue status", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "tasks/my-task/TASK.md": makeTaskMarkdown({ slug: "my-task" }),
          ".paperclip.yaml": `schema: agentcompanies/v1
tasks:
  my-task:
    status: "flying"
`,
        }),
        target: baseTarget,
        include: { issues: true },
      });

      expect(result.warnings.some((w) => w.includes("unrecognized status"))).toBe(true);
    });

    it("warns on unrecognized issue priority", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "tasks/my-task/TASK.md": makeTaskMarkdown({ slug: "my-task" }),
          ".paperclip.yaml": `schema: agentcompanies/v1
tasks:
  my-task:
    priority: "ultra-mega"
`,
        }),
        target: baseTarget,
        include: { issues: true },
      });

      expect(result.warnings.some((w) => w.includes("unrecognized priority"))).toBe(true);
    });
  });

  describe("recurring task validation", () => {
    it("errors when recurring task has no project", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "tasks/daily-report/TASK.md": makeTaskMarkdown({
            slug: "daily-report",
            recurring: true,
            assignee: "agent-1",
          }),
        }),
        target: baseTarget,
        include: { issues: true },
      });

      expect(result.errors.some((e) => e.includes("Recurring task") && e.includes("must declare a project"))).toBe(true);
    });

    it("errors when recurring task has no assignee", async () => {
      const svc = await createService();
      const result = await svc.previewImport({
        source: makeInlineSource({
          "COMPANY.md": makeCompanyMarkdown(),
          "projects/proj/PROJECT.md": makeProjectMarkdown({ slug: "proj", name: "Proj" }),
          "tasks/daily-report/TASK.md": makeTaskMarkdown({
            slug: "daily-report",
            recurring: true,
            project: "proj",
          }),
        }),
        target: baseTarget,
        include: { issues: true, projects: true },
      });

      expect(result.errors.some((e) => e.includes("Recurring task") && e.includes("must declare an assignee"))).toBe(true);
    });
  });
});
