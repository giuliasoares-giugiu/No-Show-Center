import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OccurrenceFilters, ContactEntry, ContactMember, Insights, Kpis, Me, Occurrence, Page, Queue, TreatmentPayload } from './types';
import { api } from './services';
import { ApiError } from './services/api';
import { dateRange, filtersFromUrl, filtersToSearch, formatNumber, rangeLength } from './lib/format';
import { BrandMark, Icon } from './components/Icons';
import ContactDialog from './components/ContactDialog';
import FilterBar from './components/FilterBar';
import IndicatorsView from './components/IndicatorsView';
import InsightsView from './components/InsightsView';
import type { DrillTarget } from './components/InsightsView';
import KpiStrip from './components/KpiStrip';
import LoginScreen from './components/LoginScreen';
import OccurrenceDetail from './components/OccurrenceDetail';
import OccurrenceList from './components/OccurrenceList';
import RecurrenceView from './components/RecurrenceView';
import TreatmentsView from './components/TreatmentsView';

const DEFAULT_QUEUE = 'nss-spx-fault';
type View = 'queue' | 'treatments' | 'recurrence' | 'indicators' | 'insights';

const VIEW_PATHS: Record<View, string> = { queue: '/', treatments: '/tratativas', recurrence: '/recorrencia', indicators: '/indicadores', insights: '/insights' };
const NAV_ITEMS: { view: View; label: string; icon: 'inbox' | 'check' | 'activity' | 'chart' | 'spark' }[] = [
  { view: 'queue', label: 'Fila', icon: 'inbox' },
  { view: 'treatments', label: 'Tratativas', icon: 'check' },
  { view: 'recurrence', label: 'Recorrência', icon: 'activity' },
  { view: 'indicators', label: 'Indicadores', icon: 'spark' },
  { view: 'insights', label: 'Insights', icon: 'chart' },
];
const HEADINGS: Record<View, { eyebrow: string; title: string; text: string; context: string }> = {
  queue: { eyebrow: 'CENTRAL DE TRATATIVAS', title: 'Fila de ocorrências', text: 'Priorize o que precisa de ação e mantenha cada tratativa rastreável.', context: '' },
  treatments: { eyebrow: 'REGISTRO', title: 'Tratativas realizadas', text: 'O que foi feito em cada ocorrência: resultado, justificativa, quem tratou e quando.', context: 'Registro do que foi tratado · o período é a data da tratativa' },
  recurrence: { eyebrow: 'PADRÕES', title: 'Recorrência', text: 'Sellers, motoristas e rotas que se repetem, para agir na causa e não só na ocorrência.', context: 'Quem se repete no recorte · períodos longos mostram mais padrões' },
  indicators: { eyebrow: 'PERFORMANCE', title: 'Indicadores', text: 'Como dispatchers e drivers estão tratando os no-shows: rotas, reversões, acionamentos e tempo de resolução.', context: 'Considera no-shows de qualquer fila · o período é a data da ocorrência' },
  insights: { eyebrow: 'VISÃO DE COORDENAÇÃO', title: 'Insights operacionais', text: 'Padrões do recorte para orientar a próxima ação regional.', context: 'Leitura consolidada · sem filtros de estado e busca' },
};
type Toast = { kind: 'success' | 'error' | 'info'; message: string };

function currentView(): View {
  const path = window.location.pathname.replace(/\/$/, '');
  return (Object.keys(VIEW_PATHS) as View[]).find((view) => view !== 'queue' && VIEW_PATHS[view] === path) ?? 'queue';
}

function writeUrl(view: View, filters: OccurrenceFilters) {
  const path = VIEW_PATHS[view];
  const query = filtersToSearch(filters);
  window.history.replaceState(null, '', query ? `${path}?${query}` : path);
}

