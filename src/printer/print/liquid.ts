import { Doc, doc } from 'prettier';
import {
  AstPath,
  LiquidAstPath,
  LiquidBranch,
  LiquidDrop,
  LiquidParserOptions,
  LiquidPrinter,
  LiquidPrinterArgs,
  LiquidTag,
  LiquidTagNamed,
  LiquidBranchNamed,
  NamedTags,
  NodeTypes,
  LiquidRawTag,
  LiquidStatement,
} from '~/types';
import { isBranchedTag } from '~/parser/stage-2-ast';
import {
  formatTwigObjectProperty,
  parseTwigExpression,
  splitTwigFilterChain,
  splitTwigObjectProperty,
  splitTwigTopLevelProperties,
} from '~/parser/twig-expression';
import { assertNever, getTwigSingleQuote } from '~/utils';

import {
  getWhitespaceTrim,
  hasMeaningfulLackOfLeadingWhitespace,
  hasMeaningfulLackOfTrailingWhitespace,
  hasMeaningfulLackOfDanglingWhitespace,
  isDeeplyNested,
  isEmpty,
  markupLines,
  originallyHadLineBreaks,
  reindent,
  trim,
  hasLineBreakInRange,
  isAttributeNode,
  shouldPreserveContent,
  FORCE_FLAT_GROUP_ID,
  last,
  transformStringQuotes,
} from '~/printer/utils';

import { printChildren } from '~/printer/print/children';

const LIQUID_TAGS_THAT_ALWAYS_BREAK = ['for', 'switch'];

const { builders, utils } = doc;
const { group, hardline, ifBreak, indent, join, line, softline, literalline } = builders;
const { replaceEndOfLine } = doc.utils as any;

export function printLiquidDrop(
  path: LiquidAstPath,
  options: LiquidParserOptions,
  print: LiquidPrinter,
  { leadingSpaceGroupId, trailingSpaceGroupId }: LiquidPrinterArgs,
) {
  const node: LiquidDrop = path.getValue() as LiquidDrop;
  const whitespaceStart = getWhitespaceTrim(
    node.whitespaceStart,
    hasMeaningfulLackOfLeadingWhitespace(node),
    leadingSpaceGroupId,
  );
  const whitespaceEnd = getWhitespaceTrim(
    node.whitespaceEnd,
    hasMeaningfulLackOfTrailingWhitespace(node),
    trailingSpaceGroupId,
  );

  if (typeof node.markup !== 'string') {
    const whitespace = node.markup.filters.length > 0 ? line : ' ';
    return group([
      '{{',
      whitespaceStart,
      indent([whitespace, path.call(print, 'markup')]),
      whitespace,
      whitespaceEnd,
      '}}',
    ]);
  }

  // Transform quotes in base case markup based on twigSingleQuote option
  const markup = transformStringQuotes(node.markup, getTwigSingleQuote(options));

  const lines = markupLines(markup);
  if (lines.length > 1) {
    return group([
      '{{',
      whitespaceStart,
      indent([hardline, join(hardline, printRawMarkupLines(lines, options))]),
      hardline,
      whitespaceEnd,
      '}}',
    ]);
  }

  return group([
    '{{',
    whitespaceStart,
    indent([line, printSingleLineRawMarkup(markup)]),
    line,
    whitespaceEnd,
    '}}',
  ]);
}

function printSingleLineRawMarkup(markup: string): Doc {
  const expression = printRawTwigDropExpression(markup);
  if (expression) return expression;

  const objectLiteral = getObjectLiteralRange(markup);
  if (!objectLiteral) return markup;

  const { prefix, body, suffix } = objectLiteral;
  const properties = splitTwigTopLevelProperties(body);
  if (!properties) return markup;
  if (properties.length === 0) return markup;

  return group([
    prefix.trimEnd(),
    indent([line, join([',', line], properties.map(formatTwigObjectProperty))]),
    line,
    suffix.trimStart(),
  ]);
}

function printRawTwigDropExpression(expression: string): Doc | null {
  return (
    printRawTwigElvisExpression(expression) ??
    printRawTwigTernary(expression) ??
    printRawTwigCoalescingChain(expression) ??
    printRawTwigParenthesizedExpression(expression) ??
    printRawTwigMethodChainExpression(expression) ??
    printRawTwigCallExpression(expression) ??
    printRawTwigFilterChainExpression(expression, { indentFilters: false }) ??
    printRawTwigArrayLiteral(expression) ??
    printRawTwigObjectLiteral(expression)
  );
}

function printRawMarkupLines(lines: string[], options: LiquidParserOptions): string[] {
  let nestingLevel = 0;
  const indentUnit = options.useTabs ? '\t' : ' '.repeat(options.tabWidth ?? 2);

  return reindent(lines, true).map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    const leadingClosers = countLeadingClosingBrackets(trimmed);
    const lineLevel = index === 0 ? 0 : Math.max(nestingLevel - leadingClosers, 0);

    nestingLevel = Math.max(nestingLevel + bracketNestingDelta(trimmed), 0);

    const printedLine = lineLevel > 0 ? formatTwigObjectProperty(trimmed) : trimmed;

    return indentUnit.repeat(lineLevel) + printedLine;
  });
}

