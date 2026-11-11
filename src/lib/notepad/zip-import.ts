/**
 * Import a .zip of Markdown notes (V8.7) — the read side of zip-export.ts.
 *
 * Expected layout (exactly what "Export notes (.zip)" produces):
 *
 *   {Subject}/{Chapter}/{Note}.md      — each file `# {title}\n\n{content}`
 *
 * Arbitrary zips are handled gracefully:
 *  - `Chapter/Note.md`  → subject = folder, chapter chosen by the user
 *  - `Note.md`          → zip root — the user picks subject and chapter
 *  - deeper nesting     → first segment = subject, second = chapter, rest ignored
 *  - `__MACOSX/…`, dotfiles and non-Markdown files are skipped; empty .md
 *    files are reported back as skipped instead of becoming blank notes
 *
 * Folders are grouped per `{Subject}/{Chapter}` and matched against the pad
 * by name (case-insensitive) — groups that don't match come back unmatched so
 * the dialog can ask the user where those notes should go.
 */
import JSZip from 'jszip'
import { parseImportedMd } from './md-import'
import type { Chapter, Subject } from './types'

export interface ZipEntry {
  /** path inside the zip, e.g. `Physics/Ch 1/Force.md` */
  path: string
  title: string
  content: string
}

export interface ZipFolderGroup {
  /** raw `subject/chapter` key (`''` for zip-root files) */
  key: string
  /** first folder segment (`''` for root / chapter-only paths) */
  subjectSeg: string
  /** second folder segment (`''` when absent) */
  chapterSeg: string
  entries: ZipEntry[]
}

export interface ParsedNotesZip {
  groups: ZipFolderGroup[]
  /** number of .md files that made it into groups (the importable ones) */
  fileCount: number
  /** files left out, with the reason — junk/hidden files are dropped silently */
  skipped: { path: string; reason: 'not-markdown' | 'empty' }[]
}

export interface FolderMatch {
  /** id of an existing subject whose name equals the folder segment */
  subjectId?: string
  /** id of an existing chapter (inside the matched subject) */
  chapterId?: string
}

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i

const norm = (s: string) => s.trim().toLowerCase()

/** zip entries we never surface: macOS resource forks, dotfiles, metadata */
function isJunkPath(path: string): boolean {
  return path
    .split('/')
    .some((seg) => seg === '__MACOSX' || seg.startsWith('__MACOSX/') || /^\.(?!$)/.test(seg))
}

/**
 * Read a .zip and group its Markdown notes by `{Subject}/{Chapter}` folder.
 * Same-named folders that differ only in case merge into one group (first
 * spelling wins) so "Physics/CH1" and "Physics/Ch1" don't create twins.
 */
export async function parseNotesZip(file: Blob): Promise<ParsedNotesZip> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  const groupByKey = new Map<string, ZipFolderGroup>()
  const skipped: ParsedNotesZip['skipped'] = []
  let fileCount = 0

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const path = entry.name.replace(/\\/g, '/')
    if (path.endsWith('/') || isJunkPath(path)) continue

    if (!MD_EXT.test(path)) {
      skipped.push({ path, reason: 'not-markdown' })
      continue
    }

    const text = await entry.async('string')
    if (!text.trim()) {
      skipped.push({ path, reason: 'empty' })
      continue
    }

    const segments = path.split('/')
    const fileName = segments[segments.length - 1]
    const dirs = segments.slice(0, -1)
    const subjectSeg = dirs.length >= 1 ? dirs[0] : ''
    const chapterSeg = dirs.length >= 2 ? dirs[1] : ''

    const key = `${subjectSeg}/${chapterSeg}`
    const normKey = norm(key)
    let group = groupByKey.get(normKey)
    if (!group) {
      group = { key, subjectSeg, chapterSeg, entries: [] }
      groupByKey.set(normKey, group)
    }

    const parsed = parseImportedMd(text, fileName)
    group.entries.push({ path, title: parsed.title, content: parsed.content })
    fileCount += 1
  }

  return { groups: [...groupByKey.values()], fileCount, skipped }
}

/**
 * Match one folder's segments against the pad's tree — case-insensitive name
 * equality, chapter only inside the matched subject. Returns `{}` when the
 * subject folder is unknown (the dialog then asks the user for a location).
 */
export function matchFolderToPad(
  subjectSeg: string,
  chapterSeg: string,
  subjects: Pick<Subject, 'id' | 'name'>[],
  chapters: Pick<Chapter, 'id' | 'subjectId' | 'name'>[],
): FolderMatch {
  if (!subjectSeg) return {}
  const subject = subjects.find((s) => norm(s.name) === norm(subjectSeg))
  if (!subject) return {}
  if (!chapterSeg) return { subjectId: subject.id }
  const chapter = chapters.find(
    (c) => c.subjectId === subject.id && norm(c.name) === norm(chapterSeg),
  )
  return chapter ? { subjectId: subject.id, chapterId: chapter.id } : { subjectId: subject.id }
}
