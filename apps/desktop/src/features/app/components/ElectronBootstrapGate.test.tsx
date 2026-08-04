// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlackRainHostApi } from "../../../../electron/shared/host-api";
import { ElectronBootstrapGate } from "./ElectronBootstrapGate";

afterEach(() => {
  delete window.blackrain;
});

describe("ElectronBootstrapGate", () => {
  it("degraded 时保留产品 UI，并提供重试和诊断导出", async () => {
    const initialize = vi.fn(async () => ({
      phase: "degraded" as const,
      attempt: 1,
      codexHomeId: "0123456789abcdef",
      error: "app-server unavailable",
    }));
    const retry = vi.fn(async () => ({
      phase: "ready" as const,
      attempt: 2,
      codexHomeId: "0123456789abcdef",
      error: null,
    }));
    const exportDiagnostics = vi.fn(async () => "C:\\Temp\\diagnostics.json");
    window.blackrain = {
      app: { getBootstrap: vi.fn(), initialize, retry, exportDiagnostics },
    } as unknown as BlackRainHostApi;

    render(
      <ElectronBootstrapGate>
        <div data-testid="product-ui">product</div>
      </ElectronBootstrapGate>,
    );

    expect(screen.getByTestId("product-ui")).toBeTruthy();
    expect(await screen.findByText("Electron runtime 暂时不可用")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "导出诊断" }));
    });
    expect(await screen.findByText(/diagnostics\.json/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "重试" }));
    });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Electron runtime 暂时不可用")).toBeNull();
  });
});
