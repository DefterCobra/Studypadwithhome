/**
 * Multi-select notes → one .zip of Markdown files (V8.5).
 *
 * Layout mirrors the workspace tree: `{Subject}/{Chapter}/{Note}.md`.
 * Every file starts with `# {title}` followed by the note content — the same
 * shape as the single-note "Export .md file", so each file can be fed back in
 * through "Import note (.md)" for a loss-free round trip.
 *
 * File and folder names go through a filesystem-safe sanitizer; same-titled
 * notes inside one chapter folder get a ` (2)`-style numeric suffix (the pool
 * is per folder, so identical names in different chapters never collide).
 */
import JSZip from 'jszip'
import type { Chapter, Note, Subject } from './types'

export interface NotesZipResult {
  blob: Blob
  fileCount: number
  filename: string
}

/** Windows-incompatible characters, all handled identically */
const FORBIDDEN = /[\\/:*?"<>|]/g
/** control characters (newlines/tabs included) become plain spaces */
const CONTROL = /[\u0000-\u001f\u007f]+/g
/** runs of separators — tolerates the spaces bridging neighbouring dashes */
const SEP_RUN = /(?:\s*-\s*)+/g

/**
 * Turn any note/chapter/subject name into a safe, readable path segment.
 * `Photosynthesis (2024)?` → `Photosynthesis (2024)`,
 * `Ch 1: Rates/Rust` → `Ch 1 - Rates - Rust`. Empty results fall back.
 */
export function sanitizePathSegment(raw: string, fallback: string): string {
  let out = (raw ?? '')
    .replace(CONTROL, ' ')
    .replace(FORBIDDEN, ' - ')
  out = out.replace(SEP_RUN, ' - ')
  out = out.replace(/\s+/g, ' ').trim()
  // strip stray separators left dangling at the ends
  out = out.replace(/^[-. ]+/, '').replace(/[-. ]+$/, '')
  return out || fallback
}

/**
 * Build the zip for the given notes. `notes` should already be filtered to
 * the user's selection; chapters/subjects provide the folder names (missing
 * parents fall back to `Notes` / `Unfiled`).
 */
export async function buildNotesZip(
  notes: Note[],
  chapters: Chapter[],
  subjects: Subject[],
): Promise<NotesZipResult> {
  const zip = new JSZip()
  const chapterById = new Map(chapters.map((c) => [c.id, c] as const))
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const))

  /** per-folder dedupe pools — key: "subject/chapter" folder path */
  const takenNames = new Map<string, Set<string>>()

  let fileCount = 0
  for (const note of notes) {
    const chapter = chapterById.get(note.chapterId)
    const subject = chapter ? subjectById.get(chapter.subjectId) : undefined

    const subjectSeg = sanitizePathSegment(subject?.name ?? '', 'Unfiled')
    const chapterSeg = sanitizePathSegment(chapter?.name ?? '', 'Notes')
    const noteSeg = sanitizePathSegment(note.title, 'Untitled note')
    const folder = `${subjectSeg}/${chapterSeg}`

    let pool = takenNames.get(folder)
    if (!pool) {
      pool = new Set()
      takenNames.set(folder, pool)
    }

    let name = `${noteSeg}.md`
    if (pool.has(name.toLowerCase())) {
      let n = 2
      do {
        name = `${noteSeg} (${n}).md`
        n += 1
      } while (pool.has(name.toLowerCase()))
    }
    pool.add(name.toLowerCase())

    zip.file(`${folder}/${name}`, `# ${note.title}\n\n${note.content}`)
    fileCount += 1
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/zip',
  })

  return {
    blob,
    fileCount,
    filename: `studypad-notes-${new Date().toISOString().slice(0, 10)}.zip`,
  }
}
