'use client'

/**
 * Home screen (V9.0) — "Pick up where you left off".
 *
 * Every entry into a workspace lands here instead of dropping straight into
 * the editor: a hero card offers the last-opened note (per-user marker, see
 * last-note.ts) with a one-click Open, and three sections surface five
 * random flashcards, quizzes and notes from the whole pad as quick ways
 * back into studying. Opening anything swaps to the workspace view (the
 * multi-tab bar is hidden while the home screen is up) and jumps to the
 * right pane: notes to the editor, cards to deck study, quizzes to attempt.
 */
import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, FileText, Layers, ListChecks, ListTree, NotebookPen, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useNotepadStore } from '@/lib/notepad/store'
import { makeExcerpt } from '@/lib/notepad/constants'
import { getLastOpenNote } from '@/lib/notepad/last-note'
import { allUsers, useUsersStore } from '@/lib/notepad/users'
import type { Note } from '@/lib/notepad/types'

/** how many random items each section offers */
const HOME_PICKS = 5

/** Fisher–Yates shuffle, first n — a fresh random sample on every call */
function sample<T>(list: T[], n: number): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

/** compact "when" line for notes and cards */
function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(ts).toLocaleDateString()
}

/** chapter name + subject colour for a chapter-keyed item's context line */
interface PickContext {
  chapterName: string | null
  color: string | null
}

interface HomeScreenProps {
  userId: string
  /** open a note in the editor */
  onOpenNote: (noteId: string) => void
  /** open a flashcard's deck in study mode */
  onOpenCard: (cardId: string) => void
  /** open a quiz in attempt mode */
  onOpenQuiz: (quizId: string) => void
  /** leave home for the workspace with the subjects sidebar in front
   *  (mobile — on desktop the sidebar is always visible anyway) */
  onOpenSidebar: () => void
}

