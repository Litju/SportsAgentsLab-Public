"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MefIcon } from "./mef-icons";

export function LoginPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe: true })
      });
      if (!response.ok) {
        setError("Sign-in could not be completed.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Sign-in could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mef-auth-page" data-testid="screen-00-auth">
      <div className="mef-auth-shell">
        <section className="mef-auth-card">
          <div className="mef-auth-brand"><span className="mef-brand-mark">M</span><div><span>SportsAgentsLab</span><strong>Measurement Evidence Factory</strong></div></div>
          <div className="mef-auth-heading"><p className="mef-kicker">Secure workspace access</p><h1>Evidence before interpretation.</h1><p>Sign in to enter the tenant-scoped practitioner workstation. Source artifacts, review history, and assistant sessions stay behind the authenticated boundary.</p></div>
          <form className="mef-auth-form" onSubmit={submit}>
            <label className="mef-field"><span className="mef-field-label">Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className="mef-field"><span className="mef-field-label">Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {error ? <div className="mef-auth-error" role="alert"><MefIcon name="alert" size={15} />{error}</div> : null}
            <button className="mef-button mef-button-primary mef-button-lg" type="submit" disabled={pending}><span>{pending ? "Signing in..." : "Continue to workspace"}</span><MefIcon name="arrow" size={16} /></button>
          </form>
          <p className="mef-auth-footnote"><MefIcon name="lock" size={13} />Public account creation is disabled. Preview synthetic bootstrap is operator-gated.</p>
        </section>
        <aside className="mef-auth-aside">
          <div className="mef-auth-aside-orbit" aria-hidden="true"><span /><span /><span /></div>
          <p className="mef-kicker">MEF boundary</p><h2>A workspace for governed evidence.</h2><p>Every screen makes uncertainty, source state, and the next explicit action visible.</p>
          <ul className="mef-auth-principles"><li><MefIcon name="shield" size={16} /><span><strong>Source immutability</strong><small>Review adds metadata; it never overwrites the artifact.</small></span></li><li><MefIcon name="link" size={16} /><span><strong>Evidence entry points</strong><small>Claims stay linked to a record and a method.</small></span></li><li><MefIcon name="spark" size={16} /><span><strong>Bounded assistant</strong><small>Eve explains visible records and keeps practitioner authority intact.</small></span></li></ul>
          <div className="mef-auth-aside-footer"><span>Pre-processor surface</span><span>WCAG 2.2 AA intent</span></div>
        </aside>
      </div>
    </div>
  );
}
