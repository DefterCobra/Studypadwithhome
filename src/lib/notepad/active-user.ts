/**
 * Which user's data partition the storage layer currently reads / writes.
 *
 * A tiny module-level pointer rather than a slice of the zustand store on
 * purpose: the persist middleware's storage functions run outside React —
 * and during rehydration, before the store holds any user state — so they
 * need a synchronous, framework-free answer to "whose data is this?".
 */

/** the built-in user every installation has, even before anyone is added */
export const GUEST_USER_ID = 'guest'

let activeUserId: string = GUEST_USER_ID

/** point the storage layer at a user's partition (called before rehydrating) */
export function setActiveUserId(id: string): void {
  activeUserId = id
}

/** the user whose partition storage reads/writes right now */
export function getActiveUserId(): string {
  return activeUserId
}
