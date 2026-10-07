"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A textarea that grows with its content instead of scrolling internally, so a
 * longer message stays fully visible while the user types. The chat input rows
 * are bottom-aligned (`items-end`), so the extra height pushes the top edge
 * upward. Height is clamped between `minRows` and `maxRows`; past the cap the
 * box scrolls rather than taking over the screen.
 *
 * We measure from `height: auto` on every value change so the box shrinks as
 * well as grows (e.g. when it's cleared after sending). The element uses
 * border-box sizing (Tailwind default), so `scrollHeight` (content + padding)
 * plus the borders gives the height to set.
 */
export function AutoTextarea({
  value,
  minRows = 2,
  maxRows = 8,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "rows"> & {
  minRows?: number;
  maxRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const padding =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const border =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const min = lineHeight * minRows + padding + border;
    const max = lineHeight * maxRows + padding + border;

    el.style.height = "auto";
    // scrollHeight is content + padding; add the borders for the border-box height.
    const next = Math.min(Math.max(el.scrollHeight + border, min), max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + border > max ? "auto" : "hidden";
  }, [value, minRows, maxRows]);

  return <textarea ref={ref} value={value} className={className} {...props} />;
}
