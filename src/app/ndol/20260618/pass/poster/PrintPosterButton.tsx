"use client";

export function PrintPosterButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-9 rounded-lg bg-black px-3 text-sm font-bold text-white"
    >
      인쇄
    </button>
  );
}
