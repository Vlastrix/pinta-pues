import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordInput({ label = 'Contraseña', value, onChange, autoComplete, disabled }: {
  label?: string; value: string; onChange: (value: string) => void; autoComplete: string; disabled?: boolean;
}) {
  const id = useId(); const [visible, setVisible] = useState(false);
  return <div className="password-field"><label htmlFor={id}>{label}</label><div className="password-input">
    <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value} minLength={10} maxLength={128} required disabled={disabled} onChange={event => onChange(event.target.value)} />
    <button type="button" aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(previous => !previous)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  </div></div>;
}
