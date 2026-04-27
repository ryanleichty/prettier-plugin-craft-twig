import { TwigAstPath, CraftTwigNode, TwigParserOptions, Position } from '~/types';

export function isWhitespace(source: string, loc: number): boolean {
  if (loc < 0 || loc >= source.length) return false;
  return !!source[loc].match(/\s/);
}

export const trim = (x: string) => x.trim();
export const trimEnd = (x: string) => x.trimEnd();

export function bodyLines(str: string): string[] {
  return str
    .replace(/^(?: |\t)*(\r?\n)*|\s*$/g, '') // only want the meat
    .split(/\r?\n/);
}

export function markupLines(markup: string): string[] {
  return markup.trim().split('\n');
}

export function reindent(lines: string[], skipFirst = false): string[] {
  const minIndentLevel = lines
    .filter((_, i) => (skipFirst ? i > 0 : true))
    .filter((line) => line.trim().length > 0)
    .map((line) => (line.match(/^\s*/) as any)[0].length)
    .reduce((a, b) => Math.min(a, b), Infinity);

  if (minIndentLevel === Infinity) {
    return lines;
  }

  const indentStrip = new RegExp('^' + '\\s'.repeat(minIndentLevel));
  return lines.map((line) => line.replace(indentStrip, '')).map(trimEnd);
}

export function originallyHadLineBreaks(
  path: TwigAstPath,
  { locStart, locEnd }: TwigParserOptions,
): boolean {
  const node = path.getValue();
  return hasLineBreakInRange(node.source, locStart(node), locEnd(node));
}

export function hasLineBreakInRange(source: string, locStart: number, locEnd: number): boolean {
  const indexOfNewLine = source.indexOf('\n', locStart);
  return 0 <= indexOfNewLine && indexOfNewLine < locEnd;
}

export function hasMoreThanOneNewLineBetweenNodes(
  source: string,
  prev: { position: Position } | undefined,
  next: { position: Position } | undefined,
): boolean {
  if (!prev || !next) return false;
  const between = source.slice(prev.position.end, next.position.start);
  const count = between.match(/\n/g)?.length || 0;
  return count > 1;
}

/**
 * Transforms quotes in base case markup strings based on the twigSingleQuote option.
 * This handles cases where the parser falls back to storing markup as a raw string
 * (e.g., Twig function calls like `stimulus_controller('controller-name')`).
 *
 * The function replaces quotes while being careful to:
 * - Not replace quotes that are escaped
 * - Not replace quotes inside strings that contain the target quote character
 * - Handle nested quotes properly
 * - Preserve quotes whose style is semantically meaningful in Twig (see below)
 *
 * Twig quote semantics:
 * - Double-quoted strings support `#{...}` expression interpolation and
 *   escape sequences like `\n`, `\t`, `\r`, `\"`, etc.
 * - Single-quoted strings are literal — only `\\` and `\'` are treated as
 *   escape sequences; everything else (including `#{...}`) is literal.
 *
 * Converting between styles when these features are present would silently
 * change program behavior, so we leave such strings untouched.
 */
export function transformStringQuotes(markup: string, twigSingleQuote: boolean): string {
  const preferredQuote = twigSingleQuote ? "'" : '"';

  // Match strings with the non-preferred quote style
  // This regex matches quoted strings, being careful about escapes
  const stringRegex = twigSingleQuote
    ? /"([^"\\]|\\.)*"/g // Match double-quoted strings
    : /'([^'\\]|\\.)*'/g; // Match single-quoted strings

  return markup.replace(stringRegex, (match) => {
    // Get the content without the outer quotes
    const content = match.slice(1, -1);

    // Twig only interpolates `#{...}` inside double-quoted strings.
    // Converting either direction would silently change the string's meaning
    // (a lost interpolation, or a newly introduced one), so preserve the
    // original quotes when this syntax is present.
    if (content.includes('#{')) {
      return match;
    }

    // Twig only interprets escape sequences beyond `\\` and `\'` inside
    // double-quoted strings. If the content contains any other backslash
    // escape (e.g. `\n`, `\t`, `\"`), converting between quote styles would
    // change the resulting string, so preserve the original quotes.
    //
    // Walk the content as a sequence of escape pairs so consecutive
    // backslashes (`\\`) don't get misread as `\` + next-char.
    for (let i = 0; i < content.length; i++) {
      if (content[i] !== '\\') continue;
      const next = content[i + 1];
      if (next !== '\\' && next !== "'") {
        return match;
      }
      i += 1;
    }

    // If the content contains the preferred quote (unescaped), keep original quotes
    // to avoid breaking the string
    if (content.includes(preferredQuote)) {
      return match;
    }

    // Replace the quotes
    return preferredQuote + content + preferredQuote;
  });
}
