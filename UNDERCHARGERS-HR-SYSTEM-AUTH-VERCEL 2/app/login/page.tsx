"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="login-page">
      <section className="login-card">
        <div className="logo-panel">
          <Image
            src="/underchargers-logo.png"
            alt="Underchargers"
            width={260}
            height={150}
            priority
            className="brand-logo"
          />
        </div>

        <span className="eyebrow">UNDERCHARGERS HR SYSTEM</span>
        <h1>Welcome Back</h1>
        <p className="subtitle">Sign in using the company account created by HR Administration.</p>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@underchargers.com"
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="password-row">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="show-btn"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}

          <button className="login-btn" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Log In"}
          </button>
        </form>

        <p className="help-text">Need an account? Ask your HR Administrator to create one in System Users.</p>
      </section>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 28px;
          background:
            radial-gradient(circle at 18% 14%, rgba(255, 169, 0, 0.16), transparent 34%),
            radial-gradient(circle at 82% 80%, rgba(255, 169, 0, 0.08), transparent 28%),
            linear-gradient(180deg, #fffdf8 0%, #f7f3eb 100%);
          color: #241f18;
        }
        .login-card {
          width: min(450px, 100%);
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #eadfce;
          border-radius: 26px;
          padding: 30px;
          box-shadow: 0 28px 80px rgba(55, 40, 17, 0.13);
        }
        .logo-panel {
          width: 132px;
          height: 104px;
          margin: 0 auto 14px;
          display: grid;
          place-items: center;
          background: #fffaf0;
          border: 1px solid #f0ddb4;
          border-radius: 22px;
          overflow: hidden;
        }
        :global(.brand-logo) {
          width: 112px !important;
          height: auto !important;
          object-fit: contain;
        }
        .eyebrow {
          display: block;
          text-align: center;
          color: #9b6600;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }
        h1 {
          margin: 10px 0 6px;
          text-align: center;
          font-size: 30px;
          letter-spacing: -0.5px;
        }
        .subtitle {
          margin: 0 0 24px;
          text-align: center;
          color: #756d63;
          font-size: 12px;
          line-height: 1.6;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-top: 14px;
        }
        label {
          font-size: 11px;
          font-weight: 850;
        }
        input {
          width: 100%;
          border: 1px solid #e8dfd1;
          background: #fffdfa;
          color: #241f18;
          border-radius: 12px;
          padding: 13px 14px;
          font-size: 13px;
          outline: none;
        }
        input:focus {
          border-color: #ffa900;
          box-shadow: 0 0 0 4px rgba(255, 169, 0, 0.12);
          background: white;
        }
        .password-row {
          display: flex;
          gap: 8px;
        }
        .password-row input { flex: 1; }
        .show-btn {
          min-width: 64px;
          border: 1px solid #e8dfd1;
          border-radius: 12px;
          background: #fff8e8;
          color: #6e4a00;
          font-weight: 800;
          cursor: pointer;
        }
        .login-btn {
          width: 100%;
          margin-top: 20px;
          min-height: 46px;
          border: 0;
          border-radius: 12px;
          background: linear-gradient(135deg, #ffb321, #ffa900);
          color: white;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 12px 20px rgba(255, 169, 0, 0.2);
        }
        .login-btn:disabled { opacity: 0.65; cursor: not-allowed; }
        .error-box {
          margin-top: 14px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #f0caca;
          background: #fff2f2;
          color: #b54747;
          font-size: 11px;
          font-weight: 750;
        }
        .help-text {
          margin: 16px 0 0;
          text-align: center;
          color: #8b8175;
          font-size: 10px;
          line-height: 1.5;
        }
        @media (max-width: 520px) {
          .login-page { padding: 16px; }
          .login-card { padding: 22px; border-radius: 22px; }
          h1 { font-size: 27px; }
        }
      `}</style>
    </main>
  );
}
