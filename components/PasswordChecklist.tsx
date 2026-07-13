"use client";

import { passwordChecks } from "@/lib/password";

// Live requirements list — each rule turns green the moment it's satisfied.
export default function PasswordChecklist({ password }: { password: string }) {
  const checks = passwordChecks(password);
  return (
    <ul className="mt-2 space-y-1">
      {checks.map((c) => (
        <li
          key={c.label}
          className={`flex items-center gap-2 text-xs transition-colors ${
            c.met ? "text-emerald-600" : "text-ink-faint"
          }`}
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
              c.met ? "border-emerald-500 bg-emerald-500 text-white" : "border-line text-transparent"
            }`}
          >
            ✓
          </span>
          {c.label}
        </li>
      ))}
    </ul>
  );
}
