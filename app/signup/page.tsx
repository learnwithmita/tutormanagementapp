"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isPasswordValid } from "@/lib/password";
import PasswordInput from "@/components/PasswordInput";
import PasswordChecklist from "@/components/PasswordChecklist";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // If email confirmation is disabled, a session is returned and we can go
    // straight to setup. Otherwise ask the user to confirm their email.
    if (data.session) {
      router.replace("/setup");
      router.refresh();
    } else {
      setInfo(
        "Account created. Check your email to confirm, then log in.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-2xl font-semibold tracking-tight">
          Tutor<span className="text-accent">Admin</span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">Create your account.</p>
      </div>
      <div className="card">
      {error && <div className="banner banner-error mb-3">{error}</div>}
      {info && <div className="banner banner-success mb-3">{info}</div>}
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
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <PasswordInput id="password" value={password} onChange={setPassword} />
          <PasswordChecklist password={password} />
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            Confirm password
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
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      </div>
      <p className="mt-4 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent">
          Log in
        </Link>
      </p>
      </div>
    </div>
  );
}
