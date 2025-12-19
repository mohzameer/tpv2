const GUEST_ID_KEY = 'thinkpost_guest_id'
const HAS_LOGGED_IN_KEY = 'thinkpost_has_logged_in'

export function getGuestId() {
  // Check if user has ever logged in - if so, they can't be a guest
  const hasLoggedIn = localStorage.getItem(HAS_LOGGED_IN_KEY) === 'true'
  console.log('[guest] getGuestId - hasLoggedIn:', hasLoggedIn)
  if (hasLoggedIn) {
    console.error('[guest] getGuestId - User has logged in before, guest access denied')
    throw new Error('User must be logged in. Guest access is not allowed after first login.')
  }
  
  let guestId = localStorage.getItem(GUEST_ID_KEY)
  if (!guestId) {
    guestId = `guest_${crypto.randomUUID()}`
    localStorage.setItem(GUEST_ID_KEY, guestId)
    console.log('[guest] getGuestId - Created new guest ID:', guestId)
  } else {
    console.log('[guest] getGuestId - Using existing guest ID:', guestId)
  }
  return guestId
}

export function markAsLoggedIn() {
  console.log('[guest] markAsLoggedIn - Setting has_logged_in flag')
  localStorage.setItem(HAS_LOGGED_IN_KEY, 'true')
}

export function hasEverLoggedIn() {
  const result = localStorage.getItem(HAS_LOGGED_IN_KEY) === 'true'
  console.log('[guest] hasEverLoggedIn:', result)
  return result
}
