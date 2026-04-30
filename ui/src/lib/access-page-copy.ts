import type { PermissionKey } from "@paperclipai/shared";
import type { CompanyMember } from "@/api/access";

type CopyLocale = string | null | undefined;
type HumanRole = NonNullable<CompanyMember["membershipRole"]>;
type MemberStatus = CompanyMember["status"] | "pending" | "active" | "suspended";

function isZh(locale: CopyLocale) {
  return locale === "zh-CN";
}

export const accessPermissionLabels: Record<"en" | "zh-CN", Record<PermissionKey, string>> = {
  en: {
    "agents:create": "Create agents",
    "users:invite": "Invite humans and agents",
    "users:manage_permissions": "Manage members and grants",
    "tasks:assign": "Assign tasks",
    "tasks:assign_scope": "Assign scoped tasks",
    "tasks:manage_active_checkouts": "Manage active task checkouts",
    "joins:approve": "Approve join requests",
    "environments:manage": "Manage environments",
  },
  "zh-CN": {
    "agents:create": "创建智能体",
    "users:invite": "邀请人员和智能体",
    "users:manage_permissions": "管理成员和授权",
    "tasks:assign": "分配任务",
    "tasks:assign_scope": "分配限定范围任务",
    "tasks:manage_active_checkouts": "管理活跃任务签出",
    "joins:approve": "审批加入请求",
    "environments:manage": "管理环境",
  },
};

const roleLabels: Record<"en" | "zh-CN", Record<HumanRole, string>> = {
  en: {
    owner: "Owner",
    admin: "Admin",
    operator: "Operator",
    viewer: "Viewer",
  },
  "zh-CN": {
    owner: "所有者",
    admin: "管理员",
    operator: "操作员",
    viewer: "查看者",
  },
};

const memberStatusLabels: Record<string, Record<string, string>> = {
  en: {
    active: "active",
    pending: "pending",
    suspended: "suspended",
  },
  "zh-CN": {
    active: "活跃",
    pending: "待处理",
    suspended: "已暂停",
  },
};

export function getAccessPermissionLabels(locale: CopyLocale) {
  return accessPermissionLabels[isZh(locale) ? "zh-CN" : "en"];
}

export function formatAccessRoleLabel(role: CompanyMember["membershipRole"], locale: CopyLocale) {
  if (!role) return isZh(locale) ? "未设置" : "Unset";
  return roleLabels[isZh(locale) ? "zh-CN" : "en"][role];
}

export function formatAccessMemberStatus(status: MemberStatus, locale: CopyLocale) {
  return memberStatusLabels[isZh(locale) ? "zh-CN" : "en"][status] ?? status.replace("_", " ");
}

export function formatAccessGrantSummary(member: CompanyMember, locale: CopyLocale) {
  if (member.grants.length === 0) return isZh(locale) ? "没有显式授权" : "No explicit grants";
  const labels = getAccessPermissionLabels(locale);
  return member.grants.map((grant) => labels[grant.permissionKey]).join(isZh(locale) ? "，" : ", ");
}

export function formatInviteContext(
  invite: { allowedJoinTypes: string; humanRole?: string | null } | null | undefined,
  locale: CopyLocale,
) {
  if (!invite) return isZh(locale) ? "邀请元数据不可用" : "Invite metadata unavailable";
  if (isZh(locale)) {
    const type = invite.allowedJoinTypes === "human" ? "人员" : invite.allowedJoinTypes === "agent" ? "智能体" : invite.allowedJoinTypes;
    return `${type}加入邀请${invite.humanRole ? ` · 默认角色 ${formatAccessRoleLabel(invite.humanRole as HumanRole, locale)}` : ""}`;
  }
  return `${invite.allowedJoinTypes} join invite${invite.humanRole ? ` • default role ${invite.humanRole}` : ""}`;
}

export function formatSubmittedAt(date: string | Date, locale: CopyLocale) {
  const value = new Date(date).toLocaleString(isZh(locale) ? "zh-CN" : undefined);
  return isZh(locale) ? `提交于 ${value}` : `Submitted ${value}`;
}

