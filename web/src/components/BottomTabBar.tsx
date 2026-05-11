import type { ReactNode } from "react";
import type { AppViewId, TabId } from "../theme/tokens";

type TabItem = {
  id: TabId;
  label: string;
  icon: ReactNode;
};

const tabItems: TabItem[] = [
  { id: "home", label: "Home", icon: <HomeIcon /> },
  { id: "sets", label: "Sets", icon: <LibraryIcon /> },
  { id: "explore", label: "Explore", icon: <SearchIcon /> },
  { id: "stats", label: "Stats", icon: <StatsIcon /> },
];

type BottomTabBarProps = {
  activeTab: AppViewId;
  onTabChange: (tab: TabId) => void;
};

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabItems.map((item) => {
        const selected = item.id === activeTab;
        return (
          <button
            key={item.id}
            type="button"
            className={`tab-btn ${selected ? "active" : ""}`}
            aria-current={selected ? "page" : undefined}
            onClick={() => onTabChange(item.id)}
          >
            <span aria-hidden className="tab-icon">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M5 10.5 12 5l7 5.5" />
      <path d="M7 10v9h10v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <rect x="5" y="5" width="6" height="6" rx="1" />
      <rect x="13" y="5" width="6" height="6" rx="1" />
      <rect x="5" y="13" width="6" height="6" rx="1" />
      <rect x="13" y="13" width="6" height="6" rx="1" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4 4" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M6 19V9" />
      <path d="M12 19V5" />
      <path d="M18 19v-7" />
    </svg>
  );
}
