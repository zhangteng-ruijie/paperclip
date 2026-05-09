export type RuijieProfile = {
  attributes?: {
    GH?: string | number | null;
    XM?: string | null;
    DWM?: string | null;
    DQZTM?: string | null;
  };
};

export type RuijieMappedProfile = {
  providerAccountId: string;
  name: string;
  email: null;
  emailVerified: false;
  eligible: boolean;
  reason?: "missing_account_id" | "inactive" | "not_allowlisted";
};

function trimmedString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function mapRuijieProfile(profile: RuijieProfile): RuijieMappedProfile {
  const attributes = profile.attributes ?? {};
  const providerAccountId = trimmedString(attributes.GH);
  if (!providerAccountId) {
    return {
      providerAccountId: "",
      name: "",
      email: null,
      emailVerified: false,
      eligible: false,
      reason: "missing_account_id",
    };
  }

  if (trimmedString(attributes.DQZTM) !== "在任") {
    return {
      providerAccountId,
      name: trimmedString(attributes.XM) ?? providerAccountId,
      email: null,
      emailVerified: false,
      eligible: false,
      reason: "inactive",
    };
  }

  if (trimmedString(attributes.DWM) !== "dwm") {
    return {
      providerAccountId,
      name: trimmedString(attributes.XM) ?? providerAccountId,
      email: null,
      emailVerified: false,
      eligible: false,
      reason: "not_allowlisted",
    };
  }

  return {
    providerAccountId,
    name: trimmedString(attributes.XM) ?? providerAccountId,
    email: null,
    emailVerified: false,
    eligible: true,
  };
}
