import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { authErrorMessage, authReturnError, loginRedirectUrl, oauthRedirectUrl } from './auth-flow.ts';
import { accessTransition, rememberedIdentity } from './offline-state.ts';
import { useAppShell } from './use-app-shell.ts';
import './style.css';

const projectUrl = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const returnedAuthError = authReturnError(location.href);
if (returnedAuthError) history.replaceState(history.state, '', location.pathname + location.search);
const authKey = projectUrl ? `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token` : '';
const supabase = projectUrl && publicKey ? createClient(projectUrl, publicKey, { auth: { storageKey: authKey } }) : null;
const authorizationId = new URL(location.href).searchParams.get('authorization_id');
const InventoryWorkspace = lazy(() => import('./InventoryWorkspace.tsx'));

function App() {
  const [access, dispatch] = useReducer(accessTransition, { kind: 'starting' });
  const shell = useAppShell();
  const session = access.kind === 'signed-in' ? access.session : null;
  const identity = access.kind === 'local' ? access.identity : session?.user ?? null;
  const activeOwner = useRef<string | null>(null);
  activeOwner.current = identity?.id ?? null;
  const signedOutLocally = useRef(false);
  const [connected, setConnected] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(returnedAuthError ?? '');
  const [authorization, setAuthorization] = useState<OAuthAuthorizationDetails | null>(null);

  useEffect(() => {
    if (!supabase || !projectUrl) { dispatch({ type: 'signed-out' }); return; }
    const auth = supabase.auth;
    let active = true;
    let knownSession = false;
    let reconnecting = false;
    let generation = 0;
    const remember = () => {
      try { return rememberedIdentity(window.localStorage, authKey, projectUrl); }
      catch { return null; }
    };
    const local = () => dispatch({ type: 'local', remembered: remember() });
    const offline = () => { setConnected(false); if (!knownSession) local(); };
    const online = () => {
      setConnected(true);
      if (reconnecting) return;
      reconnecting = true;
      const version = generation;
      void auth.getSession().then(({ data }) => {
        if (active && !signedOutLocally.current && generation === version) dispatch({ type: 'session', session: data.session, remembered: remember() });
      }).catch(() => { if (active && !signedOutLocally.current && generation === version) local(); }).finally(() => { reconnecting = false; });
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== authKey && event.key !== null) return;
      const owner = remember();
      if (!owner || (activeOwner.current && owner.id !== activeOwner.current)) {
        generation++;
        knownSession = false;
        if (navigator.onLine) { dispatch({ type: 'signed-out' }); online(); }
        else local();
      }
    };
    if (!navigator.onLine) local();
    const deadline = window.setTimeout(() => { if (!knownSession) local(); }, 4_000);
    const { data } = auth.onAuthStateChange((event, value) => {
      if (!active || signedOutLocally.current) return;
      generation++;
      knownSession = !!value;
      if (event === 'SIGNED_OUT') {
        const owner = activeOwner.current;
        dispatch({ type: 'signed-out' });
        if (owner) window.setTimeout(() => {
          void import('./offline-inventory.ts').then(module => module.clearOfflineInventory(projectUrl, owner)).catch(() => {});
        });
        return;
      }
      dispatch({ type: 'session', session: value, remembered: value ? null : remember() });
      if (event === 'SIGNED_IN') { setNotice(''); setError(''); setCodeSent(false); setCode(''); }
    });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', storageChanged);
    return () => {
      active = false;
      window.clearTimeout(deadline);
      data.subscription.unsubscribe();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('storage', storageChanged);
    };
  }, []);

  async function signOut() {
    if (!supabase || !projectUrl) return;
    if (navigator.onLine && session) {
      const { error: authError } = await supabase.auth.signOut({ scope: 'local' });
      if (authError) setError(authErrorMessage(authError.code));
      return;
    }
    // The local copy becomes inaccessible before any asynchronous cleanup.
    const owner = identity?.id;
    try { window.localStorage.removeItem(authKey); }
    catch { setError('Lokale Abmeldung fehlgeschlagen.'); return; }
    signedOutLocally.current = true;
    dispatch({ type: 'signed-out' });
    if (owner) {
      void import('./offline-inventory.ts').then(module => module.clearOfflineInventory(projectUrl, owner)).catch(() => {});
    }
  }

  useEffect(() => {
    if (!supabase || !session || !authorizationId) { setAuthorization(null); return; }
    let active = true;
    async function load() {
      try {
        if (authorizationId) {
          const { data, error: consentError } = await supabase!.auth.oauth.getAuthorizationDetails(authorizationId);
          if (consentError) throw consentError;
          if (!active || !data) return;
          if ('redirect_url' in data) { location.assign(oauthRedirectUrl(data.redirect_url)); return; }
          setAuthorization(data);
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
    signedOutLocally.current = false;
    setBusy(true); setError(''); setNotice('');
    try {
      if (codeSent) {
        const { error: authError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
        if (authError) throw new Error(authErrorMessage(authError.code));
      } else {
        const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: loginRedirectUrl(location.href, import.meta.env.DEV ? location.origin : import.meta.env.VITE_APP_URL || 'https://inventar.smairys.de') } });
        if (authError) throw new Error(authErrorMessage(authError.code));
        setCodeSent(true);
        setNotice('Öffne den Link aus der neuesten E-Mail. Falls sie einen Anmeldecode enthält, kannst du ihn hier eingeben.');
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
      if (data) location.assign(oauthRedirectUrl(data.redirect_url));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Verbindung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <header className="site-header"><a href="/" className="brand"><img src="/app-icon.svg" alt="" width="34" height="34"/><span>smairys<span className="brand-suffix">.inventar</span></span></a></header>
    <main className={identity && !authorizationId ? 'workspace-main' : 'access-main'}>
      <section className="glass" aria-label="Inventarzugang">
        {!supabase ? <><h2>Verbindung vorbereiten</h2><p>Supabase-URL und Publishable Key in der Umgebung hinterlegen, um die Anmeldung zu starten.</p></> : access.kind === 'starting' ? <p className="state-message" role="status">Inventar wird geöffnet …</p> : !identity || (authorizationId && !session) ? <>
          <h1 className="access-title">Anmelden</h1>
          {!connected && <p className="state-message" role="status">Anmeldung benötigt eine Internetverbindung.</p>}
          <form onSubmit={login}><label htmlFor="email">E-Mail-Adresse</label><input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy || codeSent} placeholder="name@beispiel.de" />
            {codeSent && <><label htmlFor="code">Anmeldecode</label><input id="code" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={event => setCode(event.target.value)} required /></>}
            <button disabled={busy || !connected} type="submit">{busy ? 'Einen Moment …' : codeSent ? 'Anmelden' : 'Anmeldelink senden'}</button>
            {codeSent && <button className="quiet" type="button" disabled={busy} onClick={() => { setCodeSent(false); setCode(''); setNotice(''); }}>Neuen Link anfordern / E-Mail ändern</button>}
          </form>
        </> : authorizationId ? <>
          <h2>{authorization?.client.name ?? 'Verbindung prüfen'}</h2>
          {authorization && session ? <><p>Diese Verbindung kann dein Inventar durchsuchen, Gegenstände erfassen und ändern sowie Notizen und eigene Kategorien erstellen.</p><dl><dt>Angemeldet als</dt><dd>{session.user.email}</dd><dt>Angefragte Kontodaten</dt><dd>{authorization.scope || 'Keine zusätzlichen Kontodaten'}</dd><dt>Rückkehradresse</dt><dd className="wrap">{authorization.redirect_uri}</dd></dl><div className="actions"><button disabled={busy} onClick={() => void consent(true)}>Zugriff erlauben</button><button className="quiet" disabled={busy} onClick={() => void consent(false)}>Ablehnen</button></div></> : <p>Die Zugriffsanfrage wird geladen.</p>}
        </> : <>
          <Suspense fallback={<p className="state-message" role="status">Inventar wird geöffnet …</p>}><InventoryWorkspace key={identity.id} identity={identity} session={session} shell={shell} projectUrl={projectUrl!} publicKey={publicKey!} onSignOut={() => void signOut().catch(() => setError('Abmeldung fehlgeschlagen.'))} /></Suspense>
        </>}
        {notice && <p role="status" className="notice">{notice}</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