function getObjectLiteralRange(markup: string) {
  let quote: '"' | "'" | null = null;
  let isEscaped = false;
  let objectStart: number | null = null;
  let nestingLevel = 0;

  for (let i = 0; i < markup.length; i++) {
    const char = markup[i];

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
      continue;
    }

    if (char === '{') {
      if (objectStart === null) objectStart = i;
      nestingLevel += 1;
      continue;
    }

    if (char === '}') {
      nestingLevel -= 1;
      if (objectStart !== null && nestingLevel === 0) {
        return {
          prefix: markup.slice(0, objectStart + 1),
          body: markup.slice(objectStart + 1, i),
          suffix: markup.slice(i),
        };
      }
    }
  }

  return null;
}

function countLeadingClosingBrackets(line: string): number {
  const match = line.match(/^[)\]}]+/);
  return match ? match[0].length : 0;
}

function bracketNestingDelta(line: string): number {
  let delta = 0;
  let quote: '"' | "'" | null = null;
  let isEscaped = false;

  for (const char of line) {
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
      delta += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      delta -= 1;
    }
  }

  return Math.min(delta, 1);
}

function printNamedLiquidBlockStart(
  path: AstPath<LiquidTagNamed | LiquidBranchNamed>,
  _options: LiquidParserOptions,
  print: LiquidPrinter,
  args: LiquidPrinterArgs,
  whitespaceStart: Doc,
  whitespaceEnd: Doc,
): Doc {
  const node = path.getValue();
  const { isLiquidStatement } = args;

  // This is slightly more verbose than 3 ternaries, but I feel like I
  // should make it obvious that these three things work in tandem on the
  // same conditional.
  const { wrapper, prefix, suffix } = (() => {
    if (isLiquidStatement) {
      return {
        wrapper: utils.removeLines,
        prefix: '',
        suffix: () => '',
      };
    } else {
      return {
        wrapper: group,
        prefix: ['{%', whitespaceStart, ' '],
        suffix: (trailingWhitespace: Doc) => [trailingWhitespace, whitespaceEnd, '%}'],
      };
    }
  })();

  const tag = (trailingWhitespace: Doc) =>
    wrapper([
      ...prefix,
      node.name,
      ' ',
      indent(path.call((p) => print(p, args), 'markup')),
      ...suffix(trailingWhitespace),
    ]);

  const tagWithArrayMarkup = (whitespace: Doc) =>
    wrapper([
      ...prefix,
      node.name,
      ' ',
      indent([
        join(
          [',', line],
          path.map((p) => print(p, args), 'markup'),
        ),
      ]),
      ...suffix(whitespace),
    ]);

  switch (node.name) {
    case NamedTags.echo: {
      const trailingWhitespace = node.markup.filters.length > 0 ? line : ' ';
      return tag(trailingWhitespace);
    }

    case NamedTags.assign: {
      const trailingWhitespace = node.markup.value.filters.length > 0 ? line : ' ';
      return tag(trailingWhitespace);
    }

    case NamedTags.cycle: {
      const whitespace = node.markup.args.length > 1 ? line : ' ';
      return wrapper([
        ...prefix,
        node.name,
        // We want to break after the groupName
        node.markup.groupName ? ' ' : '',
        indent(path.call((p) => print(p, args), 'markup')),
        ...suffix(whitespace),
      ]);
    }

    case NamedTags.include:
    case NamedTags.render: {
      const markup = node.markup;
      const trailingWhitespace =
        markup.args.length > 0 || (markup.variable && markup.alias) ? line : ' ';
      return tag(trailingWhitespace);
    }

    case NamedTags.capture:
    case NamedTags.set:
    case NamedTags.increment:
    case NamedTags.decrement:
    case NamedTags.layout:
    case NamedTags.section: {
      return tag(' ');
    }
    case NamedTags.sections: {
      return tag(' ');
    }

    case NamedTags.form: {
      const trailingWhitespace = node.markup.length > 1 ? line : ' ';
      return tagWithArrayMarkup(trailingWhitespace);
    }

    case NamedTags.tablerow:
    case NamedTags.for: {
      const trailingWhitespace = node.markup.reversed || node.markup.args.length > 0 ? line : ' ';
      return tag(trailingWhitespace);
    }

    case NamedTags.paginate: {
      return tag(line);
    }

    case NamedTags.if:
    case NamedTags.elseif:
    case NamedTags.elsif:
    case NamedTags.unless: {
      const trailingWhitespace = [NodeTypes.Comparison, NodeTypes.LogicalExpression].includes(
        node.markup.type,
      )
        ? line
        : ' ';
      return tag(trailingWhitespace);
    }

    case NamedTags.switch: {
      return tag(' ');
    }

    case NamedTags.case: {
      return tag(' ');
    }

    case NamedTags.liquid: {
      return group([
        ...prefix,
        node.name,
        indent([
          hardline,
          join(
            hardline,
            path.map((p) => {
              const curr = p.getValue();
              return [
                getSpaceBetweenLines(curr.prev as LiquidStatement | null, curr),
                print(p, { ...args, isLiquidStatement: true }),
              ];
            }, 'markup'),
          ),
        ]),
        ...suffix(hardline),
      ]);
    }

    default: {
      return assertNever(node);
    }
  }
}

