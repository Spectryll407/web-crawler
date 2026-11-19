// Errors that will fail the same way on every try (robots, auth, bad TLS...).
// The worker skips retries for these.
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}
