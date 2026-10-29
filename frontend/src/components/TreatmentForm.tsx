import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Option, TreatmentPayload } from '../types';
import { Icon } from './Icons';

interface Props {
  reversals: Option[];
  justifications: Option[];
  canTreat: boolean;
  onSave: (payload: TreatmentPayload) => Promise<void>;
}

export default function TreatmentForm({ reversals, justifications, canTreat, onSave }: Props) {
  const [reversal, setReversal] = useState('');
  const [justification, setJustification] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedJustification = useMemo(
    () => justifications.find((option) => String(option.id) === justification),
    [justifications, justification],
  );
  const requiresText = selectedJustification?.requires_text ?? false;
  const ready = Boolean(reversal && justification && (!requiresText || text.trim()));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!ready) {
      setError(requiresText && !text.trim() ? 'Descreva a justificativa para continuar.' : 'Selecione o resultado e a justificativa.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ reversal: Number(reversal), justification: Number(justification), justification_text: text.trim() });
      setReversal('');
      setJustification('');
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a tratativa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="detail-section treatment-section">
      <div className="section-heading">
        <div><span className="eyebrow">FECHAMENTO</span><h3>Registrar tratativa</h3></div>
        <span className="required-note">* Campos obrigatórios</span>
      </div>
      {!canTreat && <div className="permission-note"><Icon name="shield" size={17} /><span><strong>Somente leitura</strong> — só membros da station ou da regional podem acionar e tratar esta ocorrência.</span></div>}
      <form onSubmit={submit} className="treatment-form">
        <label className="field-label" htmlFor="reversal">Resultado da coleta <span>*</span>
          <select id="reversal" value={reversal} disabled={!canTreat || saving} onChange={(event) => setReversal(event.target.value)} required>
            <option value="">Selecione o resultado</option>
            {reversals.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="field-label" htmlFor="justification">Justificativa <span>*</span>
          <select id="justification" value={justification} disabled={!canTreat || saving} onChange={(event) => { setJustification(event.target.value); setText(''); }} required>
            <option value="">Selecione a justificativa</option>
            {justifications.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        {requiresText && <label className="field-label full-field" htmlFor="justification-text">Detalhe da justificativa <span>*</span>
          <textarea id="justification-text" rows={3} value={text} disabled={!canTreat || saving} required placeholder="Conte brevemente o que foi apurado…" onChange={(event) => setText(event.target.value)} />
        </label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-footer">
          <p>Ao salvar, a fila avança para a próxima ocorrência pendente.</p>
          <button type="submit" className="primary-button save-button" disabled={!canTreat || saving || reversals.length === 0 || justifications.length === 0}>
            {saving ? <span className="button-spinner" /> : <Icon name="check" size={16} />}
            {saving ? 'Salvando…' : 'Salvar tratativa'}
          </button>
        </div>
      </form>
    </section>
  );
}
