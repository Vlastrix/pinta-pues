export type RoomSession = { code: string; token: string };
const key = 'pinta-room-session';

export function readRoomSession(): RoomSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!value || !/^[A-F0-9]{6}$/.test(value.code) || !/^[a-f0-9]{64}$/.test(value.token)) return null;
    const requested = new URLSearchParams(location.search).get('sala')?.toUpperCase();
    return requested && requested !== value.code ? null : value;
  } catch { return null; }
}

export function saveRoomSession(value: RoomSession) {
  if (!/^[A-F0-9]{6}$/.test(value.code) || !/^[a-f0-9]{64}$/.test(value.token)) return;
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
}

export function clearRoomSession() {
  try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
}
