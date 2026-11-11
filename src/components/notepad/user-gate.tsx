'use client'

/**
 * User-selection gate — shown on every page load before any workspace.
 *
 * Every visit starts here: pick who is studying (Guest always, plus every
 * user added through the header menu or from this screen). Nothing about
 * the notepad renders until a user is chosen, which also guarantees the
 * store only ever hydrates into a user-specific data partition.
 */
import { useEffect, useState } from 'react'
import { Check, GraduationCap, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GUEST_USER, allUsers, useUsersStore, type PadUser } from '@/lib/notepad/users'
import { NameDialog } from '@/components/notepad/name-dialog'

interface UserGateProps {
  /** enter the workspace as this user */
  onEnter: (userId: string) => void
  /** id of the user currently being loaded (overlay), null when idle */
  busy: string | null
  /** id of the user who entered last (subtle marker only) */
  lastUserId?: string | null
}

export function UserGate({ onEnter, busy, lastUserId }: UserGateProps) {
  const users = useUsersStore((s) => s.users)
  const init = useUsersStore((s) => s.init)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  const everyone = allUsers(users)
  const busyUser = busy ? everyone.find((u) => u.id === busy) ?? null : null

  const handleCreated = (name: string, color: string) => {
    const user = useUsersStore.getState().addUser(name, color)
    // a brand-new pad starts immediately — no second click needed
    onEnter(user.id)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      {/* brand mark — same identity as the app header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
          <GraduationCap className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">StudyPad</h1>
          <p className="text-sm text-muted-foreground">Notepad for studies</p>
        </div>
        <p className="mt-3 text-base font-medium">Who is studying today?</p>
        <p className="max-w-sm text-[13px] leading-5 text-muted-foreground">
          Each user has their own private notepad on this device. Pick a user to continue,
          or add a new one.
        </p>
      </div>

      {/* user cards */}
      <div
        className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2"
        data-testid="user-gate"
      >
        {everyone.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            lastUsed={user.id === lastUserId}
            disabled={busy != null}
            onClick={() => onEnter(user.id)}
          />
        ))}

        {/* add-user card */}
        <button
          type="button"
          data-testid="gate-add-user"
          disabled={busy != null}
          onClick={() => setAddOpen(true)}
          className="flex min-h-[92px] items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors hover:border-emerald-500/60 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed text-muted-foreground">
            <UserPlus className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Add user</span>
            <span className="block text-xs text-muted-foreground">
              Create a new notepad profile
            </span>
          </span>
        </button>
      </div>

      <p className="mt-8 max-w-md text-center text-[11px] leading-4 text-muted-foreground">
        Everything stays saved in this browser — each user&apos;s notes are kept separately
        and nothing is sent anywhere.
      </p>

      {/* loading overlay while a user&apos;s data partition hydrates */}
      {busyUser && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ backgroundColor: busyUser.color }}>
            <span className="text-lg font-bold">{busyUser.name.charAt(0).toUpperCase()}</span>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="user-switch-overlay">
            Opening {busyUser.name}&apos;s notepad…
          </p>
        </div>
      )}

      {addOpen && (
        <NameDialog
          title="Add a user"
          label="Name"
          showColor
          submitLabel="Create user"
          onOpenChange={() => setAddOpen(false)}
          onSubmit={handleCreated}
        />
      )}
    </div>
  )
}

/** one selectable identity card */
function UserCard({
  user,
  lastUsed,
  disabled,
  onClick,
}: {
  user: PadUser
  lastUsed: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-testid={`user-card-${user.id}`}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[92px] items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-emerald-500/60 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: user.color }}
      >
        <span className="text-lg font-bold">{user.name.charAt(0).toUpperCase()}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          {lastUsed && <span className="text-[10px] text-muted-foreground">· last used</span>}
        </span>
        <span className="block text-xs text-muted-foreground">
          {user.id === GUEST_USER.id ? 'Shared starter pad' : 'Private notepad'}
        </span>
      </span>
      <Check className={cn('h-4 w-4 text-emerald-600', lastUsed ? 'opacity-100' : 'opacity-0')} />
    </button>
  )
}
