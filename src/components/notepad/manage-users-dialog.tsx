'use client'

/**
 * Manage users — rename and delete notepad profiles on this device, and
 * add new ones. Guest is built in: it can be switched to but never renamed
 * or removed, so the shared starter pad (and the pre-multiuser data that
 * lives in it) always stays reachable.
 *
 * Deleting a user wipes their whole IndexedDB partition plus their per-user
 * localStorage markers (welcome answer, last-used hint), so if the same name
 * is ever created again it starts genuinely fresh.
 */
import { useState } from 'react'
import { Check, Lock, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { NameDialog } from '@/components/notepad/name-dialog'
import { GUEST_USER, useUsersStore, type PadUser } from '@/lib/notepad/users'

/** names longer than this are truncated by the store, mirroring addUser */
const MAX_NAME = 40

interface ManageUsersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** a user was created or renamed (caller shows the toast) */
  onUserChanged?: (kind: 'added' | 'renamed', name: string) => void
  /** a user was fully removed — the caller exits to the gate if it was current */
  onUserDeleted?: (id: string, name: string) => void
}

export function ManageUsersDialog({
  open,
  onOpenChange,
  onUserChanged,
  onUserDeleted,
}: ManageUsersDialogProps) {
  const users = useUsersStore((s) => s.users)
  const currentUserId = useUsersStore((s) => s.currentUserId)
  /** id of the row currently showing its inline rename input, if any */
  const [editingId, setEditingId] = useState<string | null>(null)
  /** user pending deletion (drives the confirmation alert) */
  const [deleteCandidate, setDeleteCandidate] = useState<PadUser | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const close = () => {
    setEditingId(null)
    setDeleteCandidate(null)
    onOpenChange(false)
  }

  const handleDeleted = (user: PadUser) => {
    setDeleteCandidate(null)
    setEditingId(null)
    useUsersStore.getState().removeUser(user.id)
    onUserDeleted?.(user.id, user.name)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
        <DialogContent className="sm:max-w-md" data-testid="manage-users-dialog">
          <DialogHeader>
            <DialogTitle>Manage users</DialogTitle>
            <DialogDescription>
              Rename or remove notepad profiles on this device. Each user&apos;s notes are
              kept separately and never leave the browser.
            </DialogDescription>
          </DialogHeader>

          <div
            className="max-h-[55vh] space-y-2 overflow-y-auto pr-1"
            data-testid="manage-users-list"
          >
            <UserRow
              user={GUEST_USER}
              isCurrent={currentUserId === GUEST_USER.id}
              locked
              editing={false}
              onStartEdit={() => {}}
              onEndEdit={() => {}}
              onRenamed={() => {}}
              onRequestDelete={() => {}}
            />
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isCurrent={currentUserId === user.id}
                locked={false}
                editing={editingId === user.id}
                onStartEdit={() => setEditingId(user.id)}
                onEndEdit={() => setEditingId(null)}
                onRenamed={(name) => onUserChanged?.('renamed', name)}
                onRequestDelete={() => setDeleteCandidate(user)}
              />
            ))}
          </div>

          <button
            type="button"
            data-testid="manage-add-user"
            onClick={() => setAddOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-muted-foreground transition-colors hover:border-emerald-500/60 hover:bg-muted/40 hover:text-foreground"
          >
            <UserPlus className="h-4 w-4" />
            <span className="text-sm font-medium">Add user</span>
          </button>
        </DialogContent>
      </Dialog>

      {addOpen && (
        <NameDialog
          title="Add a user"
          label="Name"
          showColor
          submitLabel="Create user"
          onOpenChange={() => setAddOpen(false)}
          onSubmit={(name, color) => {
            const user = useUsersStore.getState().addUser(name, color)
            onUserChanged?.('added', user.name)
          }}
        />
      )}

      {deleteCandidate && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleteCandidate(null)}>
          <AlertDialogContent data-testid={`delete-user-confirm-${deleteCandidate.id}`}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteCandidate.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                All of {deleteCandidate.name}&apos;s notes, flashcards and quizzes on this
                device will be permanently removed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                data-testid={`delete-user-confirm`}
                onClick={() => handleDeleted(deleteCandidate)}
              >
                Delete user
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

/** one profile row: avatar + name (or inline rename input) + actions */
function UserRow({
  user,
  isCurrent,
  locked,
  editing,
  onStartEdit,
  onEndEdit,
  onRenamed,
  onRequestDelete,
}: {
  user: PadUser
  isCurrent: boolean
  /** Guest — cannot be renamed or removed */
  locked: boolean
  editing: boolean
  onStartEdit: () => void
  onEndEdit: () => void
  onRenamed: (name: string) => void
  onRequestDelete: () => void
}) {
  /** draft of the inline rename input, re-seeded whenever editing starts */
  const [draft, setDraft] = useState(user.name)

  const beginEdit = () => {
    setDraft(user.name)
    onStartEdit()
  }

  const saveRename = () => {
    const trimmed = draft.trim().slice(0, MAX_NAME)
    if (trimmed && trimmed !== user.name) {
      useUsersStore.getState().renameUser(user.id, trimmed)
      onRenamed(trimmed)
    }
    onEndEdit()
  }

  return (
    <div
      data-testid={`user-row-${user.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: user.color }}
      >
        <span className="text-sm font-bold">{user.name.charAt(0).toUpperCase()}</span>
      </span>

      <span className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={60}
            aria-label={`New name for ${user.name}`}
            data-testid={`rename-input-${user.id}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                saveRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onEndEdit()
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{user.name}</span>
            {isCurrent && (
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                You
              </Badge>
            )}
            {locked && (
              <span className="shrink-0 text-[10px] text-muted-foreground">built in</span>
            )}
          </span>
        )}
        <span className="block text-xs text-muted-foreground">
          {locked ? 'Shared starter pad' : 'Private notepad'}
        </span>
      </span>

      {locked ? (
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : editing ? (
        <span className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
            aria-label={`Save new name for ${user.name}`}
            title="Save"
            data-testid={`confirm-rename-${user.id}`}
            onClick={saveRename}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Cancel renaming"
            title="Cancel"
            data-testid={`cancel-rename-${user.id}`}
            onClick={onEndEdit}
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Rename ${user.name}`}
            title="Rename"
            data-testid={`rename-user-${user.id}`}
            onClick={beginEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${user.name}`}
            title="Delete"
            data-testid={`delete-user-${user.id}`}
            onClick={onRequestDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </span>
      )}
    </div>
  )
}
