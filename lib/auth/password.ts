/** One place for the password rule, so sign-up and reset can't drift apart. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A message for the person if `password` (and its confirmation, when given)
 * is not acceptable, otherwise null. The server (Supabase) has its own rules
 * as well; this is the immediate, plain-language check before anything is sent.
 */
export function validateNewPassword(
  password: string,
  confirmation?: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.trim() === "") {
    return "A password can't be only spaces.";
  }
  if (confirmation !== undefined && password !== confirmation) {
    return "The two passwords don't match.";
  }
  return null;
}
