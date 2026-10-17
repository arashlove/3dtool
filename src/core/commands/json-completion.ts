/**
 * Incrementally tracks streamed text and reports when the first top-level JSON object is closed,
 * so generation can stop without waiting for trailing tokens. Braces inside strings are ignored.
 */
export class JsonCompletionTracker {
  private depth = 0;
  private started = false;
  private inString = false;
  private escaped = false;
  private done = false;

  push(chunk: string): boolean {
    if (this.done) return true;
    for (const ch of chunk) {
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }
      if (!this.started) {
        if (ch === '{') {
          this.started = true;
          this.depth = 1;
        }
        continue;
      }
      if (ch === '"') this.inString = true;
      else if (ch === '{') this.depth++;
      else if (ch === '}') {
        this.depth--;
        if (this.depth === 0) {
          this.done = true;
          return true;
        }
      }
    }
    return false;
  }

  get complete() {
    return this.done;
  }
}
