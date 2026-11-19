"use client";

import {
  type CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ScrollSelectOption = { value: string; label: string };

const defaultTriggerClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-[#e4ebf2] focus:ring-2 focus:ring-[#051A2D]/30";

export default function ScrollSelect({
  value,
  placeholder = "Select…",
  options,
  onChange,
  disabled = false,
  className,
  allowEmpty = true,
}: {
  value: string;
  placeholder?: string;
  options: ScrollSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** When false, the placeholder row is hidden (value must be one of the options). */
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    position: "fixed",
    zIndex: 200,
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const selected = options.find((o) => o.value === value);
  const triggerClass = className?.trim() ? className : defaultTriggerClass;

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;

    function placeMenu() {
      const trigger = rootRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const maxHeight = 224;
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUp =
        spaceBelow < Math.min(maxHeight, 160) && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const height = Math.min(maxHeight, Math.max(120, available));
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width, 160),
        maxHeight: height,
        top: openUp ? undefined : rect.bottom + gap,
        bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
        zIndex: 200,
      });
    }

    placeMenu();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onReposition(event: Event) {
      // Don't reposition while the user is scrolling the menu itself.
      if (menuRef.current && event.target instanceof Node) {
        if (menuRef.current === event.target || menuRef.current.contains(event.target)) {
          return;
        }
      }
      placeMenu();
    }

    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", onReposition, true);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", onReposition, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  const menu = open
    ? createPortal(
        <ul
          ref={menuRef}
          id={listboxId}
          role="listbox"
          style={menuStyle}
          onWheel={(event) => event.stopPropagation()}
          className="overflow-y-auto overscroll-contain rounded-2xl border border-black/[0.08] bg-[#e4ebf2] py-1 shadow-lg"
        >
          {allowEmpty ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick("")}
                className={`block w-full px-3.5 py-2 text-left text-sm font-medium transition hover:bg-[#d4dee9] ${
                  !value
                    ? "bg-[#051A2D] text-white hover:bg-[#0a3050]"
                    : "text-[#5B6577]"
                }`}
              >
                {placeholder}
              </button>
            </li>
          ) : null}
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(option.value)}
                  className={`block w-full px-3.5 py-2 text-left text-sm font-medium transition hover:bg-[#d4dee9] ${
                    active
                      ? "bg-[#051A2D] text-white hover:bg-[#0a3050]"
                      : "text-[#0B1220]"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onMouseDown={(event) => {
          // Keep focus/scroll from jumping the modal when opening.
          event.preventDefault();
        }}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        className={`${triggerClass} flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={`truncate ${selected ? "" : "text-[#5B6577]"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>
      {menu}
    </div>
  );
}
