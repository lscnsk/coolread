// Player mode ("Tape"): audiobooks live in their own collection and play either as a cassette
// in a deck or as a record coming out of its sleeve. Which one is chosen when the book is added
// ("add tape" / "add album") and remembered per book on this device.
import { Book } from '../types';
import { DeckKey } from './deckArt';

export type PlayerKind = 'tape' | 'vinyl';

const KEY = 'cool_read_player_kind';

function readAll(): Record<string, PlayerKind> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeAll(map: Record<string, PlayerKind>) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* storage full or blocked */ }
}

export function playerKindOf(bookId: string): PlayerKind {
  return readAll()[bookId] === 'vinyl' ? 'vinyl' : 'tape';
}

// The kind of the next audiobooks the user adds, until they are added
let pendingKind: PlayerKind | null = null;
export function expectNewAudiobooks(kind: PlayerKind) { pendingKind = kind; }

/** Gives every audiobook without a kind one: the kind just picked to add it, or a cassette. Returns true when something changed. */
export function assignPlayerKinds(books: Book[]): boolean {
  const map = readAll();
  let changed = false;
  for (const b of books) {
    if (b.type !== 'audio' || map[b.id]) continue;
    map[b.id] = pendingKind || 'tape';
    changed = true;
  }
  if (changed) { writeAll(map); pendingKind = null; }
  return changed;
}

/** Header buttons in the player: the collection (left) and the track list (right) */
export const PLAYER_EMOJI: Record<DeckKey, { collection: string; tracks: string }> = {
  Cool: { collection: '📼', tracks: '🎚️' },
  Marcel: { collection: '🎻', tracks: '🎼' },
  Bimbo: { collection: '💿', tracks: '🎀' },
  Surf: { collection: '📻', tracks: '🐬' },
  Roll: { collection: '🪕', tracks: '📯' },
  Final: { collection: '🔮', tracks: '🪄' },
  Code: { collection: '📡', tracks: '🎛️' },
  Byte: { collection: '💽', tracks: '🔊' },
  Mint: { collection: '🧺', tracks: '🎐' },
  Jazz: { collection: '🎙️', tracks: '🎺' },
};

/** The book-mode button in the collection, and the player button in the library */
export const BOOKS_EMOJI = '📖';
export const PLAYER_SWITCH_EMOJI = '🎧';
