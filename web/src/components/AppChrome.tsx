import type { ReactNode } from "react";
import type { AppViewId, TabId } from "../theme/tokens";
import { BottomTabBar } from "./BottomTabBar";
import { TopBar } from "./ui";

type AppChromeProps = {
  activeTab: AppViewId;
  children: ReactNode;
  onProfileOpen: () => void;
  onTabChange: (tab: TabId) => void;
  showBottomNav: boolean;
  showTopBar?: boolean;
};

export function AppChrome({
  activeTab,
  children,
  onProfileOpen,
  onTabChange,
  showBottomNav,
  showTopBar = true,
}: AppChromeProps) {
  return (
    <div className="app-shell">
      {showTopBar ? <TopBar title="LingoFlow" onProfileOpen={onProfileOpen} /> : null}

      <main className="screen-frame">{children}</main>

      {showBottomNav ? <BottomTabBar activeTab={activeTab} onTabChange={onTabChange} /> : null}
    </div>
  );
}
