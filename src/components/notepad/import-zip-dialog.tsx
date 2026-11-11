'use client'

import { useMemo, useRef, useState } from 'react'
import {
  CircleAlert,
  CircleCheck,
  FileArchive,
  FileText,
  FileUp,
  FolderClosed,
  Loader2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useNotepadStore } from '@/lib/notepad/store'
import { SUBJECT_COLORS } from '@/lib/notepad/constants'
import { formatBytes } from '@/lib/notepad/image'
import { matchFolderToPad, parseNotesZip, type ParsedNotesZip } from '@/lib/notepad/zip-import'
import type { Note } from '@/lib/notepad/types'
import { useToast } from '@/hooks/use-toast'

interface ImportZipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** fired after notes were imported (e.g. to open the editor on mobile) */
  onImported?: (note: Note) => void
}

/** Select value that stands for "create a new subject/chapter" */
const CREATE = '__create__'
const TITLE_PREVIEW = 3

/** where one folder group's notes go */
interface Assignment {
  /** existing subject id, or '' = create a new one (newSubjectName) */
  subjectId: string
  newSubjectName: string
  /** existing chapter id (inside subjectId), or '' = create a new one */
  chapterId: string
  newChapterName: string
  /** full = both folders matched the pad; partial = subject found, chapter new;
   *  none = subject unmatched (and zip-root files, which default to the
   *  user's current chapter) */
  matchState: 'full' | 'partial' | 'none'
}

/**
 * Import a .zip of notes — the counterpart of "Export notes (.zip)".
 *
 * Folders map back to subjects and chapters by name; folders that don't
 * exist in the pad ask the user where their notes should go (pick existing
 * elements or create new ones, pre-filled with the folder names). Importing
 * appends notes; it never touches the existing ones.
 */
