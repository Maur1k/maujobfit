import { SECTIONS, dateRange } from "@/lib/master-resume";
import type { ResumeItem } from "@/components/resume/types";

type Profile = {
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  portfolio_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
} | null;

export function ResumePreview({
  profile,
  summary,
  items,
}: {
  profile: Profile;
  summary: string | null;
  items: ResumeItem[];
}) {
  const contact = [profile?.phone, profile?.email, profile?.location, profile?.portfolio_url, profile?.github_url, profile?.linkedin_url]
    .filter(Boolean)
    .join("  ·  ");

  const bySection = (key: string) =>
    items.filter((i) => i.section === key).sort((a, b) => a.sort_order - b.sort_order);

  const hasAnything = summary?.trim() || items.length > 0 || profile?.full_name;

  return (
    <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
      {!hasAnything ? (
        <p className="text-center text-sm text-muted-foreground">
          Your preview builds itself as you add records. Nothing here is generated — it is exactly
          what you entered.
        </p>
      ) : (
        <article className="space-y-6">
          <header className="border-b border-border pb-4">
            <h3 className="font-display text-2xl font-semibold uppercase tracking-wide">
              {profile?.full_name || "Your name"}
            </h3>
            {profile?.headline ? (
              <p className="mt-1 text-sm font-medium text-evidence">{profile.headline}</p>
            ) : null}
            {contact ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">{contact}</p>
            ) : null}
          </header>

          {summary?.trim() ? (
            <section>
              <h4 className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Professional summary
              </h4>
              <p className="mt-2 text-sm leading-relaxed">{summary}</p>
            </section>
          ) : null}

          {SECTIONS.map((section) => {
            const sectionItems = bySection(section.key);
            if (!sectionItems.length) return null;
            return (
              <section key={section.key}>
                <h4 className="font-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {section.label}
                </h4>
                <div className="mt-2 space-y-4">
                  {sectionItems.map((item) => (
                    <div key={item.id} className="space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <p className="text-sm font-semibold">
                          {item.role || item.title}
                          {item.role && item.organization ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {item.organization}
                            </span>
                          ) : null}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {dateRange(item.start_date, item.end_date)}
                        </p>
                      </div>
                      {!item.role && item.organization ? (
                        <p className="text-xs text-muted-foreground">{item.organization}</p>
                      ) : null}
                      {item.url ? (
                        <p className="font-mono text-xs text-evidence">{item.url}</p>
                      ) : null}
                      {item.description ? (
                        <p className="text-sm leading-relaxed">{item.description}</p>
                      ) : null}
                      {item.skills.length ? (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Skills: </span>
                          {item.skills.join(", ")}
                        </p>
                      ) : null}
                      {item.resume_item_bullets.length ? (
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                          {[...item.resume_item_bullets]
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((bullet) => (
                              <li key={bullet.id}>{bullet.content}</li>
                            ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </article>
      )}
    </div>
  );
}
