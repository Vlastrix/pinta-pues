import { useRef, useState } from 'react';
import { LogOut, UserRound, X } from 'lucide-react';
import type { AccountUser } from '../shared/types';

export function AccountPanel({ user, disabled, onChanged }: { user: AccountUser | null; disabled: boolean; onChanged: (user: AccountUser | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(operation: 'login' | 'register' | 'logout') {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/auth/${operation}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation === 'logout' ? {} : { email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la operación.');
      onChanged(data.user); setPassword(''); dialog.current?.close();
    } catch (error) { setError(error instanceof Error ? error.message : 'No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }
  return <>
    <button className="account-trigger" aria-label={user ? 'Mi cuenta' : 'Entrar con cuenta'} title={user ? 'Mi cuenta' : 'Entrar con cuenta'} disabled={disabled} onClick={() => { setError(''); dialog.current?.showModal(); }}><UserRound size={17} /><span>{user ? 'Mi cuenta' : 'Entrar con cuenta'}</span></button>
    <dialog ref={dialog} className="account-dialog" aria-labelledby="account-title" onClose={() => setPassword('')}>
      <div className="account-heading"><h2 id="account-title">{user ? 'Mi cuenta' : mode === 'register' ? 'Crear cuenta' : 'Entrar con cuenta'}</h2><button className="icon-button" aria-label="Cerrar cuenta" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      {user ? <><p className="account-email">{user.email}</p><button className="button secondary" disabled={busy} onClick={() => void submit('logout')}><LogOut size={15} />Cerrar sesión</button></> : <>
        <p className="account-note">Es opcional. También puedes jugar solo con tu apodo.</p>
        <form onSubmit={event => { event.preventDefault(); void submit(mode); }}>
          <label>Correo<input type="email" autoComplete="email" value={email} maxLength={254} required onChange={event => setEmail(event.target.value)} /></label>
          <label>Contraseña<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} minLength={10} maxLength={128} required onChange={event => setPassword(event.target.value)} /></label>
          {mode === 'register' && <p className="password-note">Al menos 10 caracteres.</p>}
          <button className="button primary" disabled={busy}>{busy ? 'Un ratito…' : mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</button>
        </form>
        <button className="account-switch" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setPassword(''); }}>{mode === 'login' ? '¿No tienes cuenta? Créala aquí' : 'Ya tengo cuenta'}</button>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </dialog>
  </>;
}
