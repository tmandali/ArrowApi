/**
 * PKCE utilities using Web Crypto API.
 * Compatible with Node.js 20+ and browser environments.
 * Ported from @earendil-works/pi-ai.
 */

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  // Generate 32 cryptographically random bytes for the verifier
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = base64urlEncode(verifierBytes);

  // Compute SHA-256 challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const challenge = base64urlEncode(new Uint8Array(hashBuffer));

  return { verifier, challenge };
}
