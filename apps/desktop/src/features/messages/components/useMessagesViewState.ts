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
  SCROLL_THRESHOLD_PX,
  buildToolGroups,
  computePlanFollowupState,
  parseReasoning,
  scrollKeyForItems,
} from "../utils/messageRenderUtils";

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
  const autoScrollRef = useRef(true);
  // 标记「程序触发的滚动」:程序滚到底也会触发 scroll 事件,需忽略它,
  // 否则会被误判为用户滚动而污染 autoScrollRef(流式逐字渲染时尤甚)。
  const isProgrammaticScrollRef = useRef(false);
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

  const isNearBottom = useCallback(
    (node: HTMLDivElement) =>
      node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_THRESHOLD_PX,
    [],
  );

  const updateAutoScroll = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    // 程序触发的滚动不算用户意图,忽略,避免污染 autoScrollRef。
    if (isProgrammaticScrollRef.current) {
      return;
    }
    autoScrollRef.current = isNearBottom(containerRef.current);
  }, [isNearBottom]);

  // 用户主动滚动意图(wheel/touch)。这是赢得竞态的关键:wheel/touch 只由
  // 真实用户输入触发(程序滚动绝不产生),所以能同步、可靠地捕捉「用户上滑」,
  // 而不像 onScroll 那样异步节流、会在高频流式 delta 下被程序滚动事件淹没。
  const handleUserScrollIntent = useCallback((deltaY: number) => {
    if (deltaY < 0) {
      // 向上滚 → 立即停止跟随
      autoScrollRef.current = false;
    } else if (deltaY > 0 && containerRef.current) {
      // 向下滚到底 → 恢复跟随
      autoScrollRef.current = isNearBottom(containerRef.current);
    }
  }, [isNearBottom]);

  // 程序滚到底:置守卫 → 滚 → 下一帧复位守卫(只吞掉这次程序滚动产生的
  // scroll 事件,不影响用户后续滚动;窗口仅 1 帧,适配高频流式 delta)。
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    isProgrammaticScrollRef.current = true;
    if (container) {
      container.scrollTop = container.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, []);

  const requestAutoScroll = useCallback(() => {
    // 只在用户意图为「跟随」时滚动;去掉旧的 `|| isNearBottom` 兜底——
    // 那个兜底会在用户上滑后仍从位置反推强行拽底,造成抢视角。
    if (!autoScrollRef.current) {
      return;
    }
    scrollToBottom();
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    autoScrollRef.current = true;
  }, [threadId]);

  useLayoutEffect(() => {
    // 内容更新时(含流式逐字)只在用户意图为「跟随」时滚到底。
    // 去掉旧的 `|| isNearBottom` 兜底,改用带程序滚动守卫的 scrollToBottom,
    // 根除流式渲染时「上滑被反复拽回底部」的抢视角问题。
    if (!autoScrollRef.current) {
      return;
    }
    scrollToBottom();
  }, [scrollKey, isThinking, threadId, scrollToBottom]);

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
    updateAutoScroll,
    requestAutoScroll,
    handleUserScrollIntent,
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
