// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkSurfaceBoundary } from "./WorkSurfaceBoundary";

const caughtErrorOptions = { onCaughtError: () => undefined };

describe("WorkSurfaceBoundary", () => {
  afterEach(cleanup);

  it("isolates a WORK render failure and lets the user return to CODE", () => {
    const onClose = vi.fn();
    const BrokenWork = () => {
      throw new Error("sensitive task content must not be rendered");
    };
    render(
      <div>
        <span data-testid="code-surface">CODE remains mounted</span>
        <WorkSurfaceBoundary onClose={onClose}>
          <BrokenWork />
        </WorkSurfaceBoundary>
      </div>,
      caughtErrorOptions,
    );

    expect(screen.getByTestId("code-surface")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).not.toContain(
      "sensitive task content",
    );
    fireEvent.click(screen.getByRole("button", { name: "返回 CODE" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can retry the WORK subtree without replacing the surrounding CODE tree", () => {
    let shouldThrow = true;
    const RecoverableWork = () => {
      if (shouldThrow) {
        throw new Error("transient WORK render failure");
      }
      return <span>WORK recovered</span>;
    };
    render(
      <div>
        <span data-testid="code-surface">CODE remains mounted</span>
        <WorkSurfaceBoundary
          onClose={vi.fn()}
          onRetry={() => {
            shouldThrow = false;
          }}
        >
          <RecoverableWork />
        </WorkSurfaceBoundary>
      </div>,
      caughtErrorOptions,
    );

    const codeSurface = screen.getByTestId("code-surface");
    fireEvent.click(screen.getByRole("button", { name: "重试 WORK" }));
    expect(screen.getByText("WORK recovered")).toBeTruthy();
    expect(screen.getByTestId("code-surface")).toBe(codeSurface);
  });
});
