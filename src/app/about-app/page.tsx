import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/app/Header";
import { FaqList } from "./FaqList";
import { INTRO, SECTIONS, FAQS } from "./content";

// The "About" page explaining how the app works, with an FAQ at the bottom.
// All copy lives in ./content.ts — edit it there.
export default async function AboutAppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-5 sm:p-8">
        <div>
          <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
            ← Back to dashboard
          </Link>
          <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">
            About Momentum
          </h1>
          <p className="mt-2 text-muted">{INTRO}</p>
        </div>

        {SECTIONS.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="font-serif text-2xl font-semibold">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph, i) => (
              <p key={i} className="text-sm leading-relaxed text-muted">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section className="space-y-3">
          <h2 className="font-serif text-2xl font-semibold">
            FAQs
          </h2>
          <FaqList faqs={FAQS} />
        </section>
      </main>
    </>
  );
}
