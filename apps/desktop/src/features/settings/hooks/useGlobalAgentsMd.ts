import { readGlobalAgentsMd, writeGlobalAgentsMd } from "@services/desktop";
import { useFileEditor } from "@/features/shared/hooks/useFileEditor";

export function useGlobalAgentsMd(enabled = true) {
  return useFileEditor({
    key: enabled ? "global-agents" : null,
    read: readGlobalAgentsMd,
    write: writeGlobalAgentsMd,
    readErrorTitle: "Couldn’t load global AGENTS.md",
    writeErrorTitle: "Couldn’t save global AGENTS.md",
  });
}