export function formatOpenAssignedIssueCount(count: number, locale: CopyLocale) {
  if (isZh(locale)) return `${count} 个未完成的已分配任务`;
  return `${count} open assigned issue${count === 1 ? "" : "s"}`;
}

export function formatMoreIssues(count: number, locale: CopyLocale) {
  if (isZh(locale)) return `还有 ${count} 个任务`;
  return `${count} more issue${count === 1 ? "" : "s"}`;
}

export function formatReassignedIssueCleanup(count: number, locale: CopyLocale) {
  if (count <= 0) return undefined;
  if (isZh(locale)) return `已清理 ${count} 个已分配任务。`;
  return `${count} assigned issue${count === 1 ? "" : "s"} cleaned up.`;
}

export function formatMembershipCount(count: number, locale: CopyLocale) {
  if (isZh(locale)) return `${count} 个活跃公司成员身份`;
  return `${count} active company membership${count === 1 ? "" : "s"}`;
}

export function formatCompanyAccessMembership(role: string | null | undefined, status: string, locale: CopyLocale) {
  const roleLabel = role ? formatAccessRoleLabel(role as HumanRole, locale) : (isZh(locale) ? "未设置" : "unset");
  const statusLabel = formatAccessMemberStatus(status as MemberStatus, locale);
  return isZh(locale) ? `${roleLabel} · ${statusLabel}` : `${roleLabel} • ${statusLabel}`;
}

export function formatJoinRequestStatus(status: string, locale: CopyLocale) {
  if (!isZh(locale)) return status.replace("_", " ");
  switch (status) {
    case "pending_approval":
      return "待审批";
    case "approved":
      return "已批准";
    case "rejected":
      return "已拒绝";
    default:
      return status;
  }
}

export function formatJoinRequestType(type: string, locale: CopyLocale) {
  if (!isZh(locale)) return type;
  switch (type) {
    case "human":
      return "人员";
    case "agent":
      return "智能体";
    case "all":
      return "全部";
    default:
      return type;
  }
}

export function formatInviteState(state: "active" | "accepted" | "expired" | "revoked", locale: CopyLocale) {
  if (!isZh(locale)) return state.charAt(0).toUpperCase() + state.slice(1);
  switch (state) {
    case "active":
      return "有效";
    case "accepted":
      return "已接受";
    case "expired":
      return "已过期";
    case "revoked":
      return "已撤销";
  }
}

export function formatSelectedFiles(count: number, total: number, locale: CopyLocale) {
  if (isZh(locale)) return `已选择 ${count} / ${total} 个文件`;
  return `${count} / ${total} file${total === 1 ? "" : "s"} selected`;
}

export function formatFileCount(count: number, locale: CopyLocale) {
  if (isZh(locale)) return `${count} 个文件`;
  return `${count} file${count === 1 ? "" : "s"}`;
}

