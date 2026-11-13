/**
 * "Pick up where you left off" (V9.0 home screen) — the note the user had
 * open most recently.
 *
 * A per-user localStorage marker, parallel to the other per-user markers
 * (welcome answer, last-used hint): the id is noted every time a note
 * becomes the open one in the workspace, and the home screen reads it to
 * offer a one-click way back into that note. Kept in localStorage rather
 * than the notepad store on purpose — it is session furniture, not pad
 * content, so it must never end up inside a backup or a zip export.
 */

const lastNoteKey = (userId: string) => `studypad-last-note-u-${userId}`

/** record the note that just became the open one (best effort) */
export function setLastOpenNote(userId: string, noteId: string): void {
  try {
    window.localStorage.setItem(lastNoteKey(userId), noteId)
  } catch {
    // cosmetic only — losing the marker just means no resume card
  }
}

/** the last note the user had open, or null (unknown / storage unavailable) */
export function getLastOpenNote(userId: string): string | null {
  try {
    return window.localStorage.getItem(lastNoteKey(userId))
  } catch {
    return null
  }
}

/** drop the marker (deleting a user wipes theirs, like the other markers) */
export function clearLastOpenNote(userId: string): void {
  try {
    window.localStorage.removeItem(lastNoteKey(userId))
  } catch {
    // cosmetic only
  }
}
