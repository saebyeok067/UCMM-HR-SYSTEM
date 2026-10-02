"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") || "/hr.html";
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-badge">UC</div>
        <h1>Underchargers HR</h1>
        <p className="sub">Sign in using the company account created by HR Administration.</p>
        <form onSubmit={handleLogin}>
          <div className="field"><label>Email Address</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@underchargers.com" required /></div>
          <div className="field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" required /></div>
          {error && <div className="error">{error}</div>}
          <button className="primary-btn" style={{width:"100%",marginTop:20}} disabled={loading}>{loading ? "Signing in..." : "Log In"}</button>
        </form>
      </section>
    </main>
  );
}
