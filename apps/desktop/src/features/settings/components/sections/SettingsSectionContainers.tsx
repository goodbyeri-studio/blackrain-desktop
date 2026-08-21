import { SettingsComposerSection } from "./SettingsComposerSection";
import { SettingsDisplaySection } from "./SettingsDisplaySection";
import { SettingsFeaturesSection } from "./SettingsFeaturesSection";
import { SettingsGitSection } from "./SettingsGitSection";
import { SettingsProjectsSection } from "./SettingsProjectsSection";
import { SettingsShortcutsSection } from "./SettingsShortcutsSection";
import { SettingsAboutSection } from "./SettingsAboutSection";
import { SettingsAccountSection } from "./SettingsAccountSection";
import type { CodexSection } from "@settings/components/settingsTypes";
import type { SettingsViewOrchestration } from "@settings/hooks/useSettingsViewOrchestration";

type SettingsSectionContainersProps = {
  activeSection: CodexSection;
  orchestration: SettingsViewOrchestration;
};

export function SettingsSectionContainers({
  activeSection,
  orchestration,
}: SettingsSectionContainersProps) {
  if (activeSection === "account") {
    return <SettingsAccountSection />;
  }
  if (activeSection === "projects") {
    return <SettingsProjectsSection {...orchestration.projectsSectionProps} />;
  }
  if (activeSection === "display") {
    return <SettingsDisplaySection {...orchestration.displaySectionProps} />;
  }
  if (activeSection === "about") {
    return <SettingsAboutSection {...orchestration.aboutSectionProps} />;
  }
  if (activeSection === "composer") {
    return <SettingsComposerSection {...orchestration.composerSectionProps} />;
  }
  if (activeSection === "shortcuts") {
    return <SettingsShortcutsSection {...orchestration.shortcutsSectionProps} />;
  }
  if (activeSection === "git") {
    return <SettingsGitSection {...orchestration.gitSectionProps} />;
  }
  if (activeSection === "features") {
    return <SettingsFeaturesSection {...orchestration.featuresSectionProps} />;
  }
  return <SettingsAboutSection {...orchestration.aboutSectionProps} />;
}
