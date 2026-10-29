import { useState } from "react";
import { api } from "../../services/api";
import type { Occurrence, Queue, Treatment } from "../../types";

interface Props {
  occurrence: Occurrence;
  queue: Queue;
  onSaved: (t: Treatment) => void;
}

export default function TreatmentPanel({ occurrence: o, queue, onSaved }: Props) {
  const t = o.treatment;
  const [reversal, setReversal] = useState(t ? String(t.reversal) : "");
  const [justification, setJustification] = useState(t ? String(t.justification) : "");
  const [text, setText] = useState(t?.justification_text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsText = queue.justification_options.find((x) => String(x.id) === justification)?.requires_text ?? false;
  const canSave = o.can_treat && reversal !== "" && justification !== "" && (!needsText || text.trim() !== "");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      onSaved(await api.saveTreatment(o.id, {
        reversal: Number(reversal), justification: Number(justification), justification_text: needsText ? text : "",
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a tratativa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="treatment">
      <label className="field">
        <span>O que aconteceu com a coleta</span>
        <select className="control" value={reversal} disabled={!o.can_treat} onChange={(e) => setReversal(e.target.value)}>
          <option value="">Selecione o resultado</option>
          {queue.reversal_options.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Justificativa</span>
        <select className="control" value={justification} disabled={!o.can_treat}
          onChange={(e) => setJustification(e.target.value)}>
          <option value="">Selecione a justificativa</option>
          {queue.justification_options.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      {needsText && (
        <label className="field">
          <span>Especifique</span>
          <input className="control" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      <button type="button" className="btn btn-primary" disabled={!canSave || saving} onClick={save}>
        {saving ? "Salvando…" : t ? "Atualizar tratativa" : "Salvar tratativa"}
      </button>
      {!o.can_treat && (
        <p className="muted">Você pode ver esta ocorrência, mas só membros de {o.station_code} (ou da regional) tratam.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
