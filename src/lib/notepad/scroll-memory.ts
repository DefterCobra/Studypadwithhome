/**
 * Per-note scroll offsets for the "Optimise multi tabs" mode (V8.6).
 *
 * With optimisation ON only the active note's editor is mounted, so each
 * tab switch unmounts the outgoing editor — its scroll offset is captured
 * here by a passive scroll listener and replayed when the note comes back.
 *
 * The map is capped: once MAX entries are held, the least-recently-touched
 * note falls off (LRU via re-insert on every write) and its position is
 * simply forgotten — that note reopens at the top, same as a fresh note.
 */

const MAX_ENTRIES = 40

const offsets = new Map<string, number>()

/** record the latest scrollTop for a note (also refreshes its LRU recency) */
export function rememberScroll(noteId: string, scrollTop: number): void {
  offsets.delete(noteId)
  if (offsets.size >= MAX_ENTRIES) {
    // Map iterates in insertion order — the first key is the oldest entry
    const oldest = offsets.keys().next().value
    if (oldest !== undefined) offsets.delete(oldest)
  }
  offsets.set(noteId, scrollTop)
}

/** the saved offset for a note, or undefined when none was recorded */
export function recallScroll(noteId: string): number | undefined {
  return offsets.get(noteId)
}

/** drop a note's saved offset (e.g. when its editor unmounts for good) */
export function forgetScroll(noteId: string): void {
  offsets.delete(noteId)
}
