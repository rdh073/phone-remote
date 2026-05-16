import { describe, expect, it } from 'vitest';

import { parseDotEnv } from '../src/env-loader.js';

describe('parseDotEnv', () => {
  it('parses simple KEY=value lines', () => {
    expect(parseDotEnv('FOO=bar\nBAZ=qux')).toEqual([
      ['FOO', 'bar'],
      ['BAZ', 'qux'],
    ]);
  });

  it('ignores blank lines and comments', () => {
    const content = `
# a comment
FOO=1

  # indented comment
BAR=2
`;
    expect(parseDotEnv(content)).toEqual([
      ['FOO', '1'],
      ['BAR', '2'],
    ]);
  });

  it('skips malformed lines (no =, bad key)', () => {
    const content = ['NO_EQUALS_HERE', '1NUMSTART=x', 'lowercase_ok=y', 'OK=z'].join('\n');
    // Regex `^[A-Z_][A-Z0-9_]*$/i` allows lowercase too — only `1NUMSTART`
    // and the bare line should drop.
    expect(parseDotEnv(content)).toEqual([
      ['lowercase_ok', 'y'],
      ['OK', 'z'],
    ]);
  });

  it('unwraps double-quoted values with \\n / \\t / \\" escapes', () => {
    const content = String.raw`MULTI="line1\nline2"
TAB="a\tb"
QUOTED="he said \"hi\""`;
    expect(parseDotEnv(content)).toEqual([
      ['MULTI', 'line1\nline2'],
      ['TAB', 'a\tb'],
      ['QUOTED', 'he said "hi"'],
    ]);
  });

  it('unwraps single-quoted values literally (no escapes)', () => {
    expect(parseDotEnv("FOO='no\\nescape'")).toEqual([['FOO', 'no\\nescape']]);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDotEnv('  FOO  =  bar  ')).toEqual([['FOO', 'bar']]);
  });

  it('keeps later occurrences (caller decides precedence)', () => {
    // parseDotEnv just returns the pairs in order; .env then .env.local
    // precedence is enforced by loadEnvFiles assigning to process.env in
    // that order, with later writes winning.
    expect(parseDotEnv('FOO=a\nFOO=b')).toEqual([
      ['FOO', 'a'],
      ['FOO', 'b'],
    ]);
  });

  it('handles values containing = signs', () => {
    expect(parseDotEnv('DSN=postgres://u:p@h/db?sslmode=require')).toEqual([
      ['DSN', 'postgres://u:p@h/db?sslmode=require'],
    ]);
  });
});
