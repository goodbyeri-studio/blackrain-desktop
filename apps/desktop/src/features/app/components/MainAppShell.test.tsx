// @vitest-environment jsdom
import { createRef, type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppModalsProps } from "@app/components/AppModals";
import { MainAppShell } from "@app/components/MainAppShell";

vi.mock("@app/components/AppLayout", () => ({
  AppLayout: () => <div data-testid="app-layout" />,
}));

vi.mock("@app/components/AppModals", () => ({
  AppModals: () => null,
}));

vi.mock("@/features/layout/components/SidebarToggleControls", () => ({
  TitlebarExpandControls: () => <div data-testid="titlebar-controls" />,
}));

vi.mock("@/features/mobile/components/MobileServerSetupWizard", () => ({
  MobileServerSetupWizard: () => null,
}));

describe("MainAppShell settings page", () => {
  it("replaces the app layout while settings are open", () => {
    const SettingsPage = () => <div data-testid="settings-page" />;
    const appModalsProps = {
      settingsOpen: true,
      settingsSection: null,
      onCloseSettings: vi.fn(),
      SettingsViewComponent: SettingsPage,
      settingsProps: {},
    } as unknown as AppModalsProps;
    const props = {
      appClassName: "app",
      isResizing: false,
      appStyle: {},
      appRef: createRef<HTMLDivElement>(),
      sidebarToggleProps: {},
      shouldLoadGitHubPanelData: false,
      gitHubPanelDataProps: {},
      appLayoutProps: {},
      appModalsProps,
      showMobileSetupWizard: false,
      mobileSetupWizardProps: {},
    } as unknown as ComponentProps<typeof MainAppShell>;

    const { rerender } = render(<MainAppShell {...props} />);

    expect(screen.getByTestId("settings-page")).toBeTruthy();
    expect(screen.queryByTestId("app-layout")).toBeNull();
    expect(screen.queryByTestId("titlebar-controls")).toBeNull();

    rerender(
      <MainAppShell
        {...props}
        appModalsProps={{ ...appModalsProps, settingsOpen: false }}
      />,
    );

    expect(screen.getByTestId("app-layout")).toBeTruthy();
    expect(screen.getByTestId("titlebar-controls")).toBeTruthy();
  });
});
