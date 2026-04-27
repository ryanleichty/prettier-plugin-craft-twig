export type TwigExpressionTokenType =
  | 'identifier'
  | 'number'
  | 'string'
  | 'operator'
  | 'punctuation';

export interface TwigExpressionToken {
  type: TwigExpressionTokenType;
  value: string;
}

export interface TwigExpressionNode {
  type: 'TwigExpression';
  source: string;
  tokens: TwigExpressionToken[];
}

const WORD_OPERATORS = new Set([
  'and',
  'or',
  'not',
  'in',
  'is',
  'matches',
  'starts',
  'with',
  'ends',
  'has',
  'some',
  'every',
  'b-and',
  'b-xor',
  'b-or',
]);

const SYMBOL_OPERATORS = [
  '=>',
  '???',
  '??',
  '===',
  '!==',
  '==',
  '!=',
  '>=',
  '<=',
  '<=>',
  '..',
  '//',
  '**',
  '?:',
  '+',
  '-',
  '*',
  '/',
  '%',
  '~',
  '>',
  '<',
  '=',
  '?',
  ':',
];

export function parseTwigExpression(source: string): TwigExpressionNode | null {
  const tokens = tokenizeTwigExpression(source);
  if (!tokens || !hasBalancedDelimiters(tokens)) return null;

  return {
    type: 'TwigExpression',
    source,
    tokens,
  };
}

export function tokenizeTwigExpression(source: string): TwigExpressionToken[] | null {
  const tokens: TwigExpressionToken[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const string = readQuotedString(source, i);
      if (!string) return null;
      tokens.push({ type: 'string', value: string.value });
      i = string.end;
      continue;
    }

    if (/[0-9]/.test(char)) {
      const match = source.slice(i).match(/^\d+(?:\.\d+)?/)!;
      tokens.push({ type: 'number', value: match[0] });
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = source.slice(i).match(/^[A-Za-z_][\w-]*/)!;
      const value = match[0];
      tokens.push({
        type: WORD_OPERATORS.has(value) ? 'operator' : 'identifier',
        value,
      });
      i += value.length;
      continue;
    }

    const operator = SYMBOL_OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (operator) {
      tokens.push({ type: 'operator', value: operator });
      i += operator.length;
      continue;
    }

    if ('()[]{}.,|'.includes(char)) {
      tokens.push({ type: 'punctuation', value: char });
      i += 1;
      continue;
    }

    return null;
  }

  return tokens;
}

export function splitTwigFilterChain(source: string): string[] | null {
  const parts = splitTopLevel(source, '|', { ignoreDoublePipe: true });
  return parts && parts.length > 1 ? parts : null;
}

export function splitTwigTopLevelProperties(source: string): string[] | null {
  return (
    splitTopLevel(source, ',', { allowTrailingSeparator: true }) ?? [source.trim()].filter(Boolean)
  );
}

export function splitTwigObjectProperty(property: string) {
  const colonIndex = findTopLevelColon(property);
  if (colonIndex === null) return null;

  return {
    key: property.slice(0, colonIndex).trimEnd(),
    value: property.slice(colonIndex + 1).trimStart(),
  };
}

export function formatTwigObjectProperty(property: string): string {
  const splitProperty = splitTwigObjectProperty(property);
  if (!splitProperty) return property.trim();

  return [splitProperty.key, ': ', splitProperty.value].join('');
}

function readQuotedString(source: string, start: number) {
  const quote = source[start];
  let isEscaped = false;

  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === quote) {
      return {
        value: source.slice(start, i + 1),
        end: i + 1,
      };
    }
  }

  return null;
}

function hasBalancedDelimiters(tokens: TwigExpressionToken[]) {
  const stack: string[] = [];
  const pairs: Record<string, string> = {
    ')': '(',
    ']': '[',
    '}': '{',
  };

  for (const token of tokens) {
    if (token.type !== 'punctuation') continue;

    if (['(', '[', '{'].includes(token.value)) {
      stack.push(token.value);
    } else if (Object.prototype.hasOwnProperty.call(pairs, token.value)) {
      if (stack.pop() !== pairs[token.value]) return false;
    }
  }

  return stack.length === 0;
}

function splitTopLevel(
  source: string,
  separator: string,
  { ignoreDoublePipe = false, allowTrailingSeparator = false } = {},
): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let nestingLevel = 0;
  let quote: '"' | "'" | null = null;
  let isEscaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = quote !== null;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[' || char === '{') {
      nestingLevel += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      nestingLevel -= 1;
    } else if (
      char === separator &&
      nestingLevel === 0 &&
      (!ignoreDoublePipe || (source[i - 1] !== '|' && source[i + 1] !== '|'))
    ) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }

  if (parts.length === 0) return null;

  const lastPart = source.slice(start).trim();
  if (lastPart) {
    parts.push(lastPart);
  } else if (!allowTrailingSeparator) {
    return null;
  }

  return parts.every(Boolean) ? parts : null;
}

function findTopLevelColon(source: string): number | null {
  let nestingLevel = 0;
  let quote: '"' | "'" | null = null;
  let isEscaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = quote !== null;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[' || char === '{') {
      nestingLevel += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      nestingLevel -= 1;
    } else if (char === ':' && nestingLevel === 0) {
      return i;
    }
  }

  return null;
}
