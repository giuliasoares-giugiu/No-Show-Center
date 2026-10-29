import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { Me } from "../types";

interface GoogleId {
  initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, string>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function Login({ onLogin }: { onLogin: (me: Me) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CLIENT_ID) return;
    const init = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            onLogin(await api.loginGoogle(credential));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha no login.");
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: "outline", size: "large", text: "signin_with" });
    };
    if (window.google) return init();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);
  }, [onLogin]);

  return (
    <div className="login">
      <h1>No-show center</h1>
      <p>Entre com sua conta corporativa Google para acompanhar e tratar as ocorrências de coleta.</p>
      {CLIENT_ID ? (
        <div ref={buttonRef} />
      ) : (
        <p className="login-hint">
          Login Google não configurado. Defina <code>VITE_GOOGLE_CLIENT_ID</code>. Em desenvolvimento, entre em{" "}
          <a href="/admin/">/admin</a> com um superusuário e recarregue esta página.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