function roleLabel(user: Me | null): string {
  if (!user) return '';
  if (user.is_admin) return 'Administração';
  if (user.regionals.length > 0) return 'Coordenação regional';
  if (user.stations.length > 0) return `Operação ${user.stations.join(', ')}`;
  return 'Somente leitura';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function App() {
  const [sessionState, setSessionState] = useState<'checking' | 'signed-out' | 'signed-in' | 'error'>('checking');
  const [user, setUser] = useState<Me | null>(null);
  const [authError, setAuthError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [view, setView] = useState<View>(() => currentView());
  const [filters, setFilters] = useState<OccurrenceFilters>(() => filtersFromUrl(window.location.search, DEFAULT_QUEUE));
  const [queues, setQueues] = useState<Queue[]>([]);
  const [filterOptions, setFilterOptions] = useState<Awaited<ReturnType<typeof api.filterOptions>>>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupsError, setLookupsError] = useState('');
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [summary, setSummary] = useState<Kpis | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [history, setHistory] = useState<ContactEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [contactMembers, setContactMembers] = useState<ContactMember[]>([]);
  const [contactMemberId, setContactMemberId] = useState<number | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');

  const selectedOccurrence = useMemo(
    () => occurrences.find((item) => item.id === selectedId) ?? null,
    [occurrences, selectedId],
  );
  const selectedQueue = useMemo(
    () => queues.find((item) => item.slug === (selectedOccurrence?.queue ?? filters.queue)) ?? null,
    [filters.queue, queues, selectedOccurrence],
  );
  const summaryFilters = useMemo<OccurrenceFilters>(() => ({
    queue: filters.queue,
    regional: filters.regional,
    stations: filters.stations,
    treated: '',
    search: '',
    date_from: filters.date_from,
    date_to: filters.date_to,
    page: 1,
    ordering: '-date',
  }), [filters.date_from, filters.date_to, filters.queue, filters.regional, filters.stations]);

  const checkSession = useCallback(async () => {
    setSessionState('checking');
    setAuthError('');
    try {
      const currentUser = await api.me();
      setUser(currentUser);
      setSessionState('signed-in');
    } catch (error) {
      setUser(null);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setSessionState('signed-out');
      } else {
        setAuthError(errorMessage(error, 'Não foi possível validar sua sessão.'));
        setSessionState('error');
      }
    }
  }, []);

  useEffect(() => { void checkSession(); }, [checkSession]);

  useEffect(() => {
    const onPopState = () => {
      const nextView = currentView();
      const fallback = queues[0]?.slug ?? DEFAULT_QUEUE;
      setView(nextView);
      setFilters(filtersFromUrl(window.location.search, fallback));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [queues]);

  useEffect(() => {
    if (sessionState !== 'signed-in') return;
    let active = true;
    setLookupsLoading(true);
    setLookupsError('');
    Promise.all([api.queues(), api.filterOptions()])
      .then(([queueOptions, availableFilters]) => {
        if (!active) return;
        setQueues(queueOptions);
        setFilterOptions(availableFilters);
        const requestedQueue = new URLSearchParams(window.location.search).get('queue');
        const nextQueue = requestedQueue || queueOptions[0]?.slug || DEFAULT_QUEUE;
        setFilters((previous) => {
          const next = { ...previous, queue: nextQueue };
          writeUrl(view, next);
          return next;
        });
      })
      .catch((error: unknown) => {
        if (active) setLookupsError(errorMessage(error, 'Não foi possível carregar as opções da fila.'));
      })
      .finally(() => { if (active) setLookupsLoading(false); });
    return () => { active = false; };
  }, [sessionState]);

  useEffect(() => {
    if (sessionState !== 'signed-in' || view !== 'queue' || lookupsLoading) return;
    let active = true;
    setListLoading(true);
    setListError('');
    api.occurrences(filters)
      .then((page: Page<Occurrence>) => {
        if (!active) return;
        setOccurrences(page.results);
        setTotal(page.count);
        setSelectedId((previous) => page.results.some((item) => item.id === previous) ? previous : page.results[0]?.id ?? null);
      })
      .catch((error: unknown) => { if (active) setListError(errorMessage(error, 'Não foi possível carregar a fila.')); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [filters, lookupsLoading, refreshKey, sessionState, view]);

  useEffect(() => {
    if (sessionState !== 'signed-in' || lookupsLoading) return;
    let active = true;
    setSummaryLoading(true);
    api.summary(summaryFilters)
      .then((data) => { if (active) setSummary(data); })
      .catch((error: unknown) => { if (active) setToast({ kind: 'error', message: errorMessage(error, 'Não foi possível carregar os indicadores.') }); })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [refreshKey, sessionState, summaryFilters, lookupsLoading]);

  useEffect(() => {
    if (sessionState !== 'signed-in' || view !== 'insights' || lookupsLoading) return;
    let active = true;
    setInsightsLoading(true);
    setInsightsError('');
    api.insights(summaryFilters)
      .then((data) => { if (active) setInsights(data); })
      .catch((error: unknown) => { if (active) setInsightsError(errorMessage(error, 'Não foi possível carregar os insights.')); })
      .finally(() => { if (active) setInsightsLoading(false); });
    return () => { active = false; };
  }, [refreshKey, sessionState, summaryFilters, view, lookupsLoading]);

  useEffect(() => {
    if (selectedId === null || sessionState !== 'signed-in') {
      setHistory([]);
      return;
    }
    let active = true;
    setHistoryLoading(true);
    setHistoryError('');
    api.history(selectedId)
      .then((items) => { if (active) setHistory(items); })
      .catch((error: unknown) => { if (active) setHistoryError(errorMessage(error, 'Não foi possível carregar o histórico.')); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [refreshKey, selectedId, sessionState]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const patchFilters = useCallback((next: OccurrenceFilters) => {
    setFilters(next);
    writeUrl(view, next);
  }, [view]);

  const navigate = useCallback((nextView: View) => {
    let nextFilters = filters;
    // Recorrência precisa de janela longa para mostrar padrões: amplia sozinho e avisa.
    if (nextView === 'recurrence' && rangeLength(filters.date_from, filters.date_to) < 14) {
      nextFilters = { ...filters, ...dateRange(30), page: 1 };
      setFilters(nextFilters);
      setToast({ kind: 'info', message: 'Recorrência aparece melhor em períodos longos: o período foi ajustado para 30 dias.' });
    }
    setView(nextView);
    const path = VIEW_PATHS[nextView];
    const query = filtersToSearch(nextFilters);
    window.history.pushState(null, '', query ? `${path}?${query}` : path);
  }, [filters]);

  const handleLogin = useCallback(async (credential: string) => {
    setLoginBusy(true);
    setAuthError('');
    try {
      const currentUser = await api.loginGoogle(credential);
      setUser(currentUser);
      setSessionState('signed-in');
    } catch (error) {
      setAuthError(errorMessage(error, 'Não foi possível entrar com essa conta. Tente novamente.'));
      throw error;
    } finally {
      setLoginBusy(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
      setUser(null);
      setSessionState('signed-out');
      setToast({ kind: 'info', message: 'Sessão encerrada com segurança.' });
    } catch (error) {
      setToast({ kind: 'error', message: errorMessage(error, 'Não foi possível encerrar a sessão.') });
    }
  }, []);

  async function openContactDialog() {
    if (!selectedOccurrence) return;
    try {
      setContactError('');
      const members = await api.contactOptions(selectedOccurrence.id);
      setContactMembers(members);
      setContactMemberId(members.find((member) => member.is_me && member.phone_ok)?.id ?? members.find((member) => member.phone_ok)?.id ?? null);
      setContactDialogOpen(true);
    } catch (error) {
      setToast({ kind: 'error', message: errorMessage(error, 'Não foi possível buscar os responsáveis pelo contato.') });
    }
  }

  async function confirmContact() {
    if (!selectedOccurrence || contactMemberId === null) return;
    const popUp = window.open('', '_blank');
    setContactBusy(true);
    setContactError('');
    try {
      const result = await api.contact(selectedOccurrence.id, contactMemberId);
      if (popUp) {
        popUp.location.href = result.whatsapp_url;
        popUp.opener = null;
      } else {
        window.open(result.whatsapp_url, '_blank', 'noopener,noreferrer');
      }
      setContactDialogOpen(false);
      setToast({ kind: 'success', message: 'Contato registrado. O WhatsApp foi aberto em uma nova aba.' });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      popUp?.close();
      setContactError(errorMessage(error, 'Não foi possível registrar o contato.'));
    } finally {
      setContactBusy(false);
    }
  }

  async function saveTreatment(payload: TreatmentPayload) {
    if (!selectedOccurrence) return;
    const currentId = selectedOccurrence.id;
    await api.saveTreatment(currentId, payload);
    const currentIndex = occurrences.findIndex((item) => item.id === currentId);
    const candidates = [...occurrences.slice(currentIndex + 1), ...occurrences.slice(0, Math.max(0, currentIndex))];
    const nextPending = candidates.find((item) => !item.treatment);
    if (nextPending) setSelectedId(nextPending.id);
    setRefreshKey((value) => value + 1);
    setToast({ kind: 'success', message: nextPending ? 'Tratativa salva. Próxima ocorrência pendente selecionada.' : 'Tratativa salva com sucesso.' });
  }

  // Das telas de Tratativas e Recorrência para a Fila, já filtrada (e com a ocorrência escolhida, se houver).
  function openInQueue(patch: Partial<OccurrenceFilters>, occurrenceId?: number) {
    const next: OccurrenceFilters = { ...filters, treated: '', search: '', page: 1, ...patch };
    setFilters(next);
    setView('queue');
    if (occurrenceId !== undefined) setSelectedId(occurrenceId);
    const query = filtersToSearch(next);
    window.history.pushState(null, '', query ? `/?${query}` : '/');
  }

  function openDrill(target: DrillTarget) {
    let next: OccurrenceFilters = { ...filters, treated: '', search: '', page: 1 };
    if (target.type === 'station') next = { ...next, stations: [target.id] };
    else if (target.type === 'seller') next = { ...next, search: String(target.id) };
    else next = { ...next, search: String(target.id) };
    setFilters(next);
    setView('queue');
    const query = filtersToSearch(next);
    window.history.pushState(null, '', query ? `/?${query}` : '/');
  }

  if (sessionState === 'checking') {
    return <main className="session-check"><BrandMark /><span className="button-spinner" /><p>Validando sessão segura…</p></main>;
  }
  if (sessionState === 'signed-out' || sessionState === 'error') {
    return <LoginScreen clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''} busy={loginBusy} error={authError} onLogin={handleLogin} onRetry={sessionState === 'error' ? () => void checkSession() : undefined} />;
  }

  const today = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <header className="app-header">
        <div className="header-brand"><BrandMark /><span className="brand-copy"><strong>No-Show Center</strong><small>FIRST MILE <i /> OPERAÇÃO BRASIL</small></span></div>
        <nav className="main-nav" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => <button key={item.view} type="button" className={`nav-link${view === item.view ? ' is-active' : ''}`} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}><Icon name={item.icon} size={16} />{item.label}</button>)}
        </nav>
        <div className="header-user"><span className="user-avatar">{(user?.email ?? 'U').slice(0, 1).toUpperCase()}</span><span className="user-copy"><strong>{user?.email ?? 'Usuário'}</strong><small>{roleLabel(user)}</small></span><button className="logout-button" type="button" aria-label="Sair da conta" title="Sair" onClick={() => void handleLogout()}><Icon name="logout" size={17} /></button></div>
      </header>

      <main id="main-content" className="main-content">
        <div className="page-heading">
          <div><span className="eyebrow">{HEADINGS[view].eyebrow}</span><h1>{HEADINGS[view].title}</h1><p>{HEADINGS[view].text}</p></div>
          <div className="heading-context"><span className="live-indicator"><i /> Sessão ativa</span><span className="context-date"><Icon name="calendar" size={14} />{today}</span></div>
        </div>

        {view === 'queue' && <KpiStrip data={summary} loading={summaryLoading} />}

        {lookupsError && <div className="inline-error" role="alert">{lookupsError} <button type="button" onClick={() => void checkSession()}>Recarregar</button></div>}
        <div className="view-toolbar">
          {view !== 'indicators' && <label className="queue-select-label" htmlFor="queue-select"><span>Fila</span><select id="queue-select" value={filters.queue} onChange={(event) => patchFilters({ ...filters, queue: event.target.value, page: 1 })}>{queues.map((queue) => <option key={queue.slug} value={queue.slug}>{queue.name}</option>)}</select></label>}
          <span className="toolbar-context">{view === 'queue' ? `${formatNumber(total)} registros no recorte` : HEADINGS[view].context}</span>
        </div>

        <FilterBar
          filters={filters}
          options={filterOptions}
          mode={view}
          onChange={patchFilters}
          onRange={(days) => patchFilters({ ...filters, ...dateRange(days), page: 1 })}
        />

        {view === 'queue' ? <>
          {listError && <div className="inline-error" role="alert"><Icon name="alert" size={16} />{listError}<button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Tentar novamente</button></div>}
          <div className={`queue-workspace${listLoading ? ' is-refreshing' : ''}`} aria-busy={listLoading}>
            <OccurrenceList items={occurrences} selectedId={selectedId} total={total} page={filters.page} onSelect={setSelectedId} onPage={(page) => patchFilters({ ...filters, page })} />
            {selectedOccurrence ? <OccurrenceDetail occurrence={selectedOccurrence} queue={selectedQueue} history={history} historyLoading={historyLoading} historyError={historyError} onContact={() => void openContactDialog()} onSaveTreatment={saveTreatment} /> : <section className="panel detail-placeholder"><span><Icon name={listLoading ? 'activity' : 'inbox'} size={26} /></span><h2>{listLoading ? 'Atualizando a fila…' : 'Selecione uma ocorrência'}</h2><p>{listLoading ? 'Os registros do recorte estão sendo carregados.' : 'Escolha um item à esquerda para conferir as evidências e a tratativa.'}</p>{historyError && <small role="alert">{historyError}</small>}</section>}
          </div>
        </> : view === 'insights' ? <InsightsView data={insights} loading={insightsLoading} error={insightsError} onDrill={openDrill} />
          : lookupsLoading ? <div className="panel insights-loading"><span className="button-spinner" />Carregando…</div>
          : view === 'indicators' ? <IndicatorsView base={filters} onOpenInQueue={openInQueue} />
          : view === 'treatments' ? <TreatmentsView queues={queues} base={filters} onOpenInQueue={openInQueue} onNotify={(kind, message) => setToast({ kind, message })} />
          : <RecurrenceView base={filters} onOpenInQueue={openInQueue} />}
      </main>

      <footer className="app-footer"><span><BrandMark />No-Show Center <i /> First Mile</span><span>Datas e horários em America/Sao_Paulo</span></footer>

      {contactDialogOpen && <ContactDialog members={contactMembers} selectedId={contactMemberId} busy={contactBusy} error={contactError} onSelect={setContactMemberId} onClose={() => setContactDialogOpen(false)} onConfirm={() => void confirmContact()} />}
      {toast && <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}><Icon name={toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert' : 'shield'} size={17} /><span>{toast.message}</span><button type="button" aria-label="Dispensar aviso" onClick={() => setToast(null)}><Icon name="close" size={15} /></button></div>}
    </div>
  );
}
