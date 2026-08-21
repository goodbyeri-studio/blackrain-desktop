import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import Keyboard from "lucide-react/dist/esm/icons/keyboard";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import Info from "lucide-react/dist/esm/icons/info";
import UserRound from "lucide-react/dist/esm/icons/user-round";
import { PanelNavItem, PanelNavList } from "@/features/design-system/components/panel/PanelPrimitives";
import { useI18n } from "@/i18n";
import type { CodexSection } from "./settingsTypes";
import { SETTINGS_SECTION_LABEL_KEYS } from "./settingsViewConstants";

type SettingsNavProps = {
  activeSection: CodexSection;
  onSelectSection: (section: CodexSection) => void;
  showDisclosure?: boolean;
};

export function SettingsNav({
  activeSection,
  onSelectSection,
  showDisclosure = false,
}: SettingsNavProps) {
  const { t } = useI18n();
  const label = (section: CodexSection) => t(SETTINGS_SECTION_LABEL_KEYS[section]);

  return (
    <aside className="settings-sidebar">
      <PanelNavList className="settings-nav-list">
        <PanelNavItem
          className="settings-nav"
          icon={<UserRound aria-hidden />}
          active={activeSection === "account"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("account")}
        >
          {label("account")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<LayoutGrid aria-hidden />}
          active={activeSection === "projects"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("projects")}
        >
          {label("projects")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<SlidersHorizontal aria-hidden />}
          active={activeSection === "display"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("display")}
        >
          {label("display")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<FileText aria-hidden />}
          active={activeSection === "composer"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("composer")}
        >
          {label("composer")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Keyboard aria-hidden />}
          active={activeSection === "shortcuts"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("shortcuts")}
        >
          {label("shortcuts")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<GitBranch aria-hidden />}
          active={activeSection === "git"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("git")}
        >
          {label("git")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<FlaskConical aria-hidden />}
          active={activeSection === "features"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("features")}
        >
          {label("features")}
        </PanelNavItem>
        <PanelNavItem
          className="settings-nav"
          icon={<Info aria-hidden />}
          active={activeSection === "about"}
          showDisclosure={showDisclosure}
          onClick={() => onSelectSection("about")}
        >
          {label("about")}
        </PanelNavItem>
      </PanelNavList>
    </aside>
  );
}
