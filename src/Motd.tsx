import { useState } from 'react';

import { motdMessages as messages } from '../shared/motd';

export function Motd() {
  const [message] = useState(() => messages[Math.floor(Math.random() * messages.length)]);
  return <p className="motd">{message}</p>;
}
