import Eye from "lucide-react/dist/esm/icons/eye";
import Hand from "lucide-react/dist/esm/icons/hand";
import ShieldAlert from "lucide-react/dist/esm/icons/shield-alert";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { useI18n } from "@/i18n";
import { useMenuController } from "@app/hooks/useMenuController";
import {
  PopoverSurface,
  MenuTrigger,
} from "../../design-system/components/popover/PopoverPrimitives";
import type { AccessMode } from "../../../types";

type AccessOption = {
  mode: AccessMode;
  label: string;
  description: string;
  icon: typeof Eye;
};

type HomeAccessMenuProps = {
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
};

export function HomeAccessMenu({
  accessMode,
  onSelectAccessMode,
}: HomeAccessMenuProps) {
  const { tx } = useI18n();
  const menu = useMenuController();
  const { isOpen, containerRef, toggle, close } = menu;

  const options: AccessOption[] = [
    {
      mode: "read-only",
      label: tx("Read only"),
      description: tx("Read files only, no changes"),
      icon: Eye,
    },
    {
      mode: "current",
      label: tx("On-Request"),
      description: tx(
        "Always ask before editing external files or using the internet",
      ),
      icon: Hand,
    },
    {
      mode: "full-access",
      label: tx("Full access"),
      description: tx(
        "Unrestricted access to the internet and any file on your computer",
      ),
      icon: ShieldAlert,
    },
  ];

  const selected = options.find((o) => o.mode === accessMode) ?? options[2];
  const isFull = accessMode === "full-access";

  return (
    <div className="home-menu-anchor" ref={containerRef}>
      <MenuTrigger
        isOpen={isOpen}
        className={`home-pill home-access-trigger${isFull ? " is-access-full" : ""}`}
        onClick={toggle}
        aria-label={tx("Agent access")}
      >
        <span className="home-pill-icon" aria-hidden>
          <selected.icon size={14} strokeWidth={1.8} />
        </span>
        {selected.label}
        <ChevronDown className="home-pill-chevron" aria-hidden />
      </MenuTrigger>

      {isOpen && (
        <PopoverSurface className="home-menu-popover home-menu-popover--access" role="menu">
          <div className="home-menu-header">
            <span className="home-menu-title">
              {tx("How should Codex approvals work?")}
            </span>
            <button
              type="button"
              className="home-menu-learn"
              onClick={close}
            >
              {tx("Learn more")}
            </button>
          </div>
          {options.map((option) => {
            const Icon = option.icon;
            const active = option.mode === accessMode;
            return (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="home-menu-rich-item"
                onClick={() => {
                  onSelectAccessMode(option.mode);
                  close();
                }}
              >
                <span className="home-menu-rich-icon" aria-hidden>
                  <Icon size={17} strokeWidth={1.7} />
                </span>
                <span className="home-menu-rich-body">
                  <span className="home-menu-rich-label">{option.label}</span>
                  <span className="home-menu-rich-desc">{option.description}</span>
                </span>
                <span className="home-menu-rich-check" aria-hidden>
                  {active ? <Check size={16} strokeWidth={2} /> : null}
                </span>
              </button>
            );
          })}
        </PopoverSurface>
      )}
    </div>
  );
}
