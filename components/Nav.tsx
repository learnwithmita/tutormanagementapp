"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ITEMS = [
  { href: "/", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/students", label: "Students" },
  { href: "/money", label: "Money" },
  { href: "/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {/* Desktop / tablet: top bar */}
      <header className="hidden border-b border-gray-300 bg-white sm:block">
        <nav className="mx-auto flex max-w-5xl items-center gap-1 px-3">
          <span className="mr-2 py-2 text-sm font-semibold">Tutor Admin</span>
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`px-3 py-2 text-sm ${
                isActive(pathname, it.href)
                  ? "border-b-2 border-blue-700 font-semibold text-blue-700"
                  : "text-gray-700 hover:text-black"
              }`}
            >
              {it.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="ml-auto px-3 py-2 text-sm text-gray-600 hover:text-black"
          >
            Sign out
          </button>
        </nav>
      </header>

      {/* Mobile: bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-gray-300 bg-white sm:hidden">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`py-2 text-center text-xs ${
              isActive(pathname, it.href)
                ? "font-semibold text-blue-700"
                : "text-gray-600"
            }`}
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