function printLiquidStatement(
  path: AstPath<Extract<LiquidTag, { name: string; markup: string }>>,
  options: LiquidParserOptions,
  _print: LiquidPrinter,
  _args: LiquidPrinterArgs,
): Doc {
  const node = path.getValue();
  const transformedMarkup = transformStringQuotes(node.markup, getTwigSingleQuote(options));
  const shouldSkipLeadingSpace =
    transformedMarkup.trim() === '' || (node.name === '#' && transformedMarkup.startsWith('#'));
  return doc.utils.removeLines([node.name, shouldSkipLeadingSpace ? '' : ' ', transformedMarkup]);
}

export function printLiquidBlockStart(
  path: AstPath<LiquidTag | LiquidBranch>,
  options: LiquidParserOptions,
  print: LiquidPrinter,
  args: LiquidPrinterArgs = {},
): Doc {
  const node = path.getValue();
  const { leadingSpaceGroupId, trailingSpaceGroupId } = args;

  if (!node.name) return '';

  const whitespaceStart = getWhitespaceTrim(
    node.whitespaceStart,
    needsBlockStartLeadingWhitespaceStrippingOnBreak(node),
    leadingSpaceGroupId,
  );
  const whitespaceEnd = getWhitespaceTrim(
    node.whitespaceEnd,
    needsBlockStartTrailingWhitespaceStrippingOnBreak(node),
    trailingSpaceGroupId,
  );

  if (typeof node.markup !== 'string') {
    return printNamedLiquidBlockStart(
      path as AstPath<LiquidTagNamed | LiquidBranchNamed>,
      options,
      print,
      args,
      whitespaceStart,
      whitespaceEnd,
    );
  }

  if (args.isLiquidStatement) {
    return printLiquidStatement(
      path as AstPath<Extract<LiquidTag, { name: string; markup: string }>>,
      options,
      print,
      args,
    );
  }

  // For Twig comments ({# ... #}), don't transform quotes - comments should be preserved as-is
  if (node.name === 'twig') {
    const lines = markupLines(node.markup);
    if (lines.length > 1) {
      return group([
        '{#',
        whitespaceStart,
        indent([hardline, join(hardline, lines.map(trim))]),
        hardline,
        whitespaceEnd,
        '#}',
      ]);
    }

    return group([
      '{#',
      whitespaceStart,
      node.markup ? ` ${node.markup.trim()}` : '',
      ' ',
      whitespaceEnd,
      '#}',
    ]);
  }

  // Transform quotes in base case markup based on twigSingleQuote option
  const transformedMarkup = transformStringQuotes(node.markup, getTwigSingleQuote(options));
  const lines = markupLines(transformedMarkup);

  if (node.name === 'liquid') {
    return group([
      '{%',
      whitespaceStart,
      ' ',
      node.name,
      indent([hardline, join(hardline, reindent(lines, true))]),
      hardline,
      whitespaceEnd,
      '%}',
    ]);
  }

  if (lines.length > 1) {
    const printedMarkup = printMultilineRawTagMarkup(lines, options);
    if (printedMarkup) {
      return group([
        '{%',
        whitespaceStart,
        indent([line, node.name, ' ', printedMarkup]),
        line,
        whitespaceEnd,
        '%}',
      ]);
    }

    const reindentedLines = reindent(lines, true);
    return group([
      '{%',
      whitespaceStart,
      indent([hardline, node.name, ' ', join(hardline, reindentedLines)]),
      hardline,
      whitespaceEnd,
      '%}',
    ]);
  }

  const printedMarkup = printSingleLineRawTagMarkup(transformedMarkup, options);
  if (printedMarkup) {
    return group([
      '{%',
      whitespaceStart,
      indent([line, node.name, transformedMarkup ? [' ', printedMarkup] : '']),
      line,
      whitespaceEnd,
      '%}',
    ]);
  }

  return group([
    '{%',
    whitespaceStart,
    ' ',
    node.name,
    transformedMarkup ? ` ${transformedMarkup}` : '',
    ' ',
    whitespaceEnd,
    '%}',
  ]);
}

function printMultilineRawTagMarkup(lines: string[], options: LiquidParserOptions): Doc | null {
  const markup = reindent(lines, true)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');

  const assignment = printRawTwigAssignment(markup);
  if (assignment) return assignment;

  return printSingleLineRawTagMarkup(markup, options);
}

function printSingleLineRawTagMarkup(markup: string, options: LiquidParserOptions): Doc | null {
  const parsedExpression = parseTwigExpression(markup);
  if (!parsedExpression) return null;

  const includeMarkup = printRawTwigIncludeMarkup(parsedExpression.source, {
    shouldBreak: parsedExpression.source.length > options.printWidth,
  });
  if (includeMarkup) return includeMarkup;

  const assignment = printRawTwigAssignment(parsedExpression.source);
  if (assignment) return assignment;

  const filterChain = splitTwigFilterChain(parsedExpression.source);
  if (!filterChain) return null;

  const [expression, ...filters] = filterChain;
  return group([
    expression,
    indent([
      softline,
      join(
        softline,
        filters.map((filter) => ['|', printRawTwigFilter(filter)]),
      ),
    ]),
  ]);
}

function printRawTwigIncludeMarkup(markup: string, { shouldBreak = false } = {}): Doc | null {
  const match = /^([\s\S]+?)\s+with\s+(\{[\s\S]+\})(\s+only)?$/.exec(markup.trim());
  if (!match) return null;

  const variables = printRawTwigObjectLiteral(match[2], { shouldBreak });
  if (!variables) return null;

  return group([
    match[1].trim(),
    indent([line, 'with ', variables, match[3] ? [line, match[3].trim()] : '']),
  ]);
}

