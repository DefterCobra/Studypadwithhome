'use client'

import { useNotepadStore } from '@/lib/notepad/store'
import { usePrefsStore } from '@/lib/prefs'
import { EditorPane, type EditorPaneProps } from './editor-pane'

/**
 * Mount strategy for the note editor (V8.6 — "Optimise multi tabs").
 *
 * - Single-tab mode: one editor bound to the store's selected note (unchanged).
 * - Multiple tabs + Optimise = Yes: only the active note's editor is mounted;
 *   every switch unmounts/remounts, with the outgoing note's scroll offset
 *   remembered and the incoming one replayed (scroll-memory.ts). Lighter on
 *   RAM with many tabs, at the cost of a short re-render per switch.
 * - Multiple tabs + Optimise = No (default): every open tab's editor stays
 *   mounted, stacked on top of each other with visibility:hidden — layout,
 *   KaTeX and scroll offsets all stay alive in RAM, so switching is instant.
 *   display:none is deliberately avoided because it zeroes scroll positions.
 */
export function MultiEditorPane(props: EditorPaneProps) {
  const tabMode = usePrefsStore((s) => s.tabMode)
  const optimise = usePrefsStore((s) => s.optimiseMultiTabs)
  const openNoteIds = useNotepadStore((s) => s.openNoteIds)
  const selectedNoteId = useNotepadStore((s) => s.selectedNoteId)

  if (tabMode !== 'multi') {
    return <EditorPane {...props} />
  }

  if (optimise) {
    // key by note id — a fresh editor per note, scroll replayed on mount
    return <EditorPane key={selectedNoteId ?? 'none'} scrollMemory {...props} />
  }

  // the selected note always gets a pane, even if its tab was just closed
  const ids =
    selectedNoteId && !openNoteIds.includes(selectedNoteId)
      ? [...openNoteIds, selectedNoteId]
      : openNoteIds

  if (ids.length === 0) {
    return <EditorPane key="none" {...props} />
  }

  return (
    <div className="relative h-full min-h-0" data-testid="multi-editor-grid">
      {ids.map((id) => {
        const active = id === selectedNoteId
        return (
          <div
            key={id}
            className="absolute inset-0"
            style={{
              // visibility (not display) keeps scroll offsets and KaTeX alive
              visibility: active ? 'visible' : 'hidden',
              pointerEvents: active ? undefined : 'none',
            }}
            aria-hidden={!active}
            data-testid={`editor-pane-for-${id}`}
          >
            <EditorPane {...props} noteId={id} />
          </div>
        )
      })}
    </div>
  )
}
