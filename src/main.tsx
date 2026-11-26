import { lazy, Suspense, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import type { OAuthAuthorizationDetails, Session } from '@supabase/supabase-js';
import { authErrorMessage, authReturnError, loginRedirectUrl } from './auth-flow.ts';
import './style.css';

const projectUrl = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const returnedAuthError = authReturnError(location.href);
if (returnedAuthError) history.replaceState(history.state, '', location.pathname + location.search);
const supabase = projectUrl && publicKey ? createClient(projectUrl, publicKey) : null;
const authorizationId = new URL(location.href).searchParams.get('authorization_id');
const InventoryWorkspace = lazy(() => import('./InventoryWorkspace.tsx'));

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(returnedAuthError ?? '');
  const [authorization, setAuthorization] = useState<OAuthAuthorizationDetails | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (authError) setError(authErrorMessage(authError.code));
      setSession(data.session);
    }).catch(() => setError('Die Anmeldung konnte nicht geprüft werden. Bitte lade die Seite erneut.')).finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((event, value) => {
      setSession(value);
      if (event === 'SIGNED_IN') { setNotice(''); setError(''); setCodeSent(false); setCode(''); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session || !authorizationId) { setAuthorization(null); return; }
    let active = true;
    async function load() {
      try {
        if (authorizationId) {
          const { data, error: consentError } = await supabase!.auth.oauth.getAuthorizationDetails(authorizationId);
          if (consentError) throw consentError;
          if (!active || !data) return;
          if ('redirect_url' in data) { location.assign(data.redirect_url); return; }
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
    setBusy(true); setError(''); setNotice('');
    try {
      if (codeSent) {
        const { error: authError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
        if (authError) throw new Error(authErrorMessage(authError.code));
      } else {
        const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: loginRedirectUrl(location.href, import.meta.env.DEV ? location.origin : import.meta.env.VITE_APP_URL || 'https://inventar.smairys.de') } });
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
      if (data) location.assign(data.redirect_url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Verbindung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <header><a href="/" className="brand">smairys<span>.inventar</span></a><span className="header-caption">Musik & Lothars Erbe</span></header>
    <main className={session && !authorizationId ? 'workspace-main' : undefined}>
      <div className="intro"><span className="eyebrow">Deine Sammlung</span><h1>{authorizationId ? 'Mit ChatGPT verbinden.' : 'Alles hat eine Geschichte.'}</h1><p>Instrumente, Bauteile und Lothars Notizen an einem Ort.</p></div>
      <section className="glass" aria-label="Inventarzugang">
        {!supabase ? <><h2>Verbindung vorbereiten</h2><p>Supabase-URL und Publishable Key in der Umgebung hinterlegen, um die Anmeldung zu starten.</p></> : loading ? <p role="status">Verbindung wird geprüft …</p> : !session ? <>
          <h2>Dein Inventar öffnen</h2><p>Melde dich mit deiner E-Mail-Adresse an.</p>
          <form onSubmit={login}><label htmlFor="email">E-Mail-Adresse</label><input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy || codeSent} placeholder="name@beispiel.de" />
            {codeSent && <><label htmlFor="code">Anmeldecode</label><input id="code" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={event => setCode(event.target.value)} required /></>}
            <button disabled={busy} type="submit">{busy ? 'Einen Moment …' : codeSent ? 'Anmelden' : 'Anmeldelink senden'}</button>
            {codeSent && <button className="quiet" type="button" disabled={busy} onClick={() => { setCodeSent(false); setCode(''); setNotice(''); }}>Neuen Link anfordern / E-Mail ändern</button>}
          </form>
        </> : authorizationId ? <>
          <h2>{authorization?.client.name ?? 'Verbindung prüfen'}</h2>
          {authorization ? <><p>Diese Verbindung kann dein Inventar durchsuchen, Gegenstände erfassen und ändern sowie Notizen und eigene Kategorien erstellen.</p><dl><dt>Angemeldet als</dt><dd>{session.user.email}</dd><dt>Angefragte Kontodaten</dt><dd>{authorization.scope || 'Keine zusätzlichen Kontodaten'}</dd><dt>Rückkehradresse</dt><dd className="wrap">{authorization.redirect_uri}</dd></dl><div className="actions"><button disabled={busy} onClick={() => void consent(true)}>Zugriff erlauben</button><button className="quiet" disabled={busy} onClick={() => void consent(false)}>Ablehnen</button></div></> : <p>Die Zugriffsanfrage wird geladen.</p>}
        </> : <>
          <Suspense fallback={<p role="status">Inventar wird geöffnet …</p>}><InventoryWorkspace key={session.user.id} session={session} projectUrl={projectUrl!} publicKey={publicKey!} onSignOut={() => void supabase.auth.signOut().then(({ error: authError }) => { if (authError) setError(authError.message); })} /></Suspense>
        </>}
        {notice && <p role="status" className="notice">{notice}</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </main>
    <footer>Originale bewahren. Zusammenhänge verstehen.</footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