function printRawTwigAssignment(markup: string): Doc | null {
  const assignment = splitTopLevelAssignment(markup);
  if (!assignment) return null;

  const ternaryValue = printRawTwigTernary(assignment.right);
  if (ternaryValue) {
    return group([assignment.left, ' =', indent([line, ternaryValue])]);
  }

  const coalescingValue = printRawTwigCoalescingChain(assignment.right);
  if (coalescingValue) {
    return group([assignment.left, ' =', indent([line, coalescingValue])]);
  }

  const methodChainValue = printRawTwigMethodChainExpression(assignment.right);
  if (methodChainValue) {
    return group([assignment.left, ' = ', methodChainValue]);
  }

  const filterChainValue = printRawTwigFilterChainExpression(assignment.right);
  if (filterChainValue) {
    return group([assignment.left, ' = ', filterChainValue]);
  }

  return null;
}

function splitTopLevelAssignment(source: string) {
  const index = findTopLevelAssignmentOperator(source);
  if (index === null) return null;

  return {
    left: source.slice(0, index).trim(),
    right: source.slice(index + 1).trim(),
  };
}

function printRawTwigFilter(filter: string): Doc {
  const call = parseRawTwigFilterCall(filter);
  if (!call) return filter;

  const args = printRawTwigFilterArguments(call.args);
  if (!args) return filter;

  const hasArrowArgument = splitTopLevelOperator(call.args, '=>') !== null;
  return group([call.name, '(', args, hasArrowArgument ? softline : '', ')']);
}

function parseRawTwigFilterCall(filter: string) {
  const match = /^([A-Za-z_][\w-]*)\(([\s\S]*)\)$/.exec(filter.trim());
  if (!match) return null;

  return {
    name: match[1],
    args: match[2].trim(),
  };
}

function printRawTwigFilterArguments(args: string): Doc | null {
  if (args.trim() === '') return '';

  const arrow = splitTopLevelOperator(args, '=>');
  if (!arrow) {
    const positionalArgs = splitTwigTopLevelProperties(args);
    if (!positionalArgs) return null;

    if (positionalArgs.length === 1) {
      return printRawTwigArgument(positionalArgs[0]);
    }

    return group(join([',', line], positionalArgs.map(printRawTwigArgument)));
  }

  const body = printRawTwigExpression(arrow.right);
  if (!body) return null;

  return group([arrow.left, ' =>', indent([line, body])]);
}

function printRawTwigExpression(expression: string): Doc | null {
  return (
    printRawTwigElvisExpression(expression) ??
    printRawTwigTernary(expression) ??
    printRawTwigCoalescingChain(expression) ??
    printRawTwigParenthesizedExpression(expression) ??
    printRawTwigMethodChainExpression(expression) ??
    printRawTwigCallExpression(expression) ??
    printRawTwigFilterChainExpression(expression) ??
    printRawTwigArrayLiteral(expression) ??
    printRawTwigObjectLiteral(expression)
  );
}

function printRawTwigElvisExpression(expression: string): Doc | null {
  const elvis = splitTopLevelElvisOperator(expression);
  if (!elvis) return null;

  return group([elvis.left, ' ?: ', printRawTwigExpression(elvis.right) ?? elvis.right]);
}

function printRawTwigCoalescingChain(expression: string): Doc | null {
  const chain = splitRawTwigCoalescingChain(expression);
  if (!chain) return null;

  return group(
    join(
      line,
      chain.map((part, index) =>
        index < chain.length - 1
          ? [
              printRawTwigNonCoalescingExpression(part.expression) ?? part.expression,
              ' ',
              chain[index + 1].operator!,
            ]
          : printRawTwigNonCoalescingExpression(part.expression) ?? part.expression,
      ),
    ),
  );
}

function printRawTwigNonCoalescingExpression(expression: string): Doc | null {
  return (
    printRawTwigElvisExpression(expression) ??
    printRawTwigTernary(expression) ??
    printRawTwigParenthesizedExpression(expression) ??
    printRawTwigMethodChainExpression(expression) ??
    printRawTwigCallExpression(expression) ??
    printRawTwigFilterChainExpression(expression) ??
    printRawTwigArrayLiteral(expression) ??
    printRawTwigObjectLiteral(expression)
  );
}

function printRawTwigParenthesizedExpression(expression: string): Doc | null {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return null;

  const body = trimmed.slice(1, -1).trim();
  if (!body) return '()';

  return group(['(', printRawTwigNonParenthesizedExpression(body) ?? body, ')']);
}

function printRawTwigNonParenthesizedExpression(expression: string): Doc | null {
  return (
    printRawTwigElvisExpression(expression) ??
    printRawTwigTernary(expression) ??
    printRawTwigMethodChainExpression(expression) ??
    printRawTwigCallExpression(expression) ??
    printRawTwigFilterChainExpression(expression) ??
    printRawTwigArrayLiteral(expression) ??
    printRawTwigObjectLiteral(expression)
  );
}

function printRawTwigFilterChainExpression(
  expression: string,
  { indentFilters = true } = {},
): Doc | null {
  const filterChain = splitTwigFilterChain(expression);
  if (!filterChain) return null;

  const [baseExpression, ...filters] = filterChain;
  const printedFilters = [
    softline,
    join(
      softline,
      filters.map((filter) => ['|', printRawTwigFilter(filter)]),
    ),
  ];

  return group([
    printRawTwigNonTernaryExpression(baseExpression) ?? baseExpression,
    indentFilters ? indent(printedFilters) : printedFilters,
  ]);
}

