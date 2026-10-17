import { describe, expect, it } from 'vitest';
import { JsonCompletionTracker } from '@/core/commands/json-completion';

function feed(chunks: string[]) {
  const t = new JsonCompletionTracker();
  const index = chunks.findIndex((c) => t.push(c));
  return { complete: t.complete, at: index };
}

describe('JsonCompletionTracker', () => {
  it('completes when the first top-level object closes across chunks', () => {
    expect(feed(['{"a":', '{"b":1}', ',"c":[1,2]', '}', ' trailing'])).toEqual({ complete: true, at: 3 });
  });

  it('ignores braces inside strings, including escaped quotes', () => {
    const r = feed(['{"message":"use { and } \\" here"', ',"x":1']);
    expect(r.complete).toBe(false);
    expect(feed(['{"message":"}\\"}"}'])).toEqual({ complete: true, at: 0 });
  });

  it('ignores text before the first brace', () => {
    expect(feed(['Sure! "quoted" ', '{"ok":true}'])).toEqual({ complete: true, at: 1 });
  });

  it('stays incomplete for unbalanced output', () => {
    expect(feed(['{"operations":[{"op":"create"', '}]']).complete).toBe(false);
  });
});
