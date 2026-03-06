"use client";

import { useState, useEffect } from "react";

export function LikeButton({ id }: { id: string }) {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    const likes = JSON.parse(localStorage.getItem("ab-likes") ?? "{}");
    setLiked(!!likes[id]);
  }, [id]);

  function toggle() {
    const likes = JSON.parse(localStorage.getItem("ab-likes") ?? "{}");
    if (likes[id]) {
      delete likes[id];
      setLiked(false);
    } else {
      likes[id] = Date.now();
      setLiked(true);
    }
    localStorage.setItem("ab-likes", JSON.stringify(likes));
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-all ${
        liked
          ? "bg-liked/15 text-liked"
          : "bg-surface-overlay text-text-muted hover:text-text-secondary"
      }`}
      title={liked ? "Unlike" : "Like"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
