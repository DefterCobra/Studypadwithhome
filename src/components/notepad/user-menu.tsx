'use client'

/**
 * Header user menu — sits right beside the data (Database) menu button.
 *
 * One entry point for everything multi-user while inside a workspace:
 * switch to any registered user (each user's whole data partition is
 * swapped in) and add a new user. Adding from here keeps the current
 * workspace open — the caller decides whether to switch.
 */
import { useState } from 'react'
import { Check, CircleUserRound, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NameDialog } from '@/components/notepad/name-dialog'
import { allUsers, useUsersStore } from '@/lib/notepad/users'

interface UserMenuProps {
  /** enter another user's workspace (loading is handled by the caller) */
  onSwitchUser: (userId: string) => void
  /** a user was created from this menu */
  onUserAdded?: (name: string) => void
}

export function UserMenu({ onSwitchUser, onUserAdded }: UserMenuProps) {
  const users = useUsersStore((s) => s.users)
  const currentUserId = useUsersStore((s) => s.currentUserId)
  const [addOpen, setAddOpen] = useState(false)

  const everyone = allUsers(users)
  const current = everyone.find((u) => u.id === currentUserId) ?? everyone[0]

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            aria-label={`User menu — current user ${current.name}; switch or add users`}
            title="Switch or add users"
            data-testid="user-menu-button"
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: current.color }}
            >
              {current.name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-[9rem] truncate sm:inline">{current.name}</span>
            <CircleUserRound className="h-3.5 w-3.5 text-muted-foreground sm:hidden" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">Switch user</DropdownMenuLabel>
          {everyone.map((user) => (
            <DropdownMenuItem
              key={user.id}
              data-testid={`user-item-${user.id}`}
              disabled={user.id === currentUserId}
              onClick={() => onSwitchUser(user.id)}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: user.color }}
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{user.name}</span>
              {user.id === currentUserId && (
                <Check className="ml-auto h-4 w-4 text-emerald-600" aria-hidden />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="add-user-item"
            onClick={() => setAddOpen(true)}
          >
            <UserPlus className="h-4 w-4" /> Add user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {addOpen && (
        <NameDialog
          title="Add a user"
          label="Name"
          showColor
          submitLabel="Create user"
          onOpenChange={() => setAddOpen(false)}
          onSubmit={(name, color) => {
            const user = useUsersStore.getState().addUser(name, color)
            onUserAdded?.(user.name)
          }}
        />
      )}
    </>
  )
}
