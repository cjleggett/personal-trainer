import { ImageResponse } from "next/og";

/**
 * The browser-tab icon: the Momentum running-shoe mark from the header — a white
 * sneaker leaning forward mid-stride on a rust rounded square (see the brand
 * mark in `Header.tsx`). Kept in sync with the `--rust` / `--on-rust` tokens.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// The sneaker silhouette (tilted forward mid-stride), white on transparent, as
// a data URI so Satori can render it inside the badge. Mirrors the inline SVG
// in `Header.tsx`; the cut details are drawn in the rust badge fill so they
// read as negative space.
const SHOE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <g transform="rotate(26 12 12) translate(12 12.5) scale(1.3) translate(-12 -12.5)" fill="#ffffff">
    <path d="M3.6 14.6 L3.6 10.6 C3.6 9.9 4.3 9.5 4.9 9.8 L5.9 10.3 C6.3 10.5 6.5 10.9 6.5 11.3 L6.5 11.9 L7.5 10.3 C7.8 9.8 8.5 9.75 8.9 10.2 L10 11.4 L10.6 11 C10.9 10.8 11.3 10.9 11.5 11.2 L12.1 12.2 C13.6 12.25 15.4 12.4 16.9 12.7 C19.1 13.1 20.6 13.9 21.1 14.9 C21.3 15.3 21 15.7 20.5 15.7 L3.6 15.7 Z"/>
    <path d="M2.6 15.6 L21 15.6 C21.6 15.6 21.7 16.5 21 17 C20.3 17.5 19.5 17.7 18.4 17.7 L4.5 17.7 C3.3 17.7 2.6 16.9 2.6 15.9 Z"/>
  </g>
  <g transform="rotate(26 12 12) translate(12 12.5) scale(1.3) translate(-12 -12.5)" fill="none" stroke="#b5543a" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6.5 11.9 L6.5 14.6"/>
    <line x1="3.3" y1="16.6" x2="20.3" y2="16.6" stroke-width="0.55"/>
    <path d="M8.9 14.6 C11 13.6 13.8 13.2 16.2 13.3" stroke-width="1.1"/>
    <line x1="9.1" y1="11.4" x2="10.6" y2="10.8"/>
    <line x1="9.7" y1="12.3" x2="11.2" y2="11.7"/>
    <line x1="10.3" y1="13.1" x2="11.9" y2="12.6"/>
  </g>
</svg>`;

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
          borderRadius: 7,
        }}
      >
        <img
          width={30}
          height={30}
          src={`data:image/svg+xml,${encodeURIComponent(SHOE)}`}
          alt="Momentum"
        />
      </div>
    ),
    { ...size },
  );
}