function printRawTwigArrayLiteral(expression: string): Doc | null {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;

  const body = trimmed.slice(1, -1);
  if (body.trim() === '') return '[]';

  const items = splitTwigTopLevelProperties(body);
  if (!items) return null;

  return group([
    '[',
    indent([
      softline,
      join(
        [',', line],
        items.map((item) => printRawTwigExpression(item) ?? item.trim()),
      ),
      ifBreak(','),
    ]),
    softline,
    ']',
  ]);
}

function printRawTwigMethodChainExpression(expression: string): Doc | null {
  const chain = splitRawTwigMethodChain(expression);
  if (!chain) return null;

  return group([chain.base, indent([softline, join(softline, chain.calls)])]);
}

function printRawTwigCallExpression(expression: string): Doc | null {
  const call = parseRawTwigFilterCall(expression);
  if (!call) return null;

  const args = splitTwigTopLevelProperties(call.args);
  if (!args) return null;

  return group([
    call.name,
    '(',
    indent([softline, join([',', line], args.map(printRawTwigArgument))]),
    softline,
    ')',
  ]);
}

function printRawTwigArgument(argument: string): Doc {
  return printRawTwigExpression(argument) ?? argument.trim();
}

function printRawTwigObjectLiteral(expression: string, { shouldBreak = false } = {}): Doc | null {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const properties = splitTwigTopLevelProperties(trimmed.slice(1, -1));
  if (!properties) return null;

  return group(
    [
      '{',
      indent([
        line,
        join(
          [',', line],
          properties.map((property) => printRawTwigObjectProperty(property)),
        ),
        ifBreak(','),
      ]),
      line,
      '}',
    ],
    { shouldBreak },
  );
}

function printRawTwigObjectProperty(property: string): Doc {
  const splitProperty = splitTwigObjectProperty(property);
  if (!splitProperty) return property.trim();

  const ternaryValue = printRawTwigTernary(splitProperty.value);
  if (ternaryValue) {
    return [splitProperty.key, ':', indent([line, ternaryValue])];
  }

  return [
    splitProperty.key,
    ': ',
    printRawTwigExpression(splitProperty.value) ?? splitProperty.value,
  ];
}

function printRawTwigTernary(expression: string): Doc | null {
  const chain = collectRawTwigTernaryChain(expression);
  if (!chain) return null;

  const [firstCase, ...restCases] = chain.cases;
  const restLines: Doc[] = [
    ...restCases.map((ternaryCase) => [
      ternaryCase.condition,
      ' ? ',
      printRawTwigNonTernaryExpression(ternaryCase.consequent) ?? ternaryCase.consequent,
      ' :',
    ]),
    printRawTwigNonTernaryExpression(chain.fallback) ?? chain.fallback,
  ];

  return group([
    firstCase.condition,
    ' ? ',
    printRawTwigNonTernaryExpression(firstCase.consequent) ?? firstCase.consequent,
    ' :',
    line,
    join(line, restLines),
  ]);
}

function printRawTwigNonTernaryExpression(expression: string): Doc | null {
  return (
    printRawTwigCallExpression(expression) ??
    printRawTwigFilterChainExpression(expression) ??
    printRawTwigArrayLiteral(expression) ??
    printRawTwigObjectLiteral(expression)
  );
}

function collectRawTwigTernaryChain(expression: string) {
  const cases: { condition: string; consequent: string }[] = [];
  let current = expression;

  while (true) {
    const ternary = splitTopLevelTernary(current);
    if (!ternary) {
      if (cases.length === 0) return null;
      return {
        cases,
        fallback: current.trim(),
      };
    }

    cases.push({
      condition: ternary.condition,
      consequent: ternary.consequent,
    });
    current = ternary.alternate;
  }
}

function splitTopLevelOperator(source: string, operator: string) {
  const index = findTopLevelOperator(source, operator);
  if (index === null) return null;

  return {
    left: source.slice(0, index).trim(),
    right: source.slice(index + operator.length).trim(),
  };
}

function splitTopLevelTernary(source: string) {
  const questionIndex = findTopLevelOperator(source, '?');
  if (questionIndex === null) return null;

  const colonIndex = findMatchingTernaryColon(source, questionIndex + 1);
  if (colonIndex === null) return null;

  return {
    condition: source.slice(0, questionIndex).trim(),
    consequent: source.slice(questionIndex + 1, colonIndex).trim(),
    alternate: source.slice(colonIndex + 1).trim(),
  };
}

function splitTopLevelElvisOperator(source: string) {
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
    } else if (nestingLevel === 0 && char === '?') {
      let colonIndex = i + 1;
      while (/\s/.test(source[colonIndex] ?? '')) colonIndex += 1;
      if (source[colonIndex] === ':') {
        return {
          left: source.slice(0, i).trim(),
          right: source.slice(colonIndex + 1).trim(),
        };
      }
    }
  }

  return null;
}

