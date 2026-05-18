import type { ReactNode } from "react";
import type { AppViewId, TabId } from "../theme/tokens";
import { BottomTabBar } from "./BottomTabBar";
import { TopBar } from "./ui";
import appLogoUrl from "../../../Resources/AppLogo/LUMA-logo.png";

type AppChromeProps = {
  activeTab: AppViewId;
  children: ReactNode;
  onBack?: () => void;
  onProfileOpen: () => void;
  onTabChange: (tab: TabId) => void;
  showBottomNav: boolean;
  showTopBar?: boolean;
};

export function AppChrome({
  activeTab,
  children,
  onBack,
  onProfileOpen,
  onTabChange,
  showBottomNav,
  showTopBar = true,
}: AppChromeProps) {
  return (
    <div className={`app-shell ${showBottomNav ? "has-bottom-nav" : ""}`.trim()}>
      {showTopBar ? (
        <TopBar
          logoSrc={appLogoUrl}
          title="LumaApp"
          onBack={onBack}
          onProfileOpen={onProfileOpen}
        />
      ) : null}

      <main className="screen-frame">{children}</main>

      {showBottomNav ? <BottomTabBar activeTab={activeTab} onTabChange={onTabChange} /> : null}
    </div>
  );
}
