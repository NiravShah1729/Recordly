"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Button from "@/components/ui/Button";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/recordings", label: "Recordings" },
  ];

  return (
    <nav className="bg-[var(--bg-primary)] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      {/* Logo */}
      <Link
        href="/"
        className="text-[var(--text-primary)] text-lg font-semibold tracking-tight"
      >
        Recordly
      </Link>

      {/* Nav Links */}
      {session && (
        <div className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  px-3 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors
                  ${
                    isActive
                      ? "text-[var(--text-primary)] bg-[var(--bg-tertiary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                  }
                `}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* User Section */}
      {session ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-secondary)]">
            {session.user?.name || session.user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            Sign Out
          </Button>
        </div>
      ) : (
        <Link href="/auth/signin">
          <Button variant="ghost" size="sm">
            Sign In
          </Button>
        </Link>
      )}
    </nav>
  );
}