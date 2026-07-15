import Link from "next/link";
import Button from "@/components/ui/Button";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const getStartedLink = session ? "/dashboard" : "/auth/signin";
  const getStartedText = session ? "Go to Dashboard" : "Get Started — It's Free";

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)]">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-6">
          Remote Recording Studio
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold text-[var(--text-primary)] tracking-tight leading-[1.15] mb-5">
          A recording studio,<br />brought to your browser.
        </h1>
        <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto mb-10 leading-relaxed">
          Record studio-quality video and audio with guests anywhere in the world.
          No downloads, no complicated setups — just open a link and hit record.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href={getStartedLink}>
            <Button variant="primary" size="lg">
              {getStartedText}
            </Button>
          </Link>
          <Link href="#how-it-works">
            <Button variant="secondary" size="lg">
              See How It Works
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Preview ────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--shadow-elevated)] overflow-hidden">
          {/* Mock browser chrome */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3B3B3B]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#3B3B3B]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#3B3B3B]" />
            <div className="flex-1 mx-4">
              <div className="bg-[var(--bg-tertiary)] rounded-md px-3 py-1 max-w-xs mx-auto">
                <span className="text-[11px] text-[var(--text-tertiary)]">recordly.online/room/weekly-standup</span>
              </div>
            </div>
          </div>
          {/* Mock recording UI */}
          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-4">
              {/* Participant 1 */}
              <div className="aspect-video bg-[var(--bg-tertiary)] rounded-[var(--radius)] flex items-center justify-center relative">
                <div className="w-14 h-14 rounded-full bg-[#1F1F1F] flex items-center justify-center">
                  <span className="text-lg font-medium text-[var(--text-secondary)]">NP</span>
                </div>
                <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-white">
                  Nirav P.
                </div>
              </div>
              {/* Participant 2 */}
              <div className="aspect-video bg-[var(--bg-tertiary)] rounded-[var(--radius)] flex items-center justify-center relative">
                <div className="w-14 h-14 rounded-full bg-[#1F1F1F] flex items-center justify-center">
                  <span className="text-lg font-medium text-[var(--text-secondary)]">SJ</span>
                </div>
                <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-white">
                  Sarah J.
                </div>
              </div>
            </div>
            {/* Mock bottom bar */}
            <div className="flex items-center justify-center gap-5 mt-5">
              <div className="w-9 h-9 rounded-lg bg-[#1A1A1A] flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="6" />
                </svg>
              </div>
              <div className="w-9 h-9 rounded-lg bg-[#1A1A1A] flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 pb-24">
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">
            How It Works
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
            Three steps. Studio-quality audio and video.
          </h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div className="bg-[var(--card-bg)] rounded-[var(--radius)] p-6 shadow-[var(--shadow-subtle)]">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">
              1. Create a Room
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Name your session and get a shareable invite link in seconds. No software to install.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-[var(--card-bg)] rounded-[var(--radius)] p-6 shadow-[var(--shadow-subtle)]">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">
              2. Invite Your Guests
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Share the link via email or chat. Guests join directly from their browser — no account needed.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-[var(--card-bg)] rounded-[var(--radius)] p-6 shadow-[var(--shadow-subtle)]">
            <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">
              3. Record & Download
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Each participant&apos;s track is recorded locally in high quality, then combined and ready to download.
            </p>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">
            Why Recordly
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
            Built for creators who care about quality.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {[
            {
              title: "Local Recording",
              desc: "Each participant records locally at full quality — no compression from video calls.",
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
                </svg>
              ),
            },
            {
              title: "Separate Audio & Video Tracks",
              desc: "Get individual tracks per participant for maximum flexibility in post-production.",
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                </svg>
              ),
            },
            {
              title: "Auto-Sync & Combine",
              desc: "Recordings are automatically time-synced and combined into one video, ready to share.",
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              ),
            },
            {
              title: "Invite via Email",
              desc: "Send polished email invitations with one click. Guests join instantly through the link.",
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              ),
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-[var(--card-bg)] rounded-[var(--radius)] p-5 shadow-[var(--shadow-subtle)] flex gap-4"
            >
              <div className="w-10 h-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-secondary)]">
                {feature.icon}
              </div>
              <div>
                <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                  {feature.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border)] p-10 sm:p-14 text-center shadow-[var(--shadow-elevated)]">
          <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight mb-3">
            Ready to start recording?
          </h2>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-md mx-auto mb-8">
            Create your first room in under 30 seconds. Free to use, no credit card required.
          </p>
          <Link href={getStartedLink}>
            <Button variant="primary" size="lg">
              {getStartedText}
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-sm text-[var(--text-tertiary)]">
            © {new Date().getFullYear()} Recordly
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            Built for podcasters, interviewers, and remote teams.
          </span>
        </div>
      </footer>
    </div>
  );
}
