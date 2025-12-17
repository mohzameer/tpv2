const GUEST_ID_KEY = 'thinkpost_guest_id'

export function getGuestId() {
  let guestId = localStorage.getItem(GUEST_ID_KEY)
  if (!guestId) {
    guestId = `guest_${crypto.randomUUID()}`
    localStorage.setItem(GUEST_ID_KEY, guestId)
  }
  return guestId
}
