import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import type { OAuthAuthorizationDetails, Session } from '@supabase/supabase-js';
import './style.css';

const projectUrl = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = projectUrl && publicKey ? createClient(projectUrl, publicKey) : null;
const authorizationId = new URL(location.href).searchParams.get('authorization_id');

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [authorization, setAuthorization] = useState<OAuthAuthorizationDetails | null>(null);
  const [siteToolsActive, setSiteToolsActive] = useState(false);
  const [items, setItems] = useState<Array<{ id: string; title: string; brand: string; model: string; revision: number }>>([]);

  useEffect(() => {
    if (!session || !supabase || !navigator.modelContext) { setSiteToolsActive(false); return; }
    let cancelled = false;
    let unregister: (() => void) | undefined;
    void import('./site-tools.ts').then(({ registerInventorySiteTools }) => {
      if (cancelled) return;
      unregister = registerInventorySiteTools(navigator.modelContext!, async (name, args) => {
        if (cancelled) throw new Error('Diese Anmeldung ist nicht mehr aktiv.');
        const { data, error: commandError } = await supabase!.rpc('inventory_command', { command_name: name, arguments: args });
        if (commandError) throw new Error(commandError.message);
        if (!cancelled && !authorizationId) {
          const { data: refreshed } = await supabase!.rpc('inventory_command', { command_name: 'search_inventory', arguments: { query: '', limit: 20, offset: 0 } });
          if (!cancelled && refreshed) setItems(refreshed.items);
        }
        return data;
      });
      setSiteToolsActive(true);
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Seitenwerkzeuge konnten nicht verbunden werden.'); });
    return () => { cancelled = true; unregister?.(); };
  }, [session]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (authError) setError(authError.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, value) => { setSession(value); });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) { setItems([]); setAuthorization(null); return; }
    let active = true;
    async function load() {
      try {
        if (authorizationId) {
          const { data, error: consentError } = await supabase!.auth.oauth.getAuthorizationDetails(authorizationId);
          if (consentError) throw consentError;
          if (!active || !data) return;
          if ('redirect_url' in data) { location.assign(data.redirect_url); return; }
          setAuthorization(data);
        } else {
          const { data, error: commandError } = await supabase!.rpc('inventory_command', { command_name: 'search_inventory', arguments: { query: '', limit: 20, offset: 0 } });
          if (commandError) throw commandError;
          if (active) setItems(data.items);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Verbindung fehlgeschlagen.');
      }
    }
    void load();
    return () => { active = false; };
  }, [session]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (codeSent) {
        const { error: authError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
        if (authError) throw authError;
      } else {
        const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + location.search } });
        if (authError) throw authError;
        setCodeSent(true);
        setNotice('Öffne den Anmeldelink in deiner E-Mail oder gib den mitgesendeten Code ein.');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Anmeldung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }

  async function consent(approve: boolean) {
    if (!supabase || !authorizationId || busy) return;
    setBusy(true); setError('');
    try {
      const method = approve ? supabase.auth.oauth.approveAuthorization.bind(supabase.auth.oauth) : supabase.auth.oauth.denyAuthorization.bind(supabase.auth.oauth);
      const { data, error: consentError } = await method(authorizationId, { skipBrowserRedirect: true });
      if (consentError) throw consentError;
      if (data) location.assign(data.redirect_url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Verbindung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <header><a href="/" className="brand">smairys<span>.inventar</span></a><span className="header-caption">Musik & Lothars Erbe</span></header>
    <main>
      <div className="intro"><span className="eyebrow">Deine Sammlung</span><h1>{authorizationId ? 'Mit ChatGPT verbinden.' : 'Alles hat eine Geschichte.'}</h1><p>Instrumente, Bauteile und Lothars Notizen an einem Ort.</p></div>
      <section className="glass" aria-label="Inventarzugang">
        {!supabase ? <><h2>Verbindung vorbereiten</h2><p>Supabase-URL und Publishable Key in der Umgebung hinterlegen, um die Anmeldung zu starten.</p></> : loading ? <p role="status">Verbindung wird geprüft …</p> : !session ? <>
          <h2>Dein Inventar öffnen</h2><p>Melde dich mit deiner E-Mail-Adresse an.</p>
          <form onSubmit={login}><label htmlFor="email">E-Mail-Adresse</label><input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy || codeSent} placeholder="name@beispiel.de" />
            {codeSent && <><label htmlFor="code">Anmeldecode</label><input id="code" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={event => setCode(event.target.value)} required /></>}
            <button disabled={busy} type="submit">{busy ? 'Einen Moment …' : codeSent ? 'Anmelden' : 'Anmeldelink senden'}</button>
            {codeSent && <button className="quiet" type="button" onClick={() => { setCodeSent(false); setCode(''); }}>Andere E-Mail verwenden</button>}
          </form>
        </> : authorizationId ? <>
          <h2>{authorization?.client.name ?? 'Verbindung prüfen'}</h2>
          {authorization ? <><p>Diese Verbindung kann dein Inventar durchsuchen, Gegenstände erfassen und ändern sowie Notizen und eigene Kategorien erstellen.</p><dl><dt>Angemeldet als</dt><dd>{session.user.email}</dd><dt>Angefragte Kontodaten</dt><dd>{authorization.scope || 'Keine zusätzlichen Kontodaten'}</dd><dt>Rückkehradresse</dt><dd className="wrap">{authorization.redirect_uri}</dd></dl><div className="actions"><button disabled={busy} onClick={() => void consent(true)}>Zugriff erlauben</button><button className="quiet" disabled={busy} onClick={() => void consent(false)}>Ablehnen</button></div></> : <p>Die Zugriffsanfrage wird geladen.</p>}
        </> : <>
          <div className="section-header"><h2>Inventar</h2><button className="quiet small" onClick={() => void supabase.auth.signOut().then(({ error: authError }) => { if (authError) setError(authError.message); })}>Abmelden</button></div>
          {items.length ? <ul className="inventory-list">{items.map(item => <li key={item.id}><strong>{item.title}</strong><span>{[item.brand, item.model].filter(Boolean).join(' · ') || 'Details noch offen'}</span></li>)}</ul> : <p>Dein Online-Inventar ist bereit für die ersten Gegenstände.</p>}
          <p className="muted">Angemeldet als {session.user.email}</p>
          {siteToolsActive && <p className="muted">Inventarwerkzeuge sind für ChatGPT auf dieser Seite verfügbar.</p>}
        </>}
        {notice && <p role="status" className="notice">{notice}</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </main>
    <footer>Originale bewahren. Zusammenhänge verstehen.</footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