function findMatchingTernaryColon(source: string, start: number): number | null {
  let ternaryDepth = 0;
  let nestingLevel = 0;
  let quote: '"' | "'" | null = null;
  let isEscaped = false;

  for (let i = start; i < source.length; i++) {
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
    } else if (nestingLevel === 0 && char === '?') {
      ternaryDepth += 1;
    } else if (nestingLevel === 0 && char === ':') {
      if (ternaryDepth === 0) return i;
      ternaryDepth -= 1;
    }
  }

  return null;
}

function findTopLevelAssignmentOperator(source: string): number | null {
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
      nestingLevel === 0 &&
      char === '=' &&
      !['=', '!', '<', '>'].includes(source[i - 1]) &&
      source[i + 1] !== '=' &&
      source[i + 1] !== '>'
    ) {
      return i;
    }
  }

  return null;
}

function splitRawTwigMethodChain(source: string) {
  if (splitTwigFilterChain(source) || splitTopLevelOperator(source, '=>')) {
    return null;
  }

  const calls: string[] = [];
  let firstCallStart: number | null = null;
  let startOfPreviousCallEnd = 0;
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
    } else if (nestingLevel === 0 && char === '.' && /^[A-Za-z_]/.test(source[i + 1] ?? '')) {
      const callEnd = readRawTwigMethodCall(source, i);
      if (callEnd === null) continue;

      if (firstCallStart === null) {
        firstCallStart = i;
      } else if (source.slice(startOfPreviousCallEnd, i).trim() !== '') {
        return null;
      }

      calls.push(source.slice(i, callEnd).trim());
      startOfPreviousCallEnd = callEnd;
      i = callEnd - 1;
    }
  }

  if (firstCallStart === null || calls.length === 0) return null;
  if (source.slice(startOfPreviousCallEnd).trim() !== '') return null;

  const base = source.slice(0, firstCallStart).trim();
  if (!base) return null;

  return {
    base,
    calls,
  };
}

function readRawTwigMethodCall(source: string, start: number): number | null {
  const match = source.slice(start).match(/^\.[A-Za-z_][\w-]*/);
  if (!match) return null;

  let i = start + match[0].length;
  while (/\s/.test(source[i] ?? '')) i += 1;
  if (source[i] !== '(') return null;

  let nestingLevel = 0;
  let quote: '"' | "'" | null = null;
  let isEscaped = false;

  for (; i < source.length; i++) {
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
    } else if (char === '(') {
      nestingLevel += 1;
    } else if (char === ')') {
      nestingLevel -= 1;
      if (nestingLevel === 0) return i + 1;
    }
  }

  return null;
}

function splitRawTwigCoalescingChain(source: string) {
  const parts: { expression: string; operator?: '??' | '???' }[] = [];
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
    } else if (nestingLevel === 0 && source.startsWith('???', i)) {
      parts.push({ expression: source.slice(start, i).trim() });
      start = i + 3;
      i += 2;
    } else if (nestingLevel === 0 && source.startsWith('??', i)) {
      parts.push({ expression: source.slice(start, i).trim() });
      start = i + 2;
      i += 1;
    }
  }

  if (parts.length === 0) return null;

  const operators = collectTopLevelCoalescingOperators(source);
  const lastExpression = source.slice(start).trim();
  if (!lastExpression || operators.length !== parts.length) return null;

  parts.push({ expression: lastExpression });
  return parts.map((part, index) =>
    index === 0 ? part : { ...part, operator: operators[index - 1] },
  );
}

function collectTopLevelCoalescingOperators(source: string): ('??' | '???')[] {
  const operators: ('??' | '???')[] = [];
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
    } else if (nestingLevel === 0 && source.startsWith('???', i)) {
      operators.push('???');
      i += 2;
    } else if (nestingLevel === 0 && source.startsWith('??', i)) {
      operators.push('??');
      i += 1;
    }
  }

  return operators;
}

function findTopLevelOperator(source: string, operator: string): number | null {
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
    } else if (nestingLevel === 0 && source.startsWith(operator, i)) {
      return i;
    }
  }

  return null;
}

export function printLiquidBlockEnd(
  path: AstPath<LiquidTag>,
  _options: LiquidParserOptions,
  _print: LiquidPrinter,
  args: LiquidPrinterArgs = {},
): Doc {
  const node = path.getValue();
  const { isLiquidStatement, leadingSpaceGroupId, trailingSpaceGroupId } = args;
  if (!node.children || !node.blockEndPosition) return '';
  if (isLiquidStatement) {
    return ['end', node.name];
  }
  const whitespaceStart = getWhitespaceTrim(
    node.delimiterWhitespaceStart ?? '',
    needsBlockEndLeadingWhitespaceStrippingOnBreak(node),
    leadingSpaceGroupId,
  );
  const whitespaceEnd = getWhitespaceTrim(
    node.delimiterWhitespaceEnd ?? '',
    hasMeaningfulLackOfTrailingWhitespace(node),
    trailingSpaceGroupId,
  );
  return group(['{%', whitespaceStart, ` end${node.name} `, whitespaceEnd, '%}']);
}

function getNodeContent(node: LiquidTag) {
  if (!node.children || !node.blockEndPosition) return '';
  return node.source.slice(node.blockStartPosition.end, node.blockEndPosition.start);
}

