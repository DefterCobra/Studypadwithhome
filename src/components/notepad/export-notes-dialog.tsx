'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileArchive, FileText, FolderClosed, Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useNotepadStore, sortNotes } from '@/lib/notepad/store'
import { useToast } from '@/hooks/use-toast'
import { buildNotesZip } from '@/lib/notepad/zip-export'

type CheckedState = boolean | 'indeterminate'

interface ExportNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** one selectable line — a <label> wrapping the Radix checkbox (never a
 *  button: Radix renders its own <button>, and nested buttons break hydration) */
function SelectRow({
  checked,
  onToggle,
  icon,
  label,
  count,
  total,
  className,
  ariaLabel,
}: {
  checked: CheckedState
  onToggle: (check: boolean) => void
  icon: React.ReactNode
  label: string
  /** shown as “x/y” only for group rows */
  count?: number
  total?: number
  className?: string
  ariaLabel: string
}) {
  return (
    <label
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50',
        className,
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={ariaLabel}
        className="shrink-0"
      />
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {total !== undefined && total > 1 && count !== undefined && (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {count}/{total}
        </span>
      )}
    </label>
  )
}

/**
 * “Export notes (.zip)” picker — a subject → chapter → note checkbox tree
 * (tri-state groups, live counts). Exporting builds one zip with the
 * `{Subject}/{Chapter}/{Note}.md` layout via buildNotesZip.
 */
export function ExportNotesDialog({ open, onOpenChange }: ExportNotesDialogProps) {
  const notes = useNotepadStore((s) => s.notes)
  const chapters = useNotepadStore((s) => s.chapters)
  const subjects = useNotepadStore((s) => s.subjects)
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipping, setZipping] = useState(false)

  // subjects → chapters holding at least one note → their notes (pinned/manual order)
  const tree = useMemo(
    () =>
      subjects
        .map((subject) => ({
          subject,
          chapters: chapters
            .filter((c) => c.subjectId === subject.id)
            .map((chapter) => ({
              chapter,
              notes: sortNotes(notes.filter((n) => n.chapterId === chapter.id)),
            }))
            .filter((entry) => entry.notes.length > 0),
        }))
        .filter((entry) => entry.chapters.length > 0),
    [subjects, chapters, notes],
  )

  const allNoteIds = useMemo(
    () => tree.flatMap((s) => s.chapters.flatMap((c) => c.notes.map((n) => n.id))),
    [tree],
  )

  // latest list without re-triggering the open effect
  const allNoteIdsRef = useRef<string[]>([])
  useEffect(() => {
    allNoteIdsRef.current = allNoteIds
  })

  // opening the dialog starts from “everything selected”
  useEffect(() => {
    if (open) setSelected(new Set(allNoteIdsRef.current))
  }, [open])

  const selectedCount = allNoteIds.filter((id) => selected.has(id)).length

  const groupState = (ids: string[]): CheckedState => {
    const count = ids.filter((id) => selected.has(id)).length
    if (count === 0) return false
    return count === ids.length ? true : 'indeterminate'
  }

  const toggleIds = (ids: string[], check: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (check) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const handleExport = async () => {
    if (zipping || selectedCount === 0) return
    setZipping(true)
    try {
      const picked = notes.filter((n) => selected.has(n.id))
      const result = await buildNotesZip(picked, chapters, subjects)
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
      toast({
        title: 'Export complete',
        description: `Exported ${result.fileCount} ${
          result.fileCount === 1 ? 'note' : 'notes'
        } as {Subject}/{Chapter}/{Note}.md files.`,
      })
      onOpenChange(false)
    } catch {
      toast({
        title: 'Export failed',
        description: 'The zip archive could not be created.',
        variant: 'destructive',
      })
    } finally {
      setZipping(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-emerald-600" /> Export notes (.zip)
          </DialogTitle>
          <DialogDescription>
            Pick the notes to include — each one exports as a Markdown file laid out by
            subject and chapter, ready to re-import later.
          </DialogDescription>
        </DialogHeader>

        {tree.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No notes yet — create one first, then export it here.
          </p>
        ) : (
          <div role="group" aria-label="Notes to export" className="space-y-1">
            {tree.map(({ subject, chapters: subjectChapters }) => {
              const subjectIds = subjectChapters.flatMap((c) => c.notes.map((n) => n.id))
              const subjectCount = subjectIds.filter((id) => selected.has(id)).length
              return (
                <div key={subject.id} className="space-y-1">
                  <SelectRow
                    checked={groupState(subjectIds)}
                    onToggle={(check) => toggleIds(subjectIds, check)}
                    ariaLabel={`Select all notes in ${subject.name}`}
                    icon={
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: subject.color }}
                        aria-hidden
                      />
                    }
                    label={subject.name}
                    count={subjectCount}
                    total={subjectIds.length}
                    className="font-medium"
                  />
                  <div className="space-y-1 pl-4">
                    {subjectChapters.map(({ chapter, notes: chapterNotes }) => {
                      const chapterIds = chapterNotes.map((n) => n.id)
                      const chapterCount = chapterIds.filter((id) => selected.has(id)).length
                      return (
                        <div key={chapter.id} className="space-y-0.5">
                          <SelectRow
                            checked={groupState(chapterIds)}
                            onToggle={(check) => toggleIds(chapterIds, check)}
                            ariaLabel={`Select all notes in ${chapter.name}`}
                            icon={
                              <FolderClosed
                                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            }
                            label={chapter.name}
                            count={chapterCount}
                            total={chapterIds.length}
                          />
                          <div className="space-y-0.5 pl-6">
                            {chapterNotes.map((note) => (
                              <SelectRow
                                key={note.id}
                                checked={selected.has(note.id)}
                                onToggle={(check) => toggleIds([note.id], check)}
                                ariaLabel={`Include ${note.title || 'Untitled note'}`}
                                icon={
                                  <FileText
                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                }
                                label={note.title || 'Untitled note'}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {selectedCount} of {allNoteIds.length} notes selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={zipping || selectedCount === 0}
              onClick={handleExport}
            >
              {zipping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <FileArchive className="h-3.5 w-3.5" aria-hidden />
              )}
              {zipping ? 'Zipping…' : 'Export .zip'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
