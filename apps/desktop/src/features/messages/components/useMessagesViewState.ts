import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ConversationItem } from "../../../types";
import { isPlanReadyTaggedMessage } from "../../../utils/internalPlanReadyMessages";
import {
  buildToolGroups,
  computePlanFollowupState,
  parseReasoning,
  scrollKeyForItems,
} from "../utils/messageRenderUtils";

// 底部「跟随区」高度(px)。底部哨兵距底这么近时仍算「在底部」→ 自动跟随。
// 由 IntersectionObserver 的 rootMargin 使用。比硬贴底宽松,符合「靠近底部就跟随」。
const BOTTOM_FOLLOW_PX = 120;

function toMarkdownQuote(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")
    .concat("\n\n");
}

type UseMessagesViewStateArgs = {
  items: ConversationItem[];
  threadId: string | null;
  isThinking: boolean;
  activeUserInputRequestId: string | number | null;
  hasVisibleUserInputRequest: boolean;
  onPlanAccept?: () => void;
  onPlanSubmitChanges?: (changes: string) => void;
  onQuoteMessage?: (text: string) => void;
};

export function useMessagesViewState({
  items,
  threadId,
  isThinking,
  activeUserInputRequestId,
  hasVisibleUserInputRequest,
  onPlanAccept,
  onPlanSubmitChanges,
  onQuoteMessage,
}: UseMessagesViewStateArgs) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // 是否自动跟随到底。由底部哨兵的 IntersectionObserver 维护(见下方 effect)。
  const autoScrollRef = useRef(true);
  const copyTimeoutRef = useRef<number | null>(null);
  const manuallyToggledExpandedRef = useRef<Set<string>>(new Set());

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [collapsedToolGroups, setCollapsedToolGroups] = useState<Set<string>>(
    new Set(),
  );
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [dismissedPlanFollowupByThread, setDismissedPlanFollowupByThread] =
    useState<Record<string, string>>({});

  const scrollKey = `${scrollKeyForItems(items)}-${activeUserInputRequestId ?? "no-input"}`;

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, []);

  const requestAutoScroll = useCallback(() => {
    if (!autoScrollRef.current) {
      return;
    }
    scrollToBottom();
  }, [scrollToBottom]);

  // ★用 IntersectionObserver 监视底部哨兵决定「是否跟随」(业界成熟方案)。
  // 哨兵距底 BOTTOM_FOLLOW_PX 以内可见 = 在底部 = 跟随;滚出 = 用户上滑 = 停。
  // 跟随状态由浏览器算的交叉状态决定,完全不读 scroll 事件、不猜阈值,无竞态:
  //   - 跟随时程序滚到底 → 哨兵一直在视口 → 持续跟随
  //   - 用户上滑 → 哨兵滚出 → 立刻停跟随,浏览器与我们都不再动它 = 稳定
  //   - 用户滚回靠近底部 → 哨兵重入视口 → 自动恢复跟随
  useEffect(() => {
    const container = containerRef.current;
    const sentinel = bottomRef.current;
    if (!container || !sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        autoScrollRef.current = entries[0]?.isIntersecting ?? false;
      },
      {
        root: container,
        rootMargin: `0px 0px ${BOTTOM_FOLLOW_PX}px 0px`,
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    // 切换线程:重置为跟随并滚到底(observer 随后按实际位置校正)。
    autoScrollRef.current = true;
    scrollToBottom();
  }, [threadId, scrollToBottom]);

  useLayoutEffect(() => {
    // 内容更新时(含流式逐字),只在「跟随」意图为真时滚到底。
    if (!autoScrollRef.current) {
      return;
    }
    scrollToBottom();
  }, [scrollKey, isThinking, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    manuallyToggledExpandedRef.current.add(id);
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleToolGroup = useCallback((id: string) => {
    setCollapsedToolGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCopyMessage = useCallback(
    async (item: Extract<ConversationItem, { kind: "message" }>) => {
      try {
        await navigator.clipboard.writeText(item.text);
        setCopiedMessageId(item.id);
        if (copyTimeoutRef.current) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopiedMessageId(null);
        }, 1200);
      } catch {
        // No-op: clipboard errors can occur in restricted contexts.
      }
    },
    [],
  );

  const handleQuoteMessage = useCallback(
    (item: Extract<ConversationItem, { kind: "message" }>, selectedText?: string) => {
      if (!onQuoteMessage) {
        return;
      }
      const sourceText = selectedText?.trim().length ? selectedText : item.text;
      const quoteText = toMarkdownQuote(sourceText);
      if (!quoteText) {
        return;
      }
      onQuoteMessage(quoteText);
    },
    [onQuoteMessage],
  );

  const reasoningMetaById = useMemo(() => {
    const meta = new Map<string, ReturnType<typeof parseReasoning>>();
    items.forEach((item) => {
      if (item.kind === "reasoning") {
        meta.set(item.id, parseReasoning(item));
      }
    });
    return meta;
  }, [items]);

  const latestReasoningLabel = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "message") {
        break;
      }
      if (item.kind !== "reasoning") {
        continue;
      }
      const parsed = reasoningMetaById.get(item.id);
      if (parsed?.workingLabel) {
        return parsed.workingLabel;
      }
    }
    return null;
  }, [items, reasoningMetaById]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (
          item.kind === "message" &&
          item.role === "user" &&
          isPlanReadyTaggedMessage(item.text)
        ) {
          return false;
        }
        if (item.kind !== "reasoning") {
          return true;
        }
        return reasoningMetaById.get(item.id)?.hasBody ?? false;
      }),
    [items, reasoningMetaById],
  );

  useEffect(() => {
    for (let index = visibleItems.length - 1; index >= 0; index -= 1) {
      const item = visibleItems[index];
      if (
        item.kind === "tool" &&
        item.toolType === "plan" &&
        (item.output ?? "").trim().length > 0
      ) {
        if (manuallyToggledExpandedRef.current.has(item.id)) {
          return;
        }
        setExpandedItems((prev) => {
          if (prev.has(item.id)) {
            return prev;
          }
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        return;
      }
    }
  }, [visibleItems]);

  const groupedItems = useMemo(() => buildToolGroups(visibleItems), [visibleItems]);

  const planFollowup = useMemo(() => {
    if (!onPlanAccept || !onPlanSubmitChanges) {
      return { shouldShow: false, planItemId: null };
    }

    const candidate = computePlanFollowupState({
      threadId,
      items,
      isThinking,
      hasVisibleUserInputRequest,
    });

    if (threadId && candidate.planItemId) {
      if (dismissedPlanFollowupByThread[threadId] === candidate.planItemId) {
        return { ...candidate, shouldShow: false };
      }
    }

    return candidate;
  }, [
    dismissedPlanFollowupByThread,
    hasVisibleUserInputRequest,
    isThinking,
    items,
    onPlanAccept,
    onPlanSubmitChanges,
    threadId,
  ]);

  const dismissPlanFollowup = useCallback(() => {
    if (!threadId || !planFollowup.planItemId) {
      return;
    }
    setDismissedPlanFollowupByThread((prev) => ({
      ...prev,
      [threadId]: planFollowup.planItemId!,
    }));
  }, [planFollowup.planItemId, threadId]);

  return {
    bottomRef,
    containerRef,
    requestAutoScroll,
    expandedItems,
    toggleExpanded,
    collapsedToolGroups,
    toggleToolGroup,
    copiedMessageId,
    handleCopyMessage,
    handleQuoteMessage,
    reasoningMetaById,
    latestReasoningLabel,
    groupedItems,
    planFollowup,
    dismissPlanFollowup,
  };
}