export function HomeScreen({ userId, onOpenNote, onOpenCard, onOpenQuiz, onOpenSidebar }: HomeScreenProps) {
  const notes = useNotepadStore((s) => s.notes)
  const flashcards = useNotepadStore((s) => s.flashcards)
  const quizzes = useNotepadStore((s) => s.quizzes)
  const chapters = useNotepadStore((s) => s.chapters)
  const subjects = useNotepadStore((s) => s.subjects)
  const users = useUsersStore((s) => s.users)
  const currentUserId = useUsersStore((s) => s.currentUserId)

  const userName = allUsers(users).find((u) => u.id === currentUserId)?.name ?? 'there'

  // re-roll trigger for the random sections (Shuffle button, remounts)
  const [nonce, setNonce] = useState(0)
  // the saved "last opened note" id — read after mount to stay SSR-safe
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null)

  useEffect(() => {
    setSavedNoteId(getLastOpenNote(userId))
  }, [userId])

  const picks = useMemo(() => {
    void nonce // changing the nonce re-rolls the three random samples
    return {
      cards: sample(flashcards, HOME_PICKS),
      quizzes: sample(quizzes, HOME_PICKS),
      notes: sample(notes, HOME_PICKS),
    }
  }, [flashcards, quizzes, notes, nonce])

  const chapterById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters])
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const contextFor = (chapterId: string): PickContext => {
    const chapter = chapterById.get(chapterId)
    const subject = chapter ? subjectById.get(chapter.subjectId) : undefined
    return { chapterName: chapter?.name ?? null, color: subject?.color ?? null }
  }

  // resume target: the last-opened note if it still exists, otherwise the
  // most recently updated one (nothing was ever opened / it was deleted)
  const resumeNote = savedNoteId ? (notes.find((n) => n.id === savedNoteId) ?? null) : null
  const latestNote = useMemo(() => {
    let best: Note | null = null
    for (const n of notes) if (!best || n.updatedAt > best.updatedAt) best = n
    return best
  }, [notes])
  const pickupNote = resumeNote ?? latestNote
  const pickupContext = pickupNote ? contextFor(pickupNote.chapterId) : null

  return (
    <div
      className="min-w-0 flex-1 overflow-y-auto"
      data-testid="home-screen"
      aria-label="Home screen"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
          <Sparkles className="h-4 w-4" aria-hidden />
          Welcome back, {userName}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
            Pick up where you left off
          </h1>
          {/* mobile only — the subjects sidebar is otherwise unreachable from home */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 lg:hidden"
            data-testid="home-sidebar"
            aria-label="Browse subjects — open the sidebar"
            onClick={onOpenSidebar}
          >
            <ListTree className="h-4 w-4" aria-hidden /> Subjects
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            data-testid="home-shuffle"
            aria-label="Shuffle the random picks"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Shuffle
          </Button>
        </div>

        {pickupNote ? (
          <button
            type="button"
            data-testid="home-resume"
            aria-label={`Open ${pickupNote.title || 'Untitled note'}`}
            onClick={() => onOpenNote(pickupNote.id)}
            className="group mt-5 flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-emerald-500/60 hover:bg-muted/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <NotebookPen className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {resumeNote ? 'Last opened' : 'Most recent'}
                {pickupContext?.chapterName && (
                  <>
                    <span aria-hidden>&middot;</span>
                    <span className="truncate normal-case">{pickupContext.chapterName}</span>
                  </>
                )}
              </span>
              <span className="mt-0.5 block truncate text-base font-bold">
                {pickupNote.title || 'Untitled note'}
              </span>
              <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                {makeExcerpt(pickupNote.content, 120) || 'Empty note'}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors group-hover:bg-emerald-700">
              Open <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </button>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed bg-card/50 p-5 text-sm text-muted-foreground">
            Your pad is empty — pick a subject in the sidebar and write your first note.
          </p>
        )}

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <HomeSection
            title="Flashcards"
            icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
            count={flashcards.length}
            testid="home-flashcards"
            empty="No flashcards yet — open a chapter and build a deck."
          >
            {picks.cards.map((card) => (
              <PickRow
                key={card.id}
                testid={`home-card-${card.id}`}
                onClick={() => onOpenCard(card.id)}
                title={makeExcerpt(card.front, 64) || 'Empty card'}
                context={contextFor(card.chapterId)}
                time={timeAgo(card.updatedAt)}
              />
            ))}
          </HomeSection>

          <HomeSection
            title="Quizzes"
            icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />}
            count={quizzes.length}
            testid="home-quizzes"
            empty="No quizzes yet — open a chapter and write some questions."
          >
            {picks.quizzes.map((quiz) => (
              <PickRow
                key={quiz.id}
                testid={`home-quiz-${quiz.id}`}
                onClick={() => onOpenQuiz(quiz.id)}
                title={quiz.title}
                context={contextFor(quiz.chapterId)}
                time={`${quiz.questions.length} ${quiz.questions.length === 1 ? 'question' : 'questions'}`}
              />
            ))}
          </HomeSection>

          <HomeSection
            title="Notes"
            icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
            count={notes.length}
            testid="home-notes"
            empty="No notes yet — pick a subject in the sidebar to begin."
          >
            {picks.notes.map((note) => (
              <PickRow
                key={note.id}
                testid={`home-note-${note.id}`}
                onClick={() => onOpenNote(note.id)}
                title={note.title || 'Untitled note'}
                sub={makeExcerpt(note.content, 64)}
                context={contextFor(note.chapterId)}
                time={timeAgo(note.updatedAt)}
              />
            ))}
          </HomeSection>
        </div>
      </div>
    </div>
  )
}

/** one column of the picks grid: header row + 5 random rows (or an empty hint) */
function HomeSection({
  title,
  icon,
  count,
  testid,
  empty,
  children,
}: {
  title: string
  icon: ReactNode
  count: number
  testid: string
  empty: string
  children: ReactNode
}) {
  const items = Children.toArray(children).filter(isValidElement)
  return (
    <section data-testid={testid} aria-label={`${title} — ${count} total, ${items.length} shown`}>
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
        <Badge variant="secondary" className="px-1.5 text-[11px] tabular-nums">
          {count}
        </Badge>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">{items}</div>
      ) : (
        <p className="rounded-xl border border-dashed bg-card/50 px-3 py-3 text-xs text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  )
}

/** one random pick row: subject dot + title (+ excerpt) + chapter & when */
function PickRow({
  testid,
  onClick,
  title,
  sub,
  context,
  time,
}: {
  testid: string
  onClick: () => void
  title: string
  sub?: string
  context: PickContext
  time: string
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:border-emerald-500/60 hover:bg-muted/40"
    >
      {context.color && (
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: context.color }}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span>}
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {[context.chapterName, time].filter(Boolean).join(' · ')}
        </span>
      </span>
      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
    </button>
  )
}
