// Extracts a human-readable error message from a fetch Response. The server
// error envelope (server/app.js) returns { success: false, error, details? },
// and route handlers may also return { error } or { message }. This helper
// never throws and always returns a string, so callers can safely render it.
export const NETWORK_ERROR_MESSAGE =
    'Could not reach the server. Check your connection and try again.';

export async function responseErrorMessage(response, fallback) {
    try {
        const body = await response.json();
        if (body && typeof body === 'object') {
            const candidates = [body.error, body.message, body.details];
            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate.trim() !== '') {
                    return candidate;
                }
            }
        }
    } catch (e) {
        // response.json() failed (non-JSON body) — fall back to the fallback.
    }
    return fallback;
}
