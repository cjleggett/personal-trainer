import { ImageResponse } from "next/og";

/**
 * The browser-tab icon: the Momentum "M" badge from the header — a bold white
 * "M" on a rust rounded square (see the brand mark in `Header.tsx`). Generated
 * so it stays in sync with the `--rust` / `--on-rust` design tokens.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#b5543a", // --rust
          color: "#ffffff", // --on-rust
          borderRadius: 7,
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        M
      </div>
    ),
    { ...size },
  );
}
