// Player mode ("Tape"): tapes and albums live in their own collection, apart from the library,
// and play as a cassette in a deck or as a record coming out of its sleeve. Which one is chosen
// when they are added ("add tape" / "add album") and remembered per book on this device.
// Audiobooks added to the library stay ordinary audiobooks with the standard player.
import { Book } from '../types';
import { DeckKey } from './deckArt';

export type PlayerKind = 'tape' | 'vinyl';

const KEY = 'cool_read_deck_kind';
const MODE_KEY = 'cool_read_player_mode';

function readAll(): Record<string, PlayerKind> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeAll(map: Record<string, PlayerKind>) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* storage full or blocked */ }
}

/** How a book plays in the player, or null for anything that belongs to the library */
export function deckKindOf(bookId: string): PlayerKind | null {
  const k = readAll()[bookId];
  return k === 'vinyl' || k === 'tape' ? k : null;
}
export const isInCollection = (b: Book) => b.type === 'audio' && deckKindOf(b.id) !== null;

/** Whether the app was left in the player (collection) or in the library */
export function savedPlayerMode(): boolean {
  try { return localStorage.getItem(MODE_KEY) === '1'; } catch { return false; }
}
export function savePlayerMode(on: boolean) {
  try { localStorage.setItem(MODE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
}

// The kind of the next audiobooks the user adds, until they are added
let pendingKind: PlayerKind | null = null;
export function expectNewAudiobooks(kind: PlayerKind | null) { pendingKind = kind; }

/** Audiobooks added since "add tape" / "add album" was picked join the collection as that kind.
 *  `known` holds the ids seen before; returns true when something changed. */
export function assignPlayerKinds(books: Book[], known: Set<string>): boolean {
  if (!pendingKind) return false;
  const map = readAll();
  let changed = false;
  for (const b of books) {
    if (b.type !== 'audio' || known.has(b.id) || map[b.id]) continue;
    map[b.id] = pendingKind;
    changed = true;
  }
  if (changed) { writeAll(map); pendingKind = null; }
  return changed;
}

/** Forget a deleted book's kind */
export function forgetPlayerKind(bookId: string) {
  const map = readAll();
  if (map[bookId]) { delete map[bookId]; writeAll(map); }
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
