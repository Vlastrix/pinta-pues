import type { CSSProperties } from 'react';
import { Sparkles, Star } from 'lucide-react';

export function GuessCelebration({ points }: { points: number }) {
  return <div className="guess-celebration" role="status" aria-label={`¡Esa era, pues! Ganaste ${points} puntos.`}>
    <div className="guess-sparks" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => {
      const angle = index * Math.PI / 4;
      return <Star key={index} size={index % 2 ? 15 : 20} style={{ '--dx': `${Math.cos(angle) * 100}px`, '--dy': `${Math.sin(angle) * 70}px`, '--delay': `${index * .035}s` } as CSSProperties} />;
    })}</div>
    <div className="guess-reward-card"><Sparkles size={23} aria-hidden="true" /><strong>¡Esa era, pues!</strong><span>+{points} <small>puntos</small></span><p>Una neurona más para la tropa.</p></div>
  </div>;
}
