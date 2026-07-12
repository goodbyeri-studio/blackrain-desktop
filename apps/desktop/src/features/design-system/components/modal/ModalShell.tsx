import { useEffect, useRef, type MouseEventHandler, type ReactNode } from "react";
import { joinClassNames } from "../classNames";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type ModalShellProps = {
  children: ReactNode;
  className?: string;
  cardClassName?: string;
  onBackdropClick?: MouseEventHandler<HTMLDivElement>;
  onEscapeKeyDown?: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
};

export function ModalShell({
  children,
  className,
  cardClassName,
  onBackdropClick,
  onEscapeKeyDown,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
}: ModalShellProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const escapeHandlerRef = useRef(onEscapeKeyDown);
  escapeHandlerRef.current = onEscapeKeyDown;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    if (!card) {
      return undefined;
    }
    const focusable = () =>
      Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getAttribute("aria-hidden") !== "true",
      );
    (focusable()[0] ?? card).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && escapeHandlerRef.current) {
        event.preventDefault();
        escapeHandlerRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return (
    <div
      className={joinClassNames("ds-modal", className)}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    >
      <div className="ds-modal-backdrop" aria-hidden onClick={onBackdropClick} />
      <div
        ref={cardRef}
        className={joinClassNames("ds-modal-card", cardClassName)}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
