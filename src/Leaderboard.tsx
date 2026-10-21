import { useEffect, useState } from 'react';
import { RefreshCw, Trophy } from 'lucide-react';
import type { LeaderboardEntry } from '../shared/types';
import { AvatarImage } from './AvatarPicker';
import { Badges } from './Badges';

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    void fetch('/api/leaderboard', { signal: controller.signal, credentials: 'same-origin' }).then(async response => {
      if (!response.ok) throw new Error('Ranking no disponible');
      const data: LeaderboardEntry[] = await response.json();
      if (!controller.signal.aborted) setEntries(data);
    }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  return <section className="leaderboard panel" aria-labelledby="leaderboard-title" aria-busy={loading}>
    <div className="panel-heading"><Trophy size={19} /><h2 id="leaderboard-title">Top 10 de la tropa</h2><button className="icon-button" aria-label="Actualizar ranking" title="Actualizar ranking" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} /></button></div>
    <p className="leaderboard-note">Puntos acumulados en partidas terminadas. Juega con cuenta para aparecer.</p>
    {loading ? <p className="leaderboard-status" role="status">Buscando a las leyendas…</p> : error ? <p className="leaderboard-status" role="status">No se pudo cargar el ranking. Intenta actualizarlo.</p> : entries.length === 0 ?
      <p className="leaderboard-status">La cima está libre, pues. ¡Termina una partida con tu cuenta!</p> :
      <ol className="leaderboard-list">{entries.map(entry => <li key={entry.rank} className={entry.isYou ? 'leaderboard-you' : ''}>
        <span className="leaderboard-rank">{entry.rank}</span>
        <span className="avatar player-avatar"><AvatarImage seed={entry.avatar} alt={`Avatar de ${entry.name}`} /></span>
        <div className="leaderboard-player"><strong>{entry.name}{entry.isYou && <small> (vos)</small>}</strong><span>{entry.games} {entry.games === 1 ? 'partida' : 'partidas'} · {entry.wins} {entry.wins === 1 ? 'victoria' : 'victorias'}</span><Badges ids={entry.badges} /></div>
        <strong className="leaderboard-points">{entry.points.toLocaleString('es-BO')}<small>puntos</small></strong>
      </li>)}</ol>}
  </section>;
}
