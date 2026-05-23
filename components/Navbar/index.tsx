"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="bg-gray-900 border-b border-gray-700 px-8 py-4 flex items-center justify-between">
      {/* Logo */}
      <Link href="/" className="text-white text-xl font-bold">
        🎙 Recordly
      </Link>

      {/* Links */}
      {session && (
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-gray-300 hover:text-white text-sm"
          >
            Dashboard
          </Link>
          <Link
            href="/record"
            className="text-gray-300 hover:text-white text-sm"
          >
            Record
          </Link>
          <Link
            href="/recordings"
            className="text-gray-300 hover:text-white text-sm"
          >
            My Recordings
          </Link>
        </div>
      )}

      {/* User + Sign out */}
      {session ? (
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{session.user?.email}</span>
          <button
            onClick={() => signOut()}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <Link
          href="/signin"
          className="text-gray-300 hover:text-white text-sm"
        >
          Sign In
        </Link>
      )}
    </nav>
  );
}