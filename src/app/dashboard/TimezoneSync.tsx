"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The dashboard is server-rendered, and the server has no idea what timezone the
 * user is in — so "today" would otherwise be computed in the server's zone (UTC
 * on Vercel), mislabeling tomorrow's plan day as "Today" late in the evening.
 *
 * This records the browser's IANA timezone in a cookie so the server can compute
 * the user's local "today" on subsequent renders (see dashboard/page.tsx). On
 * mount we compare the server-rendered date against the real local date; if they
 * differ (i.e. the server guessed wrong), we refresh once so the corrected cookie
 * takes effect. Steady state: cookie matches, no refresh. Renders nothing.
 */
export function TimezoneSync({ serverToday }: { serverToday: string }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      // One year; lax is fine (same-site navigation only). Readable server-side.
      document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    }
    // en-CA renders as YYYY-MM-DD, matching the server's format, in local time.
    const localToday = new Intl.DateTimeFormat("en-CA").format(new Date());
    if (localToday !== serverToday) router.refresh();
  }, [serverToday, router]);

  return null;
}
