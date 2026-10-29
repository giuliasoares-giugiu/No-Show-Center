import { useEffect, useRef } from 'react';
import type { ContactMember } from '../types';
import { Icon } from './Icons';

interface Props {
  members: ContactMember[];
  selectedId: number | null;
  busy: boolean;
  error: string;
  onSelect: (id: number) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ContactDialog({ members, selectedId, busy, error, onSelect, onClose, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="contact-dialog-title" tabIndex={-1} ref={dialogRef}>
        <div className="dialog-topline"><span className="dialog-icon"><Icon name="whatsapp" size={20} /></span><button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}><Icon name="close" /></button></div>
        <h2 id="contact-dialog-title">Quem está tratando?</h2>
        <p>Escolha o membro cuja identidade será registrada no contato com o motorista.</p>
        <div className="member-options" role="radiogroup" aria-label="Membro responsável pelo contato">
          {members.map((member) => (
            <button
              type="button"
              role="radio"
              aria-checked={selectedId === member.id}
              disabled={!member.phone_ok || busy}
              key={member.id}
              className={`member-option${selectedId === member.id ? ' is-picked' : ''}${!member.phone_ok ? ' is-disabled' : ''}`}
              onClick={() => onSelect(member.id)}
            >
              <span className="member-avatar">{member.name.replace(' (você)', '').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
              <span className="member-copy"><strong>{member.name}</strong>{!member.phone_ok && <small>Telefone não cadastrado — indisponível para contato</small>}</span>
              {member.is_me && <span className="me-chip">Você</span>}
              {selectedId === member.id && <Icon name="check" size={17} className="member-check" />}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="form-error dialog-error">{error}</p>}
        <div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="primary-button contact-confirm" disabled={busy || selectedId === null} onClick={onConfirm}>{busy ? <span className="button-spinner" /> : <Icon name="whatsapp" size={16} />}{busy ? 'Enviando…' : 'Abrir WhatsApp'}</button></div>
      </div>
    </div>
  );
}