export function getAccessPageCopy(locale: CopyLocale) {
  if (isZh(locale)) {
    return {
      common: {
        company: "公司",
        settings: "设置",
        access: "访问权限",
        invites: "邀请",
        inbox: "收件箱",
        joinRequests: "加入请求",
        unknownError: "未知错误",
        cancel: "取消",
        save: "保存",
        saving: "保存中…",
        edit: "编辑",
        remove: "移除",
        removing: "移除中...",
        inactive: "非活跃",
        noEmail: "无邮箱",
      },
      companyAccess: {
        title: "公司访问权限",
        description: (companyName?: string) => `管理${companyName ? ` ${companyName} 的` : ""}公司成员、成员状态和显式权限授权。`,
        selectCompany: "选择一个公司后再管理访问权限。",
        loading: "正在加载公司访问权限…",
        forbidden: "你没有权限管理公司成员。",
        failedLoad: "加载公司成员失败。",
        instanceAdminNotice: "此账号可通过实例管理员权限在这里管理访问权限，但当前没有活跃的公司成员身份。",
        humans: "人员",
        humansDescription: "在这里管理人员公司成员身份、状态和授权。",
        pendingHumanJoins: "待审批人员加入",
        pendingHumanJoinsDescription: "先审批人员加入请求，再让他们成为活跃公司成员。",
        pending: "待处理",
        unknownHumanRequester: "未知人员请求者",
        noEmailAvailable: "无可用邮箱",
        approveHuman: "批准人员",
        rejectHuman: "拒绝人员",
        userAccount: "用户账号",
        role: "角色",
        status: "状态",
        grants: "授权",
        action: "操作",
        noMemberships: "此公司尚无用户成员身份。",
        memberUpdated: "成员已更新",
        failedUpdateMember: "更新成员失败",
        joinRequestApproved: "加入请求已批准",
        failedApproveJoinRequest: "批准加入请求失败",
        joinRequestRejected: "加入请求已拒绝",
        failedRejectJoinRequest: "拒绝加入请求失败",
        memberRemoved: "成员已移除",
        failedRemoveMember: "移除成员失败",
        editMember: "编辑成员",
        editMemberDescription: (name: string) => `更新 ${name} 的公司角色、成员状态和显式授权。`,
        companyRole: "公司角色",
        membershipStatus: "成员状态",
        active: "活跃",
        suspended: "已暂停",
        grantsDescription: "角色会自动提供隐式授权。下面的显式授权只用于覆盖和额外权限，并会在角色变化后继续保留。",
        implicitGrants: "角色隐式授权",
        implicitGrantsForRole: (role: string) => `${role} 当前会自动包含这些权限。`,
        noImplicitGrants: "当前未选择角色，因此此成员现在没有隐式授权。",
        includedImplicitly: (role: string) => `已由 ${role} 角色隐式包含。只有在角色变化后仍需保留时才添加显式授权。`,
        storedExplicitly: "已为此成员显式保存。",
        saveAccess: "保存访问权限",
        removeMember: "移除成员",
        removeMemberDescription: (name: string) => `归档 ${name}，并在从分配字段中隐藏此用户之前迁移其活跃任务。`,
        checkingAssignedIssues: "正在检查已分配任务...",
        issueReassignment: "任务重新分配",
        leaveUnassigned: "保留未分配",
        humansOptgroup: "人员",
        agentsOptgroup: "智能体",
        thisMember: "此成员",
      },
      invites: {
        title: "公司邀请",
        description: "创建用于公司访问的人类邀请链接。新邀请链接生成后会复制到剪贴板。",
        selectCompany: "选择一个公司后再管理邀请。",
        loading: "正在加载邀请…",
        forbidden: "你没有权限管理公司邀请。",
        failedLoad: "加载邀请失败。",
        clipboardUnavailable: "剪贴板不可用",
        clipboardUnavailableBody: "请从下面字段手动复制邀请 URL。",
        inviteCreated: "邀请已创建",
        inviteReadyCopied: "邀请已在下方生成，并已复制到剪贴板。",
        inviteReady: "邀请已在下方生成。",
        failedCreateInvite: "创建邀请失败",
        inviteRevoked: "邀请已撤销",
        failedRevokeInvite: "撤销邀请失败",
        createInvite: "创建邀请",
        createInviteDescription: "生成人类邀请链接，并选择它默认请求的访问权限。",
        chooseRole: "选择角色",
        default: "默认",
        singleUseNotice: "每个邀请链接只能使用一次。首次成功使用会消耗该链接，并在审批前创建或复用对应的加入请求。",
        creating: "创建中…",
        createInviteButton: "创建邀请",
        historyAuditTrail: "下方邀请历史会保留审计记录。",
        latestInviteLink: "最新邀请链接",
        copied: "已复制",
        domainNotice: "此 URL 包含服务器返回的当前 Paperclip 域名。",
        openInvite: "打开邀请",
        inviteHistory: "邀请历史",
        inviteHistoryDescription: "查看邀请状态、角色、邀请人，以及关联的加入请求。",
        openJoinRequestQueue: "打开加入请求队列",
        noInvites: "此公司尚未创建邀请。",
        state: "状态",
        role: "角色",
        invitedBy: "邀请人",
        created: "创建时间",
        joinRequest: "加入请求",
        action: "操作",
        unknownInviter: "未知邀请人",
        reviewRequest: "查看请求",
        revoke: "撤销",
        loadingMore: "加载更多…",
        viewMore: "查看更多",
        roleOptions: {
          viewer: {
            label: "查看者",
            description: "可以查看公司工作并跟进进展，但没有操作权限。",
            gets: "无内置授权。",
          },
          operator: {
            label: "操作员",
            description: "推荐给需要协助推进工作但不管理访问权限的人。",
            gets: "可以分配任务。",
          },
          admin: {
            label: "管理员",
            description: "推荐给需要邀请人员、创建智能体和审批加入的运营者。",
            gets: "可以创建智能体、邀请用户、分配任务并审批加入请求。",
          },
          owner: {
            label: "所有者",
            description: "完整公司访问权限，包括成员和权限管理。",
            gets: "包含管理员全部权限，并可管理成员和授权。",
          },
        },
      },
      joinQueue: {
        title: "加入请求队列",
        description: "在混合收件箱之外审批人员和智能体加入请求。此队列使用与收件箱内联卡片相同的审批操作。",
        selectCompany: "选择一个公司后再查看加入请求。",
        loading: "正在加载加入请求…",
        forbidden: "你没有权限查看此公司的加入请求。",
        failedLoad: "加载加入请求失败。",
        approved: "加入请求已批准",
        rejected: "加入请求已拒绝",
        status: "状态",
        requestType: "请求类型",
        pendingApproval: "待审批",
        approve: "批准",
        reject: "拒绝",
        noMatches: "没有匹配当前筛选条件的加入请求。",
        unknownHumanRequester: "未知人员请求者",
        unknownAgentRequester: "未知智能体请求者",
        inviteContext: "邀请上下文",
        requestDetails: "请求详情",
        metadataUnavailable: "邀请元数据不可用",
        sourceIp: "来源 IP",
      },
      profile: {
        breadcrumbsProfile: "个人资料",
        loading: "正在加载个人资料...",
        failedLoad: "加载个人资料失败。",
        title: "个人资料",
        description: "控制你的账号在侧边栏和其他看板界面中的显示方式。",
        failedUpdate: "更新个人资料失败。",
        selectCompanyBeforeAvatar: "上传头像前请先选择公司。",
        failedUploadAvatar: "上传头像失败。",
        failedRemoveAvatar: "移除头像失败。",
        storedInCompany: (company: string) => `存储在 ${company} 的 Paperclip 文件存储中。`,
        selectCompanyToUpload: "选择公司后可将头像上传到 Paperclip 存储。",
        clickAvatar: "点击头像上传新图片。",
        changePhoto: "更换照片",
        uploadPhoto: "上传照片",
        remove: "移除",
        displayName: "显示名称",
        displayNameHelp: "显示在侧边栏账号页脚和评论作者信息中。",
        email: "邮箱",
        emailHelp: "邮箱由认证会话管理，此处只读。",
        saving: "保存中...",
        saveProfile: "保存个人资料",
        noEmail: "无邮箱",
        boardFallback: "看板",
      },
      instanceAccess: {
        title: "实例访问权限",
        description: "搜索用户、管理实例管理员状态，并控制他们可访问哪些公司。",
        loading: "正在加载实例用户…",
        forbidden: "需要实例管理员权限才能管理用户。",
        failedLoadUsers: "加载用户失败。",
        companyAccessUpdated: "公司访问权限已更新",
        instanceRoleUpdated: "实例角色已更新",
        noUserSelected: "未选择用户",
        searchUsers: "搜索用户",
        searchPlaceholder: "按姓名或邮箱搜索",
        selectUser: "选择用户以查看实例访问权限。",
        loadingUserAccess: "正在加载用户访问权限…",
        failedLoadUserAccess: "加载用户访问权限失败。",
        removeAdmin: "移除实例管理员",
        promoteAdmin: "提升为实例管理员",
        companyAccess: "公司访问权限",
        companyAccessDescription: "切换此用户的公司成员身份。新增访问默认创建活跃的操作员成员身份。",
        saveCompanyAccess: "保存公司访问权限",
        currentMemberships: "当前成员身份",
      },
      dashboardLive: {
        dashboard: "仪表板",
        liveRuns: "实时运行",
        createCompany: "创建公司后查看实时运行。",
        selectCompany: "选择公司后查看实时运行。",
        title: "实时智能体运行",
        description: "活跃运行优先显示，之后显示最近完成的运行。",
        showingLimit: (limit: number) => `最多显示 ${limit} 条`,
        activeRecent: "活跃 / 最近",
        empty: "暂无活跃或最近的智能体运行。",
      },
      newAgent: {
        agents: "智能体",
        title: "新建智能体",
        description: "高级智能体配置",
        agentName: "智能体名称",
        titlePlaceholder: "职务（例如：工程副总裁）",
        failedCreate: "创建智能体失败",
        opencodeRequiresModel: "OpenCode 需要明确的 provider/model 格式模型。",
        failedLoadOpenCodeModels: "加载 OpenCode 模型失败。",
        opencodeLoading: "OpenCode 模型仍在加载中。请稍后重试。",
        noOpenCodeModels: "未发现 OpenCode 模型。请运行 `opencode models` 并完成提供商认证。",
        unavailableModel: (model: string) => `配置的 OpenCode 模型不可用：${model}`,
        companySkills: "公司技能",
        companySkillsDescription: "来自公司技能库的可选技能。内置 Paperclip 运行时技能会自动添加。",
        noOptionalSkills: "尚未安装可选公司技能。",
        firstAgentCeo: "这将是 CEO",
        createAgent: "创建智能体",
        creating: "创建中…",
      },
      workspaces: {
        title: "工作区",
        noActivity: "暂无工作区活动。",
        workspaceCount: (count: number) => `${count} 个工作区`,
      },
    } as const;
  }

  return {
    common: {
      company: "Company",
      settings: "Settings",
      access: "Access",
      invites: "Invites",
      inbox: "Inbox",
      joinRequests: "Join Requests",
      unknownError: "Unknown error",
      cancel: "Cancel",
      save: "Save",
      saving: "Saving…",
      edit: "Edit",
      remove: "Remove",
      removing: "Removing...",
      inactive: "Inactive",
      noEmail: "No email",
    },
    companyAccess: {
      title: "Company Access",
      description: (companyName?: string) =>
        companyName
          ? `Manage company user memberships, membership status, and explicit permission grants for ${companyName}.`
          : "Manage company user memberships, membership status, and explicit permission grants.",
      selectCompany: "Select a company to manage access.",
      loading: "Loading company access…",
      forbidden: "You do not have permission to manage company members.",
      failedLoad: "Failed to load company members.",
      instanceAdminNotice: "This account can manage access here through instance-admin privileges, but it does not currently hold an active company membership.",
      humans: "Humans",
      humansDescription: "Manage human company memberships, status, and grants here.",
      pendingHumanJoins: "Pending human joins",
      pendingHumanJoinsDescription: "Review human join requests before they become active company members.",
      pending: "pending",
      unknownHumanRequester: "Unknown human requester",
      noEmailAvailable: "No email available",
      approveHuman: "Approve human",
      rejectHuman: "Reject human",
      userAccount: "User account",
      role: "Role",
      status: "Status",
      grants: "Grants",
      action: "Action",
      noMemberships: "No user memberships found for this company yet.",
      memberUpdated: "Member updated",
      failedUpdateMember: "Failed to update member",
      joinRequestApproved: "Join request approved",
      failedApproveJoinRequest: "Failed to approve join request",
      joinRequestRejected: "Join request rejected",
      failedRejectJoinRequest: "Failed to reject join request",
      memberRemoved: "Member removed",
      failedRemoveMember: "Failed to remove member",
      editMember: "Edit member",
      editMemberDescription: (name: string) => `Update company role, membership status, and explicit grants for ${name}.`,
      companyRole: "Company role",
      membershipStatus: "Membership status",
      active: "Active",
      suspended: "Suspended",
      grantsDescription: "Roles provide implicit grants automatically. Explicit grants below are only for overrides and extra access that should persist even if the role changes.",
      implicitGrants: "Implicit grants from role",
      implicitGrantsForRole: (role: string) => `${role} currently includes these permissions automatically.`,
      noImplicitGrants: "No role is selected, so this member has no implicit grants right now.",
      includedImplicitly: (role: string) => `Included implicitly by the ${role} role. Add an explicit grant only if it should stay after the role changes.`,
      storedExplicitly: "Stored explicitly for this member.",
      saveAccess: "Save access",
      removeMember: "Remove member",
      removeMemberDescription: (name: string) => `Archive ${name} and move active assignments before hiding this user from assignment fields.`,
      checkingAssignedIssues: "Checking assigned issues...",
      issueReassignment: "Issue reassignment",
      leaveUnassigned: "Leave unassigned",
      humansOptgroup: "Humans",
      agentsOptgroup: "Agents",
      thisMember: "this member",
    },
    invites: {
      title: "Company Invites",
      description: "Create human invite links for company access. New invite links are copied to your clipboard when they are generated.",
      selectCompany: "Select a company to manage invites.",
      loading: "Loading invites…",
      forbidden: "You do not have permission to manage company invites.",
      failedLoad: "Failed to load invites.",
      clipboardUnavailable: "Clipboard unavailable",
      clipboardUnavailableBody: "Copy the invite URL manually from the field below.",
      inviteCreated: "Invite created",
      inviteReadyCopied: "Invite ready below and copied to clipboard.",
      inviteReady: "Invite ready below.",
      failedCreateInvite: "Failed to create invite",
      inviteRevoked: "Invite revoked",
      failedRevokeInvite: "Failed to revoke invite",
      createInvite: "Create invite",
      createInviteDescription: "Generate a human invite link and choose the default access it should request.",
      chooseRole: "Choose a role",
      default: "Default",
      singleUseNotice: "Each invite link is single-use. The first successful use consumes the link and creates or reuses the matching join request before approval.",
      creating: "Creating…",
      createInviteButton: "Create invite",
      historyAuditTrail: "Invite history below keeps the audit trail.",
      latestInviteLink: "Latest invite link",
      copied: "Copied",
      domainNotice: "This URL includes the current Paperclip domain returned by the server.",
      openInvite: "Open invite",
      inviteHistory: "Invite history",
      inviteHistoryDescription: "Review invite status, role, inviter, and any linked join request.",
      openJoinRequestQueue: "Open join request queue",
      noInvites: "No invites have been created for this company yet.",
      state: "State",
      role: "Role",
      invitedBy: "Invited by",
      created: "Created",
      joinRequest: "Join request",
      action: "Action",
      unknownInviter: "Unknown inviter",
      reviewRequest: "Review request",
      revoke: "Revoke",
      loadingMore: "Loading more…",
      viewMore: "View more",
      roleOptions: {
        viewer: {
          label: "Viewer",
          description: "Can view company work and follow along without operational permissions.",
          gets: "No built-in grants.",
        },
        operator: {
          label: "Operator",
          description: "Recommended for people who need to help run work without managing access.",
          gets: "Can assign tasks.",
        },
        admin: {
          label: "Admin",
          description: "Recommended for operators who need to invite people, create agents, and approve joins.",
          gets: "Can create agents, invite users, assign tasks, and approve join requests.",
        },
        owner: {
          label: "Owner",
          description: "Full company access, including membership and permission management.",
          gets: "Everything in Admin, plus managing members and permission grants.",
        },
      },
    },
    joinQueue: {
      title: "Join Request Queue",
      description: "Review human and agent join requests outside the mixed inbox feed. This queue uses the same approval mutations as the inline inbox cards.",
      selectCompany: "Select a company to review join requests.",
      loading: "Loading join requests…",
      forbidden: "You do not have permission to review join requests for this company.",
      failedLoad: "Failed to load join requests.",
      approved: "Join request approved",
      rejected: "Join request rejected",
      status: "Status",
      requestType: "Request type",
      pendingApproval: "Pending approval",
      approve: "Approve",
      reject: "Reject",
      noMatches: "No join requests match the current filters.",
      unknownHumanRequester: "Unknown human requester",
      unknownAgentRequester: "Unknown agent requester",
      inviteContext: "Invite context",
      requestDetails: "Request details",
      metadataUnavailable: "Invite metadata unavailable",
      sourceIp: "Source IP",
    },
    profile: {
      breadcrumbsProfile: "Profile",
      loading: "Loading profile...",
      failedLoad: "Failed to load profile.",
      title: "Profile",
      description: "Control how your account appears in the sidebar and other board surfaces.",
      failedUpdate: "Failed to update profile.",
      selectCompanyBeforeAvatar: "Select a company before uploading a profile avatar.",
      failedUploadAvatar: "Failed to upload avatar.",
      failedRemoveAvatar: "Failed to remove avatar.",
      storedInCompany: (company: string) => `Stored in Paperclip file storage for ${company}.`,
      selectCompanyToUpload: "Select a company to upload an avatar into Paperclip storage.",
      clickAvatar: "Click the avatar to upload a new image.",
      changePhoto: "Change photo",
      uploadPhoto: "Upload photo",
      remove: "Remove",
      displayName: "Display name",
      displayNameHelp: "Shown in the sidebar account footer and comment author surfaces.",
      email: "Email",
      emailHelp: "Email is managed by your auth session and is read-only here.",
      saving: "Saving...",
      saveProfile: "Save profile",
      noEmail: "No email",
      boardFallback: "Board",
    },
    instanceAccess: {
      title: "Instance Access",
      description: "Search users, manage instance-admin status, and control which companies they can access.",
      loading: "Loading instance users…",
      forbidden: "Instance admin access is required to manage users.",
      failedLoadUsers: "Failed to load users.",
      companyAccessUpdated: "Company access updated",
      instanceRoleUpdated: "Instance role updated",
      noUserSelected: "No user selected",
      searchUsers: "Search users",
      searchPlaceholder: "Search by name or email",
      selectUser: "Select a user to inspect instance access.",
      loadingUserAccess: "Loading user access…",
      failedLoadUserAccess: "Failed to load user access.",
      removeAdmin: "Remove instance admin",
      promoteAdmin: "Promote to instance admin",
      companyAccess: "Company access",
      companyAccessDescription: "Toggle company membership for this user. New access defaults to an active operator membership.",
      saveCompanyAccess: "Save company access",
      currentMemberships: "Current memberships",
    },
    dashboardLive: {
      dashboard: "Dashboard",
      liveRuns: "Live runs",
      createCompany: "Create a company to view live runs.",
      selectCompany: "Select a company to view live runs.",
      title: "Live agent runs",
      description: "Active runs first, followed by the most recent completed runs.",
      showingLimit: (limit: number) => `Showing up to ${limit}`,
      activeRecent: "Active / recent",
      empty: "No active or recent agent runs.",
    },
    newAgent: {
      agents: "Agents",
      title: "New Agent",
      description: "Advanced agent configuration",
      agentName: "Agent name",
      titlePlaceholder: "Title (e.g. VP of Engineering)",
      failedCreate: "Failed to create agent",
      opencodeRequiresModel: "OpenCode requires an explicit model in provider/model format.",
      failedLoadOpenCodeModels: "Failed to load OpenCode models.",
      opencodeLoading: "OpenCode models are still loading. Please wait and try again.",
      noOpenCodeModels: "No OpenCode models discovered. Run `opencode models` and authenticate providers.",
      unavailableModel: (model: string) => `Configured OpenCode model is unavailable: ${model}`,
      companySkills: "Company skills",
      companySkillsDescription: "Optional skills from the company library. Built-in Paperclip runtime skills are added automatically.",
      noOptionalSkills: "No optional company skills installed yet.",
      firstAgentCeo: "This will be the CEO",
      createAgent: "Create agent",
      creating: "Creating…",
    },
    workspaces: {
      title: "Workspaces",
      noActivity: "No workspace activity yet.",
      workspaceCount: (count: number) => `${count} workspace${count === 1 ? "" : "s"}`,
    },
  } as const;
}
