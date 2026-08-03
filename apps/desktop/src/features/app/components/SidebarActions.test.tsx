// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarActions } from "./SidebarActions";

describe("SidebarActions", () => {
  it("只展示已接通的入口", () => {
    const onNewConversation = vi.fn();
    render(<SidebarActions onNewConversation={onNewConversation} />);

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));

    expect(onNewConversation).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Scheduled")).toBeNull();
    expect(screen.queryByText("Plugins")).toBeNull();
  });
});
