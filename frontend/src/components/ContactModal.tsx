import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { ContactMember, Occurrence } from "../types";

interface Props {
  occurrence: Occurrence;
  onClose: () => void;
}

export default function ContactModal({ occurrence, onClose }: Props) {
  const [members, setMembers] = useState<ContactMember[] | null>(null);
  const [memberId, setMemberId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    api.contactOptions(occurrence.id)
      .then((list) => {
        if (ignore) return;
        setMembers(list);
        const me = list.find((m) => m.is_me && m.phone_ok);
        if (me) setMemberId(String(me.id));
      })
      .catch((e) => !ignore && setError(e instanceof Error ? e.message : "Erro ao carregar contatos."));
    return () => { ignore = true; };
  }, [occurrence.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    // Abre a aba no clique (antes do await) para o navegador não bloquear o pop-up.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setSending(true);
    setError("");
    try {
      const res = await api.contact(occurrence.id, Number(memberId));
      if (tab) tab.location.href = res.whatsapp_url;
      else window.location.href = res.whatsapp_url;
      onClose();
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : "Não foi possível gerar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="contact-title">
        <h2 id="contact-title">Acionar {occurrence.driver_name}</h2>
        <p>
          Seller <strong>{occurrence.seller_name}</strong>. Escolha quem assina a mensagem; o contato dessa pessoa
          vai no texto para o motorista.
        </p>
        <label>
          <span>Quem está tratando:</span>
          <select className="control" value={memberId} onChange={(e) => setMemberId(e.target.value)}
            disabled={members === null}>
            <option value="">Selecione seu nome…</option>
            {members?.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.phone_ok}>
                {m.name}{m.phone_ok ? "" : " (sem telefone cadastrado)"}
              </option>
            ))}
          </select>
        </label>
        {members?.length === 0 && <p className="error">Nenhum membro ativo cadastrado nesta station.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-whats" disabled={!memberId || sending} onClick={send}>
            {sending ? "Gerando…" : "Abrir WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}
