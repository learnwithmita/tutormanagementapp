"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight">
            Tutor<span className="text-accent">Admin</span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">Reset your password.</p>
        </div>
        <div className="card">
          {sent ? (
            <div className="banner banner-success">
              If an account exists for <strong>{email}</strong>, a password-reset
              link is on its way. Open it on this device to set a new password.
            </div>
          ) : (
            <>
              {error && <div className="banner banner-error mb-3">{error}</div>}
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <label className="label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-ink-soft">
          <Link href="/login" className="font-medium text-accent">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
