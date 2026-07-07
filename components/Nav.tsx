"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Item = { href: string; label: string; icon: JSX.Element };

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d={d} />
  </svg>
);

const ITEMS: Item[] = [
  { href: "/", label: "This week", icon: icon("M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5") },
  { href: "/calendar", label: "Calendar", icon: icon("M4 5h16v16H4zM4 9h16M8 3v4M16 3v4") },
  { href: "/students", label: "Students", icon: icon("M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.8M16.5 4.2a3.5 3.5 0 0 1 0 6.6") },
  { href: "/money", label: "Money", icon: icon("M12 2v20M17 5.5C17 4 15.4 3 12.5 3S8 4.2 8 6s2 2.5 4.5 3 4.5 1.4 4.5 3.4S15 16 12 16 8 15 8 13.2") },
  { href: "/settings", label: "Settings", icon: icon("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L16 2H8l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 3 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L8 22h8l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z") },
];

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
      {/* Desktop / tablet: sticky, translucent top bar */}
      <header className="sticky top-0 z-20 hidden border-b border-line/80 bg-white/80 backdrop-blur-xl sm:block">
        <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4">
          <span className="mr-3 py-3 text-[15px] font-semibold tracking-tight">
            Tutor<span className="text-accent">Admin</span>
          </span>
          {ITEMS.map((it) => {
            const active = isActive(pathname, it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-accent-soft text-accent-dark" : "text-ink-soft hover:bg-gray-100 hover:text-ink"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
          <button onClick={signOut} className="btn-ghost btn ml-auto btn-sm">
            Sign out
          </button>
        </nav>
      </header>

      {/* Mobile: floating bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active ? "text-accent" : "text-ink-faint"
              }`}
            >
              {it.icon}
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
