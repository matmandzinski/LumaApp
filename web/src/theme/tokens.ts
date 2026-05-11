export const tabs = ["home", "sets", "explore", "stats"] as const;

export type TabId = (typeof tabs)[number];
export type AppViewId = TabId | "settings";

export const themeTokens = {
  color: {
    background: "#f5f6f4",
    surface: "#ffffff",
    surfaceMuted: "#eef2ef",
    textPrimary: "#1f2933",
    textSecondary: "#62707f",
    accent: "#5f8f82",
    accentStrong: "#4a7569",
    border: "#dce3df",
    success: "#5f8f82",
  },
  radius: {
    sm: "12px",
    md: "16px",
    lg: "24px",
    pill: "999px",
  },
  spacing: {
    xs: "6px",
    sm: "10px",
    md: "14px",
    lg: "18px",
    xl: "24px",
  },
  shadow: {
    soft: "0 8px 24px rgba(22, 33, 28, 0.08)",
    subtle: "0 3px 10px rgba(22, 33, 28, 0.06)",
  },
  motion: {
    fast: "150ms ease",
    normal: "220ms ease",
  },
} as const;
