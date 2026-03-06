"use client";

import { useEffect } from "react";

export function MessageModal({
  title,
  sections,
  onClose,
}: {
  title: string;
  sections: Array<{ label: string; content: string }>;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-raised border border-border rounded-lg w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg leading-none"
          >
            x
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-5">
          {sections.map((section, i) => (
            <div key={i}>
              <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">
                {section.label}
              </div>
              <pre className="text-xs text-text-secondary whitespace-pre-wrap break-words bg-surface-overlay rounded-md p-3 border border-border-subtle max-h-60 overflow-y-auto">
                {section.content || "(empty)"}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
