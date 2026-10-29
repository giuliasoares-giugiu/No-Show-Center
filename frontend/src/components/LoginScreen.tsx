import { useEffect, useRef, useState } from 'react';
import { BrandMark, Icon } from './Icons';

interface CredentialResponse { credential: string; }
interface GoogleIdentity {
  initialize: (options: { client_id: string; callback: (response: CredentialResponse) => void; auto_select: boolean; cancel_on_tap_outside: boolean }) => void;
  renderButton: (element: HTMLElement, options: { theme: 'outline'; size: 'large'; text: 'signin_with'; shape: 'rectangular'; width: number; locale: 'pt_BR' }) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

interface Props {
  clientId: string;
  busy: boolean;
  error: string;
  onLogin: (credential: string) => Promise<void>;
  onRetry?: () => void;
}

export default function LoginScreen({ clientId, busy, error, onLogin, onRetry }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState('');

  useEffect(() => {
    if (!clientId) return;
    const scriptId = 'google-identity-client';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const mount = () => {
      if (window.google?.accounts.id) setScriptReady(true);
      else setScriptError('O serviço de login não carregou. Verifique a conexão e tente novamente.');
    };
    const fail = () => setScriptError('O serviço de login não carregou. Verifique a conexão e tente novamente.');
    if (window.google?.accounts.id) {
      mount();
      return;
    }
    if (existing) {
      existing.addEventListener('load', mount);
      existing.addEventListener('error', fail);
      return () => {
        existing.removeEventListener('load', mount);
        existing.removeEventListener('error', fail);
      };
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', mount, { once: true });
    script.addEventListener('error', fail, { once: true });
    document.head.appendChild(script);
    return () => {
      script.removeEventListener('load', mount);
      script.removeEventListener('error', fail);
    };
  }, [clientId]);

  useEffect(() => {
    if (!scriptReady || !clientId || !buttonRef.current || !window.google?.accounts.id) return;
    const mount = buttonRef.current;
    mount.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => { if (response.credential) void onLogin(response.credential).catch(() => undefined); },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    window.google.accounts.id.renderButton(mount, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: Math.min(360, Math.max(250, Math.round(mount.getBoundingClientRect().width))),
      locale: 'pt_BR',
    });
  }, [clientId, onLogin, scriptReady]);

  return (
    <main className="login-page">
      <div className="login-side-note"><BrandMark /><span>FIRST MILE · OPERAÇÃO BRASIL</span><strong>Contexto claro.<br />Tratativa ágil.</strong><p>Uma visão compartilhada para entender cada ocorrência de coleta e agir com confiança.</p><div className="login-side-rule" /><small>PAINEL OPERACIONAL · 2026</small></div>
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand"><BrandMark /><span><strong>No-Show Center</strong><small>First Mile</small></span></div>
        <span className="eyebrow">ACESSO À OPERAÇÃO</span>
        <h1 id="login-title">Entre para continuar</h1>
        <p className="login-description">Use sua conta corporativa para acessar a fila da sua regional.</p>
        {clientId ? <><div ref={buttonRef} className={`google-button-mount${busy ? ' is-busy' : ''}`} aria-label="Entrar com Google" />{!scriptReady && !scriptError && <div className="google-button-placeholder"><span className="button-spinner" />Preparando acesso…</div>}{scriptError && <p className="login-error" role="alert">{scriptError}</p>}</> : <div className="client-id-notice"><span><Icon name="shield" size={18} /></span><div><strong>Login não configurado</strong><p>Defina <code>VITE_GOOGLE_CLIENT_ID</code> no ambiente de desenvolvimento para habilitar o acesso pelo Google.</p></div></div>}
        {busy && <p className="login-status" role="status"><span className="button-spinner" />Validando sua sessão…</p>}
        {error && <div className="login-error" role="alert"><Icon name="alert" size={16} /><span>{error}</span>{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</div>}
        <div className="login-safety"><Icon name="shield" size={14} />Acesso protegido pela sessão corporativa</div>
      </section>
    </main>
  );
}
