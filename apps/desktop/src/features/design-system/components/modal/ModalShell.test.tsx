// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { ModalShell } from "./ModalShell";

describe("ModalShell", () => {
  afterEach(() => cleanup());

  it("renders root and card classes and handles backdrop click", () => {
    const onBackdropClick = vi.fn();
    const { container } = render(
      <ModalShell
        className="custom-modal"
        cardClassName="custom-card"
        onBackdropClick={onBackdropClick}
        ariaLabel="My dialog"
      >
        <div>Modal content</div>
      </ModalShell>,
    );

    const modal = container.querySelector(".ds-modal.custom-modal");
    const card = container.querySelector(".ds-modal-card.custom-card");
    const backdrop = container.querySelector(".ds-modal-backdrop");
    expect(modal).toBeTruthy();
    expect(card).toBeTruthy();
    expect(backdrop).toBeTruthy();
    if (!backdrop) {
      throw new Error("Expected modal backdrop");
    }
    expect(modal?.getAttribute("aria-label")).toBe("My dialog");
    fireEvent.click(backdrop);
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  it("supports aria-labelledby and aria-describedby", () => {
    const { container } = render(
      <ModalShell ariaLabelledBy="dialog-title" ariaDescribedBy="dialog-description">
        <h2 id="dialog-title">Dialog title</h2>
        <p id="dialog-description">Dialog description</p>
      </ModalShell>,
    );

    const modal = container.querySelector(".ds-modal");
    expect(modal?.getAttribute("aria-labelledby")).toBe("dialog-title");
    expect(modal?.getAttribute("aria-describedby")).toBe("dialog-description");
  });

  it("moves focus into the dialog, traps Tab, handles Escape, and restores focus", () => {
    const onEscapeKeyDown = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <ModalShell ariaLabel="Keyboard dialog" onEscapeKeyDown={onEscapeKeyDown}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </ModalShell>,
    );

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(document.activeElement).toBe(first);
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
