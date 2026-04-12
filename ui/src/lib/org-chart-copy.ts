type OrgChartLocale = string | null | undefined;

const orgChartCopy = {
  en: {
    orgChart: "Org Chart",
    selectCompany: "Select a company to view the org chart.",
    noHierarchy: "No organizational hierarchy defined.",
    importCompany: "Import company",
    exportCompany: "Export company",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fitToScreen: "Fit to screen",
    fitChartToScreen: "Fit chart to screen",
    fit: "Fit",
  },
  "zh-CN": {
    orgChart: "组织架构图",
    selectCompany: "请选择一个公司以查看组织架构图。",
    noHierarchy: "还没有定义组织层级结构。",
    importCompany: "导入公司",
    exportCompany: "导出公司",
    zoomIn: "放大",
    zoomOut: "缩小",
    fitToScreen: "适配屏幕",
    fitChartToScreen: "让组织图适配屏幕",
    fit: "适配",
  },
} as const;

const zhRoleLabels: Record<string, string> = {
  ceo: "首席执行官",
  cto: "首席技术官",
  cmo: "首席营销官",
  cfo: "首席财务官",
  engineer: "工程师",
  designer: "设计师",
  pm: "产品经理",
  qa: "测试",
  devops: "运维",
  researcher: "研究员",
  general: "通用",
};

const orgCopyTranslations: Record<string, string> = {
  CEO: "首席执行官",
  CTO: "首席技术官",
  CMO: "首席营销官",
  CFO: "首席财务官",
  General: "通用",
  "Chief Executive Officer": "首席执行官",
  "Chief Technology Officer": "首席技术官",
  "Chief Marketing Officer": "首席营销官",
  "Chief Financial Officer": "首席财务官",
  "Owns technical roadmap, architecture, staffing, execution": "负责技术路线、架构、团队配置与执行",
  "Owns company direction, hiring, capital allocation": "负责公司方向、招聘和资源配置",
  "Owns go-to-market, positioning, campaigns, growth": "负责市场进入、品牌定位、营销活动与增长",
  "Owns finance, forecasts, reporting, controls": "负责财务、预测、报告与内控",
};

function resolveLocale(locale: OrgChartLocale) {
  return locale === "zh-CN" ? "zh-CN" : "en";
}

export function getOrgChartCopy(locale: OrgChartLocale) {
  return orgChartCopy[resolveLocale(locale)];
}

export function translateOrgCopy(value: string, locale: OrgChartLocale): string {
  if (locale !== "zh-CN") return value;
  return orgCopyTranslations[value] ?? value;
}

export function translateOrgAdapterLabel(value: string, locale: OrgChartLocale): string {
  if (locale !== "zh-CN") return value;
  return value.replace(" (local)", "（本地）").replace(" (gateway)", "（网关）");
}

export function orgRoleLabel(role: string, labels: Record<string, string>, locale: OrgChartLocale): string {
  if (locale === "zh-CN") {
    return zhRoleLabels[role] ?? role;
  }
  return labels[role] ?? role;
}