export function printLiquidTag(
  path: AstPath<LiquidTag>,
  options: LiquidParserOptions,
  print: LiquidPrinter,
  args: LiquidPrinterArgs,
): Doc {
  const { leadingSpaceGroupId, trailingSpaceGroupId } = args;
  const node = path.getValue();
  if (!node.children || !node.blockEndPosition) {
    return printLiquidBlockStart(path, options, print, args);
  }

  if (!args.isLiquidStatement && shouldPreserveContent(node)) {
    return [
      printLiquidBlockStart(path, options, print, {
        ...args,
        leadingSpaceGroupId,
        trailingSpaceGroupId: FORCE_FLAT_GROUP_ID,
      }),
      ...replaceEndOfLine(getNodeContent(node)),
      printLiquidBlockEnd(path, options, print, {
        ...args,
        leadingSpaceGroupId: FORCE_FLAT_GROUP_ID,
        trailingSpaceGroupId,
      }),
    ];
  }

  const tagGroupId = Symbol('tag-group');
  const blockStart = printLiquidBlockStart(path, options, print, {
    ...args,
    leadingSpaceGroupId,
    trailingSpaceGroupId: tagGroupId,
  }); // {% if ... %}
  const blockEnd = printLiquidBlockEnd(path, options, print, {
    ...args,
    leadingSpaceGroupId: tagGroupId,
    trailingSpaceGroupId,
  }); // {% endif %}

  let body: Doc = [];

  if (isBranchedTag(node)) {
    body = cleanDoc(
      path.map(
        (p) =>
          print(p, {
            ...args,
            leadingSpaceGroupId: tagGroupId,
            trailingSpaceGroupId: tagGroupId,
          }),
        'children',
      ),
    );
    if (node.name === 'switch') body = indent(body);
  } else if (node.children.length > 0) {
    body = indent([
      innerLeadingWhitespace(node),
      printChildren(path, options, print, {
        ...args,
        leadingSpaceGroupId: tagGroupId,
        trailingSpaceGroupId: tagGroupId,
      }),
    ]);
  }

  return group([blockStart, body, innerTrailingWhitespace(node, args), blockEnd], {
    id: tagGroupId,
    shouldBreak:
      LIQUID_TAGS_THAT_ALWAYS_BREAK.includes(node.name) ||
      originallyHadLineBreaks(path, options) ||
      isAttributeNode(node) ||
      isDeeplyNested(node),
  });
}

export function printLiquidRawTag(
  path: AstPath<LiquidRawTag>,
  options: LiquidParserOptions,
  print: LiquidPrinter,
  { isLiquidStatement }: LiquidPrinterArgs,
): Doc {
  let body: Doc = [];
  const node = path.getValue();
  const hasEmptyBody = node.body.value.trim() === '';
  const shouldNotIndentBody = node.name === 'schema' && !options.indentSchema;
  const shouldPrintAsIs =
    node.isIndentationSensitive ||
    !hasLineBreakInRange(node.source, node.body.position.start, node.body.position.end);
  const blockStart = isLiquidStatement
    ? [node.name]
    : group([
        '{%',
        node.whitespaceStart,
        ' ',
        node.name,
        ' ',
        node.markup ? `${node.markup} ` : '',
        node.whitespaceEnd,
        '%}',
      ]);
  const blockEnd = isLiquidStatement
    ? ['end', node.name]
    : ['{%', node.whitespaceStart, ' ', 'end', node.name, ' ', node.whitespaceEnd, '%}'];

  if (shouldPrintAsIs) {
    body = [node.source.slice(node.blockStartPosition.end, node.blockEndPosition.start)];
  } else if (hasEmptyBody) {
    body = [hardline];
  } else if (shouldNotIndentBody) {
    body = [hardline, path.call(print, 'body'), hardline];
  } else {
    body = [indent([hardline, path.call(print, 'body')]), hardline];
  }

  return [blockStart, ...body, blockEnd];
}

function innerLeadingWhitespace(node: LiquidTag | LiquidBranch) {
  if (!node.firstChild) {
    if (node.isDanglingWhitespaceSensitive && node.hasDanglingWhitespace) {
      return line;
    } else {
      return '';
    }
  }

  if (node.firstChild.hasLeadingWhitespace && node.firstChild.isLeadingWhitespaceSensitive) {
    return line;
  }

  return softline;
}

function innerTrailingWhitespace(node: LiquidTag | LiquidBranch, args: LiquidPrinterArgs) {
  if (
    (!args.isLiquidStatement && shouldPreserveContent(node)) ||
    node.type === NodeTypes.LiquidBranch ||
    !node.blockEndPosition ||
    !node.lastChild
  ) {
    return '';
  }

  if (node.lastChild.hasTrailingWhitespace && node.lastChild.isTrailingWhitespaceSensitive) {
    return line;
  }

  return softline;
}

