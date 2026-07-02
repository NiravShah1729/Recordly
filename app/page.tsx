import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-4xl font-semibold text-[var(--text-primary)] mb-3 tracking-tight">
        Recordly
      </h1>
      <p className="text-[var(--text-secondary)] text-base mb-8 max-w-md">
        Record high-quality video and audio with your guests — right from your
        browser.
      </p>
      <div className="flex gap-3">
        <Link
          href="/auth/signin"
          className="bg-white hover:bg-gray-100 text-black px-6 py-3 rounded-[var(--radius-sm)] text-sm font-medium transition-colors shadow-[var(--shadow-subtle)]"
        >
          Sign In
        </Link>
        <Link
          href="/dashboard"
          className="bg-[var(--bg-tertiary)] hover:bg-[#222] text-white px-6 py-3 rounded-[var(--radius-sm)] text-sm font-medium transition-colors"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
