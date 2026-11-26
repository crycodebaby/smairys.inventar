export function authErrorMessage(code?: string) {
  switch (code) {
    case 'otp_expired': return 'Dieser Anmeldelink ist abgelaufen oder wurde bereits verwendet. Fordere einen neuen Link an und öffne nur die neueste E-Mail.';
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Es wurden zu viele Anfragen gesendet. Warte bitte kurz, bevor du einen neuen Link anforderst.';
    case 'email_address_not_authorized': return 'Der E-Mail-Versand ist für diese Adresse im Supabase-Projekt noch nicht freigegeben.';
    case 'email_address_invalid': return 'Bitte prüfe deine E-Mail-Adresse.';
    default: return 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte fordere einen neuen Anmeldelink an.';
  }
}

export function authReturnError(url: string): string | null {
  const fragment = new URLSearchParams(new URL(url).hash.slice(1));
  return fragment.has('error') || fragment.has('error_code') ? authErrorMessage(fragment.get('error_code') ?? undefined) : null;
}

export function loginRedirectUrl(currentUrl: string, appUrl: string): string {
  const current = new URL(currentUrl);
  const target = new URL('/', appUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if (target.protocol !== 'https:' && !(local && target.protocol === 'http:')) throw new Error('Ungültige Anmelde-Rückkehradresse.');
  const authorization = current.searchParams.get('authorization_id');
  if (authorization && authorization.length <= 200) target.searchParams.set('authorization_id', authorization);
  return target.href;
}

export function oauthRedirectUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Ungültige OAuth-Rückkehradresse.');
  return url.href;
}