function printLiquidDefaultBranch(
  path: AstPath<LiquidBranch>,
  options: LiquidParserOptions,
  print: LiquidPrinter,
  args: LiquidPrinterArgs,
): Doc {
  const branch = path.getValue();
  const parentNode: LiquidTag = path.getParentNode() as any;

  // When the node is empty and the parent is empty. The space will come
  // from the trailingWhitespace of the parent. When this happens, we don't
  // want the branch to print another one so we collapse it.
  // e.g. {% if A %} {% endif %}
  const shouldCollapseSpace = isEmpty(branch.children) && parentNode.children!.length === 1;
  if (shouldCollapseSpace) return '';

  // When the branch is empty and doesn't have whitespace, we don't want
  // anything so print nothing.
  // e.g. {% if A %}{% endif %}
  // e.g. {% if A %}{% else %}...{% endif %}
  const isBranchEmptyWithoutSpace = isEmpty(branch.children) && !branch.hasDanglingWhitespace;
  if (isBranchEmptyWithoutSpace) return '';

  // If the branch does not break, is empty and had whitespace, we might
  // want a space in there. We don't collapse those because the trailing
  // whitespace does not come from the parent.
  // {% if A %} {% else %}...{% endif %}
  if (branch.hasDanglingWhitespace) {
    return ifBreak('', ' ');
  }

  const shouldAddTrailingNewline =
    branch.next &&
    branch.children.length > 0 &&
    branch.source
      .slice(last(branch.children).position.end, branch.next.position.start)
      .replace(/ |\t/g, '').length >= 2;

  // Otherwise print the branch as usual
  // {% if A %} content...{% endif %}
  return indent([
    innerLeadingWhitespace(parentNode),
    printChildren(path, options, print, args),
    shouldAddTrailingNewline ? literalline : '',
  ]);
}

export function printLiquidBranch(
  path: AstPath<LiquidBranch>,
  options: LiquidParserOptions,
  print: LiquidPrinter,
  args: LiquidPrinterArgs,
): Doc {
  const branch = path.getValue();
  const isDefaultBranch = !branch.name;

  if (isDefaultBranch) {
    return printLiquidDefaultBranch(path, options, print, args);
  }

  const leftSibling = branch.prev as LiquidBranch | undefined;

  // When the left sibling is empty, its trailing whitespace is its leading
  // whitespace. So we should collapse it here and ignore it.
  const shouldCollapseSpace = leftSibling && isEmpty(leftSibling.children);
  const outerLeadingWhitespace =
    branch.hasLeadingWhitespace && !shouldCollapseSpace ? line : softline;
  const shouldAddTrailingNewline =
    branch.next &&
    branch.children.length > 0 &&
    branch.source
      .slice(last(branch.children).position.end, branch.next.position.start)
      .replace(/ |\t/g, '').length >= 2;

  return [
    outerLeadingWhitespace,
    printLiquidBlockStart(path as AstPath<LiquidBranch>, options, print, args),
    indent([
      innerLeadingWhitespace(branch),
      printChildren(path, options, print, args),
      shouldAddTrailingNewline ? literalline : '',
    ]),
  ];
}

function needsBlockStartLeadingWhitespaceStrippingOnBreak(node: LiquidTag | LiquidBranch): boolean {
  switch (node.type) {
    case NodeTypes.LiquidTag: {
      return !isAttributeNode(node) && hasMeaningfulLackOfLeadingWhitespace(node);
    }
    case NodeTypes.LiquidBranch: {
      return (
        !isAttributeNode(node.parentNode! as LiquidTag) &&
        hasMeaningfulLackOfLeadingWhitespace(node)
      );
    }
    default: {
      return assertNever(node);
    }
  }
}

function needsBlockStartTrailingWhitespaceStrippingOnBreak(
  node: LiquidTag | LiquidBranch,
): boolean {
  switch (node.type) {
    case NodeTypes.LiquidTag: {
      if (isBranchedTag(node)) {
        return needsBlockStartLeadingWhitespaceStrippingOnBreak(node.firstChild! as LiquidBranch);
      }

      if (!node.children) {
        return hasMeaningfulLackOfTrailingWhitespace(node);
      }

      return isEmpty(node.children)
        ? hasMeaningfulLackOfDanglingWhitespace(node)
        : hasMeaningfulLackOfLeadingWhitespace(node.firstChild!);
    }

    case NodeTypes.LiquidBranch: {
      if (isAttributeNode(node.parentNode! as LiquidTag)) {
        return false;
      }

      return node.firstChild
        ? hasMeaningfulLackOfLeadingWhitespace(node.firstChild)
        : hasMeaningfulLackOfDanglingWhitespace(node);
    }

    default: {
      return assertNever(node);
    }
  }
}

function needsBlockEndLeadingWhitespaceStrippingOnBreak(node: LiquidTag) {
  if (!node.children) {
    throw new Error(
      'Should only call needsBlockEndLeadingWhitespaceStrippingOnBreak for tags that have closing tags',
    );
  } else if (isAttributeNode(node)) {
    return false;
  } else if (isBranchedTag(node)) {
    return hasMeaningfulLackOfTrailingWhitespace(node.lastChild!);
  } else if (isEmpty(node.children)) {
    return hasMeaningfulLackOfDanglingWhitespace(node);
  } else {
    return hasMeaningfulLackOfTrailingWhitespace(node.lastChild!);
  }
}

function cleanDoc(doc: Doc[]): Doc[] {
  return doc.filter((x) => x !== '');
}

function getSchema(contents: string, options: LiquidParserOptions) {
  try {
    return [JSON.stringify(JSON.parse(contents), null, options.tabWidth), true];
  } catch (e) {
    return [contents, false];
  }
}

function getSpaceBetweenLines(prev: LiquidStatement | null, curr: LiquidStatement): Doc {
  if (!prev) return '';
  const source = curr.source;
  const whitespaceBetweenNodes = source.slice(prev.position.end, curr.position.start);
  const hasMoreThanOneNewLine = (whitespaceBetweenNodes.match(/\n/g) || []).length > 1;
  return hasMoreThanOneNewLine ? hardline : '';
}
