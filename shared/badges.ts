export const BADGES = [
  { id: 'zero-guesses', name: 'Cero aciertos', icon: '🥔', description: 'Terminaste una partida sin adivinar ningún dibujo, habiendo tenido turnos para adivinar.' },
  { id: 'silent-round', name: 'Ronda en blanco', icon: '👻', description: 'Estuviste desde el inicio de una ronda completa y no adivinaste ningún dibujo en ella.' },
  { id: 'misunderstood', name: 'Arte incomprendido', icon: '🎨', description: 'Dibujaste, se agotó el tiempo y nadie adivinó, con al menos un adivinador conectado. Los reportes no cuentan.' },
  { id: 'last-place', name: 'Último de la tropa', icon: '🐢', description: 'Terminaste en el último puesto de una partida, por debajo del primer puesto y con oportunidades de adivinar.' },
] as const;
export type BadgeId = typeof BADGES[number]['id'];
