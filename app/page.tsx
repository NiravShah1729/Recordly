import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-5xl font-bold text-white mb-4">🎙 Recordly</h1>
      <p className="text-gray-400 text-lg mb-8 max-w-md">
        Record high-quality video and audio with your guests — right from your
        browser.
      </p>
      <div className="flex gap-4">
        <Link
          href="/api/auth/signin"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition"
        >
          Sign In
        </Link>
        <Link
          href="/dashboard"
          className="border border-gray-600 hover:border-gray-400 text-gray-300 px-6 py-3 rounded-lg font-medium transition"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
