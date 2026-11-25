// Mirrors the server-side MAC guard in server/app.js (isValidMac / MAC_REGEX).
// Keeping this regex in sync with the server matters: the client validates a MAC
// before POSTing so an invalid MAC never reaches the API, and the API rejects the
// exact colon-separated format it accepts — so the client must accept the same set.
const MAC_REGEX = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;

export function isValidMac(mac) {
    return typeof mac === 'string' && MAC_REGEX.test(mac.trim());
}
