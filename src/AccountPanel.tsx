import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound, X } from 'lucide-react';
import type { AccountUser } from '../shared/types';
import { DEFAULT_AVATAR } from '../shared/types';
import { AvatarPicker } from './AvatarPicker';
import { BadgeCollection } from './Badges';
import { PasswordInput } from './PasswordInput';

export function AccountPanel({ user, disabled, onChanged, initialName, initialAvatar }: { user: AccountUser | null; disabled: boolean; onChanged: (user: AccountUser | null) => void; initialName: string; initialAvatar: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('restablecer') ?? '');
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(() => new URLSearchParams(location.hash.slice(1)).has('restablecer') ? 'reset' : 'login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState(DEFAULT_AVATAR);
  const [confirmation, setConfirmation] = useState(''); const [success, setSuccess] = useState('');
  const [passwordVersion, setPasswordVersion] = useState(0);
  useEffect(() => {
    if (resetToken) {
      history.replaceState({}, '', location.pathname + location.search);
      dialog.current?.showModal();
    }
  }, []);
  function switchMode(next: typeof mode) {
    setMode(next); setError(''); setSuccess(''); setPassword(''); setConfirmation('');
  }
  async function recover() {
    setError(''); setSuccess('');
    if (mode === 'reset' && password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/password/${mode === 'forgot' ? 'forgot' : 'reset'}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'forgot' ? { email: email.trim() } : { token: resetToken, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la operación.');
      if (mode === 'reset') { onChanged(null); setResetToken(''); switchMode('login'); setPasswordVersion(value => value + 1); }
      setSuccess(data.message);
    } catch (error) { setError(error instanceof Error ? error.message : 'No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }
  async function submit(operation: 'login' | 'register' | 'logout' | 'profile') {
    setBusy(true); setError('');
    try {
      const response = await fetch(operation === 'profile' ? '/api/profile' : `/api/auth/${operation}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation === 'profile' ? { name: profileName, avatar: profileAvatar } : operation === 'logout' ? {} : { email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la operación.');
      onChanged(data.user); setPassword(''); dialog.current?.close();
    } catch (error) { setError(error instanceof Error ? error.message : 'No hay conexión con el servidor.'); }
    finally { setBusy(false); }
  }
  return <>
    <button className="account-trigger" aria-label={user ? 'Mi cuenta' : 'Entrar con cuenta'} title={user ? 'Mi cuenta' : 'Entrar con cuenta'} disabled={disabled} onClick={() => { setError(''); setSuccess(''); setProfileName(user?.name ?? initialName); setProfileAvatar(user?.name ? user.avatar : initialAvatar); dialog.current?.showModal(); }}><UserRound size={17} /><span>{user ? 'Mi cuenta' : 'Entrar con cuenta'}</span></button>
    <dialog ref={dialog} className="account-dialog" aria-labelledby="account-title" onClose={() => { setPassword(''); setConfirmation(''); setPasswordVersion(value => value + 1); }}>
      <div className="account-heading"><h2 id="account-title">{mode === 'reset' ? 'Nueva contraseña' : user ? 'Mi cuenta' : mode === 'forgot' ? 'Recuperar contraseña' : mode === 'register' ? 'Crear cuenta' : 'Entrar con cuenta'}</h2><button className="icon-button" aria-label="Cerrar cuenta" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      {user && mode !== 'reset' ? <><p className="account-email">{user.email}</p>
        <form onSubmit={event => { event.preventDefault(); void submit('profile'); }}>
          <label htmlFor="profile-name">Tu apodo</label>
          <div className="input-with-icon profile-identity"><AvatarPicker value={profileAvatar} onChange={setProfileAvatar} /><input id="profile-name" autoComplete="nickname" value={profileName} minLength={2} maxLength={20} required disabled={busy} onChange={event => setProfileName(event.target.value)} /></div>
          <p className="profile-note">Toca el avatar para cambiarlo. Tu perfil se guarda en tu cuenta y aparece en el ranking.</p>
          <button className="button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar perfil'}</button>
        </form>
        <BadgeCollection ids={user.badges} />
        <button className="button secondary profile-logout" disabled={busy} onClick={() => void submit('logout')}><LogOut size={15} />Cerrar sesión</button></> : mode === 'forgot' || mode === 'reset' ? <>
        <p className="account-note">{mode === 'forgot' ? 'Te enviaremos un enlace para elegir una contraseña nueva.' : 'Elige una contraseña de al menos 10 caracteres. Al guardar se cerrarán las sesiones anteriores.'}</p>
        <form onSubmit={event => { event.preventDefault(); void recover(); }}>
          {mode === 'forgot' ? <label>Correo<input type="email" autoComplete="email" value={email} maxLength={254} required disabled={busy} onChange={event => setEmail(event.target.value)} /></label> : <>
            <PasswordInput key={`new-${passwordVersion}`} label="Nueva contraseña" value={password} onChange={setPassword} autoComplete="new-password" disabled={busy} />
            <PasswordInput key={`confirm-${passwordVersion}`} label="Confirmar contraseña" value={confirmation} onChange={setConfirmation} autoComplete="new-password" disabled={busy} />
          </>}
          <button className="button primary" disabled={busy}>{busy ? 'Un ratito…' : mode === 'forgot' ? 'Enviar enlace' : 'Guardar nueva contraseña'}</button>
        </form>
        <button type="button" className="account-switch" disabled={busy} onClick={() => switchMode('login')}>Volver a iniciar sesión</button>
        {mode === 'reset' && <button type="button" className="account-switch" disabled={busy} onClick={() => switchMode('forgot')}>Pedir otro enlace</button>}
      </> : <>
        <p className="account-note">Es opcional. También puedes jugar solo con tu apodo.</p>
        <form onSubmit={event => { event.preventDefault(); void submit(mode === 'register' ? 'register' : 'login'); }}>
          <label>Correo<input type="email" autoComplete="email" value={email} maxLength={254} required onChange={event => setEmail(event.target.value)} /></label>
          <PasswordInput key={`${mode}-${passwordVersion}`} value={password} onChange={setPassword} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} disabled={busy} />
          {mode === 'register' && <p className="password-note">Al menos 10 caracteres.</p>}
          <button className="button primary" disabled={busy}>{busy ? 'Un ratito…' : mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</button>
        </form>
        {mode === 'login' && <button type="button" className="account-switch forgot-password" disabled={busy} onClick={() => switchMode('forgot')}>Olvidé mi contraseña</button>}
        <button className="account-switch" disabled={busy} onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '¿No tienes cuenta? Créala aquí' : 'Ya tengo cuenta'}</button>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
    </dialog>
  </>;
}
