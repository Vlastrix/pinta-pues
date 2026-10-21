import { Trash2 } from 'lucide-react';
import type { Message } from '../shared/types';

export function ChatMessages({ messages, you, onDelete }: {
  messages: Message[]; you: string; onDelete?: (id: string) => void;
}) {
  const sameAuthor = (a: Message | undefined, b: Message) => a?.kind === 'chat' && b.kind === 'chat'
    && (a.senderId && b.senderId ? a.senderId === b.senderId : a.name === b.name);
  return messages.map((message, index) => {
    if (message.kind !== 'chat') return <div className={`message ${message.kind}`} key={message.id}>
      <span>{message.kind === 'correct' ? '✦ ' : ''}{message.text}</span>
    </div>;
    const start = !sameAuthor(messages[index - 1], message);
    const end = !sameAuthor(messages[index + 1], message);
    return <div className={`message chat ${message.senderId === you ? 'own' : ''} ${start ? 'group-start' : ''} ${end ? 'group-end' : ''}`} key={message.id}>
      {start && <strong>{message.name}</strong>}
      <span>{message.text}</span>
      {onDelete && <button className="delete-message" aria-label={`Borrar mensaje de ${message.name}`} title="Borrar mensaje" onClick={() => onDelete(message.id)}><Trash2 size={12} /></button>}
    </div>;
  });
}
