"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isPasswordValid } from "@/lib/password";
import PasswordInput from "@/components/PasswordInput";
import PasswordChecklist from "@/components/PasswordChecklist";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The recovery link establishes a temporary session; wait for it.
  useEffect(() => {
    const supabase = createClient();
    let resolved = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        resolved = true;
        setStatus("ready");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        resolved = true;
        setStatus("ready");
      }
    });
    const t = setTimeout(() => {
      if (!resolved) setStatus("invalid");
    }, 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isPasswordValid(password)) {
      setError("Please meet all the password requirements below.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-tight">
            Tutor<span className="text-accent">Admin</span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">Choose a new password.</p>
        </div>
        <div className="card">
          {status === "checking" && (
            <p className="text-sm text-ink-soft">Verifying your reset link…</p>
          )}

          {status === "invalid" && (
            <div className="banner banner-error">
              This reset link is invalid or has expired.{" "}
              <Link href="/forgot-password" className="font-medium underline">
                Request a new one
              </Link>
              .
            </div>
          )}

          {status === "ready" && (
            <>
              {error && <div className="banner banner-error mb-3">{error}</div>}
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <label className="label" htmlFor="password">
                    New password
                  </label>
                  <PasswordInput id="password" value={password} onChange={setPassword} />
                  <PasswordChecklist password={password} />
                </div>
                <div>
                  <label className="label" htmlFor="confirm">
                    Confirm new password
                  </label>
                  <PasswordInput id="confirm" value={confirm} onChange={setConfirm} />
                  {confirm.length > 0 && confirm !== password && (
                    <p className="field-error">Passwords do not match.</p>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={busy || !isPasswordValid(password) || password !== confirm}
                >
                  {busy ? "Saving…" : "Set new password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