export function ImportZipDialog({ open, onOpenChange, onImported }: ImportZipDialogProps) {
  const subjects = useNotepadStore((s) => s.subjects)
  const chapters = useNotepadStore((s) => s.chapters)
  const { importNotes, selectNote } = useNotepadStore()
  const { toast } = useToast()

  const [zipFile, setZipFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedNotesZip | null>(null)
  const [parsing, setParsing] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({})
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // fresh state every time the dialog opens (render-phase reset pattern)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setZipFile(null)
      setParsed(null)
      setParsing(false)
      setFileError(null)
      setAssignments({})
      setDragOver(false)
      setImporting(false)
    }
  }

  // ---------- file handling ----------

  const handleFile = (f: File | undefined | null) => {
    if (!f) return
    if (!/\.zip$/i.test(f.name) && f.type !== 'application/zip' && f.type !== 'application/x-zip-compressed') {
      setZipFile(null)
      setParsed(null)
      setFileError(`“${f.name}” is not a zip archive — only .zip files can be imported.`)
      return
    }
    setParsing(true)
    setFileError(null)
    setZipFile(f)
    f.arrayBuffer()
      .then((buffer) => parseNotesZip(new Blob([buffer])))
      .then((result) => {
        if (result.fileCount === 0) {
          setParsed(null)
          setFileError(
            `No Markdown notes were found in “${f.name}” — the archive has no importable .md files.`,
          )
          return
        }
        // pre-route every folder: matched groups go straight to the pad,
        // unmatched ones (and zip-root files) start on "create new", with the
        // root falling back to the user's current location like .md import
        const state = useNotepadStore.getState()
        const currentChapter = state.chapters.find((c) => c.id === state.selectedChapterId)
        const next: Record<string, Assignment> = {}
        for (const group of result.groups) {
          const match = matchFolderToPad(group.subjectSeg, group.chapterSeg, state.subjects, state.chapters)
          const matchState: Assignment['matchState'] = match.chapterId
            ? 'full'
            : match.subjectId && !group.chapterSeg
              ? 'full'
              : match.subjectId
                ? 'partial'
                : 'none'
          next[group.key] = {
            subjectId: match.subjectId ?? (group.subjectSeg ? '' : (currentChapter?.subjectId ?? state.subjects[0]?.id ?? '')),
            newSubjectName: group.subjectSeg,
            chapterId: match.chapterId ?? (group.subjectSeg ? '' : (currentChapter?.id ?? '')),
            newChapterName: group.chapterSeg,
            matchState,
          }
        }
        setParsed(result)
        setAssignments(next)
      })
      .catch(() => {
        setZipFile(null)
        setParsed(null)
        setFileError('The archive could not be read — it may be corrupt or password-protected.')
      })
      .finally(() => setParsing(false))
  }

  const clearFile = () => {
    setZipFile(null)
    setParsed(null)
    setFileError(null)
    setAssignments({})
  }

  // ---------- assignment editing ----------

  const patchAssignment = (key: string, patch: Partial<Assignment>) => {
    setAssignments((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const pickSubject = (groupKey: string, value: string) => {
    const a = assignments[groupKey]
    if (!a) return
    if (value === CREATE) {
      patchAssignment(groupKey, { subjectId: '' })
    } else {
      // switching subjects invalidates a chapter from the previous one —
      // fall back to "create new chapter" (the folder name stays prefilled)
      const belongs = chapters.some((c) => c.id === a.chapterId && c.subjectId === value)
      patchAssignment(groupKey, { subjectId: value, chapterId: belongs ? a.chapterId : '' })
    }
  }

  const pickChapter = (groupKey: string, value: string) => {
    patchAssignment(groupKey, { chapterId: value === CREATE ? '' : value })
  }

  // ---------- import plan ----------

  const plan = useMemo(() => {
    if (!parsed) return null
    const subjectSpecs = new Map<string, { key: string; name: string; color: string }>()
    const chapterSpecs = new Map<string, { key: string; subjectKey: string; name: string }>()
    const notes: { chapterKey: string; title: string; content: string }[] = []

    const keyOf = (s: string) => s.trim().toLowerCase()

    for (const group of parsed.groups) {
      const a = assignments[group.key]
      const subjectName = (a?.newSubjectName.trim() || group.subjectSeg || 'Imported subject')
      const subjectKey = a?.subjectId
        ? `existing:${a.subjectId}`
        : (() => {
            const normKey = `new:${keyOf(subjectName)}`
            if (!subjectSpecs.has(normKey)) {
              subjectSpecs.set(normKey, {
                key: normKey,
                name: subjectName,
                color: SUBJECT_COLORS[(subjects.length + subjectSpecs.size) % SUBJECT_COLORS.length].value,
              })
            }
            return normKey
          })()

      const chapterName = (a?.newChapterName.trim() || group.chapterSeg || 'Imported chapter')
      const chapterKey = a?.chapterId
        ? `existing:${a.chapterId}`
        : (() => {
            const normKey = `new:${keyOf(subjectKey)}::${keyOf(chapterName)}`
            if (!chapterSpecs.has(normKey)) {
              chapterSpecs.set(normKey, { key: normKey, subjectKey, name: chapterName })
            }
            return normKey
          })()

      for (const entry of group.entries) {
        notes.push({ chapterKey, title: entry.title, content: entry.content })
      }
    }

    return {
      input: {
        subjects: [...subjectSpecs.values()],
        chapters: [...chapterSpecs.values()],
        notes,
      },
      newSubjectCount: subjectSpecs.size,
      newChapterCount: chapterSpecs.size,
    }
  }, [parsed, assignments, subjects.length])

  const canImport = !!parsed && !!plan && parsed.fileCount > 0 && !importing

  const handleImport = () => {
    if (!plan || importing || parsed?.fileCount === 0) return
    setImporting(true)
    try {
      const result = importNotes(plan.input)
      const first = result.noteIds.length
        ? useNotepadStore.getState().notes.find((n) => n.id === result.noteIds[0])
        : undefined
      if (first) selectNote(first.id)

      const parts: string[] = [
        `Imported ${result.noteIds.length} ${result.noteIds.length === 1 ? 'note' : 'notes'}.`,
      ]
      const created: string[] = []
      if (plan.newSubjectCount) created.push(`${plan.newSubjectCount} ${plan.newSubjectCount === 1 ? 'subject' : 'subjects'}`)
      if (plan.newChapterCount) created.push(`${plan.newChapterCount} ${plan.newChapterCount === 1 ? 'chapter' : 'chapters'}`)
      if (created.length) parts.push(`Created ${created.join(' and ')}.`)
      if (parsed && parsed.skipped.length) {
        parts.push(`${parsed.skipped.length} non-note ${parsed.skipped.length === 1 ? 'file was' : 'files were'} skipped.`)
      }

      onOpenChange(false)
      toast({ title: 'Notes imported', description: parts.join(' ') })
      if (first) onImported?.(first)
    } catch {
      toast({
        title: 'Import failed',
        description: 'The notes could not be added to your pad.',
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  // ---------- derived helpers for rendering ----------

  const skippedSummary = parsed?.skipped.length
    ? parsed.skipped.slice(0, TITLE_PREVIEW).map((s) => s.path).join(', ') +
      (parsed.skipped.length > TITLE_PREVIEW ? ` +${parsed.skipped.length - TITLE_PREVIEW} more` : '')
    : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" data-testid="zip-import-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-emerald-600" /> Import notes (.zip)
          </DialogTitle>
          <DialogDescription>
            Folders become subjects and chapters — the same{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{`{Subject}/{Chapter}/{Note}.md`}</code>{' '}
            layout “Export notes (.zip)” produces. Folders your pad doesn’t have ask where the
            notes should go. Existing notes stay untouched.
          </DialogDescription>
        </DialogHeader>

        {/* drop zone / loaded archive card */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!dragOver) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFile(e.dataTransfer.files?.[0])
          }}
          className={cn(
            'rounded-lg border-2 border-dashed transition-colors',
            dragOver ? 'border-emerald-600 bg-emerald-600/5' : fileError ? 'border-destructive/50' : 'border-border',
            parsed && zipFile && 'border-solid',
          )}
        >
          {zipFile && (parsed || parsing) ? (
            <div className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                <FileArchive className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={zipFile.name}>
                  {zipFile.name}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {parsing
                    ? 'Reading archive…'
                    : `${formatBytes(zipFile.size)} · ${parsed?.fileCount ?? 0} notes in ${parsed?.groups.length ?? 0} folders`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2.5"
                disabled={parsing}
                onClick={() => inputRef.current?.click()}
              >
                Change
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={parsing}
                onClick={clearFile}
                aria-label="Remove archive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full flex-col items-center gap-1.5 rounded-lg p-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => inputRef.current?.click()}
            >
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full bg-muted',
                  dragOver && 'bg-emerald-600/10 text-emerald-600',
                )}
              >
                {parsing ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <FileUp className="h-5 w-5 text-muted-foreground" aria-hidden />
                )}
              </span>
              <span className="text-sm font-medium">
                {dragOver ? 'Drop the archive to use it' : 'Drop your .zip file here'}
              </span>
              <span className="text-xs text-muted-foreground">or click to browse — .zip archives</span>
            </button>
          )}
        </div>

        {/* review — one destination card per folder group */}
        {parsed && parsed.groups.length > 0 && (
          <div className="space-y-2.5" data-testid="zip-import-review">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Destinations
            </p>
            {parsed.groups.map((group, gi) => {
              const a = assignments[group.key]
              if (!a) return null
              const subjectChapters = a.subjectId
                ? chapters.filter((c) => c.subjectId === a.subjectId)
                : []
              const chapterInSubject = subjectChapters.some((c) => c.id === a.chapterId)
              const shownChapterId = chapterInSubject ? a.chapterId : ''
              const subject = subjects.find((s) => s.id === a.subjectId)

              const previewTitles = group.entries.slice(0, TITLE_PREVIEW).map((e) => e.title)
              const extraCount = group.entries.length - previewTitles.length

              return (
                <div key={group.key || '__root__'} className="space-y-2.5 rounded-lg border p-3" data-testid={`zip-import-group-${gi}`}>
                  {/* folder path + count */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium" title={group.key || 'files at the zip root'}>
                      <FolderClosed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 truncate">
                        {group.subjectSeg ? (
                          <>
                            {group.subjectSeg}
                            {group.chapterSeg ? (
                              <>
                                <span className="mx-1 text-muted-foreground" aria-hidden>
                                  ›
                                </span>
                                {group.chapterSeg}
                              </>
                            ) : (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">(no chapter folder)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Files at the zip root</span>
                        )}
                      </span>
                    </p>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {group.entries.length} {group.entries.length === 1 ? 'note' : 'notes'}
                    </span>
                  </div>

                  {/* matched / ask-location hint */}
                  {a.matchState === 'full' ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <CircleCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Found in your pad — {subject?.name}
                      {group.chapterSeg ? ` › ${subjectChapters.find((c) => c.id === a.chapterId)?.name ?? ''}` : ''}
                    </p>
                  ) : a.matchState === 'partial' ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Subject “{subject?.name}” found, but chapter “{group.chapterSeg}” is new — pick or create a chapter.
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Not in your pad yet — choose where these notes go, or let StudyPad create it.
                    </p>
                  )}

                  {/* subject / chapter pickers */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Select
                        value={a.subjectId || CREATE}
                        onValueChange={(v) => pickSubject(group.key, v)}
                      >
                        <SelectTrigger className="w-full" aria-label="Destination subject" data-testid={`zip-import-subject-${gi}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: s.color }}
                                  aria-hidden
                                />
                                {s.name}
                              </span>
                            </SelectItem>
                          ))}
                          <SelectItem value={CREATE}>
                            {group.subjectSeg ? `New subject “${a.newSubjectName || group.subjectSeg}”` : 'New subject…'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {a.subjectId === '' && (
                        <Input
                          value={a.newSubjectName}
                          onChange={(e) => patchAssignment(group.key, { newSubjectName: e.target.value })}
                          placeholder="New subject name"
                          aria-label="New subject name"
                          className="h-8 text-[13px]"
                          data-testid={`zip-import-new-subject-${gi}`}
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Select
                        value={shownChapterId || CREATE}
                        onValueChange={(v) => pickChapter(group.key, v)}
                        disabled={a.subjectId === ''}
                      >
                        <SelectTrigger className="w-full" aria-label="Destination chapter" data-testid={`zip-import-chapter-${gi}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {subjectChapters.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                          <SelectItem value={CREATE}>
                            {group.chapterSeg ? `New chapter “${a.newChapterName || group.chapterSeg}”` : 'New chapter…'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {shownChapterId === '' && (
                        <Input
                          value={a.newChapterName}
                          onChange={(e) => patchAssignment(group.key, { newChapterName: e.target.value })}
                          placeholder={a.subjectId === '' ? `Chapter in new subject “${a.newSubjectName || group.subjectSeg || 'Imported subject'}”` : 'New chapter name'}
                          aria-label="New chapter name"
                          className="h-8 text-[13px]"
                          data-testid={`zip-import-new-chapter-${gi}`}
                        />
                      )}
                    </div>
                  </div>

                  {/* note titles preview */}
                  <p className="truncate text-[11px] text-muted-foreground" title={group.entries.map((e) => e.title).join(', ')}>
                    {previewTitles.map((t) => `“${t}”`).join(', ')}
                    {extraCount > 0 ? ` +${extraCount} more` : ''}
                  </p>
                </div>
              )
            })}

            {parsed.skipped.length > 0 && (
              <Alert
                className="border-amber-500/40 bg-amber-500/10 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
                data-testid="zip-import-skipped"
              >
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription className="text-[11px] text-amber-700 dark:text-amber-400">
                  {parsed.skipped.length} {parsed.skipped.length === 1 ? 'file' : 'files'} skipped
                  (not Markdown or empty): <span className="break-all">{skippedSummary}</span>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* errors */}
        {fileError && (
          <Alert variant="destructive" data-testid="zip-import-error">
            <CircleAlert className="h-4 w-4" />
            <AlertDescription>{fileError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {parsed
              ? `${parsed.fileCount} ${parsed.fileCount === 1 ? 'note' : 'notes'} in ${parsed.groups.length} ${
                  parsed.groups.length === 1 ? 'folder' : 'folders'
                }`
              : 'Nothing loaded yet'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!canImport}
              onClick={handleImport}
              data-testid="zip-import-submit"
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <FileUp className="h-3.5 w-3.5" aria-hidden />
              )}
              {importing ? 'Importing…' : 'Import notes'}
            </Button>
          </div>
        </DialogFooter>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
          aria-label="Zip archive"
          data-testid="zip-import-input"
        />
      </DialogContent>
    </Dialog>
  )
}
