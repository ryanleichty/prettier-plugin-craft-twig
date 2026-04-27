/**
 * This is the first stage of the parser.
 *
 * Input:
 *   Source code: string
 *
 * Output:
 *   Concrete Syntax Tree (CST): CraftTwigCST
 *
 * We use OhmJS's toAST method to turn the OhmJS nodes into an "almost-AST." We
 * call that a Concrete Syntax Tree because it considers Open and Close nodes as
 * separate nodes.
 *
 * It is mostly "flat."
 *
 * e.g.
 * {% if cond %}hi <em>there!</em>{% endif %}
 *
 * becomes
 * - TwigTagOpen/if
 *   condition: TwigVariableExpression/cond
 * - TextNode/"hi "
 * - HtmlTagOpen/em
 * - TextNode/"there!"
 * - HtmlTagClose/em
 * - TwigTagClose/if
 *
 * In the Concrete Syntax Tree, all nodes are siblings instead of having a
 * parent/children relationship.
 *
 */

import { Parser } from 'prettier';
import ohm, { Node } from 'ohm-js';
import { toAST } from 'ohm-js/extras';
import {
  TwigGrammars,
  placeholderGrammars,
  strictGrammars,
  tolerantGrammars,
} from '~/parser/grammar';
import { CraftTwigCSTParsingError } from '~/parser/errors';
import { Comparators, NamedTags } from '~/types';

export enum ConcreteNodeTypes {
  HtmlDoctype = 'HtmlDoctype',
  HtmlComment = 'HtmlComment',
  HtmlRawTag = 'HtmlRawTag',
  HtmlVoidElement = 'HtmlVoidElement',
  HtmlSelfClosingElement = 'HtmlSelfClosingElement',
  HtmlTagOpen = 'HtmlTagOpen',
  HtmlTagClose = 'HtmlTagClose',
  AttrSingleQuoted = 'AttrSingleQuoted',
  AttrDoubleQuoted = 'AttrDoubleQuoted',
  AttrUnquoted = 'AttrUnquoted',
  AttrEmpty = 'AttrEmpty',
  TwigDrop = 'TwigDrop',
  TwigRawTag = 'TwigRawTag',
  TwigTag = 'TwigTag',
  TwigTagOpen = 'TwigTagOpen',
  TwigTagClose = 'TwigTagClose',
  TwigCommentOpen = 'TwigCommentOpen',
  TwigCommentClose = 'TwigCommentClose',
  TextNode = 'TextNode',
  YAMLFrontmatter = 'YAMLFrontmatter',

  TwigVariable = 'TwigVariable',
  TwigFilter = 'TwigFilter',
  NamedArgument = 'NamedArgument',
  TwigLiteral = 'TwigLiteral',
  VariableLookup = 'VariableLookup',
  String = 'String',
  Number = 'Number',
  Range = 'Range',
  Comparison = 'Comparison',
  Condition = 'Condition',

  AssignMarkup = 'AssignMarkup',
  CycleMarkup = 'CycleMarkup',
  ForMarkup = 'ForMarkup',
  RenderMarkup = 'RenderMarkup',
  PaginateMarkup = 'PaginateMarkup',
  RenderVariableExpression = 'RenderVariableExpression',
}

export const TwigLiteralValues = {
  nil: null,
  null: null,
  true: true as true,
  false: false as false,
  blank: '' as '',
  empty: '' as '',
};

export interface Parsers {
  [astFormat: string]: Parser;
}

export interface ConcreteBasicNode<T> {
  type: T;
  source: string;
  locStart: number;
  locEnd: number;
}

export interface ConcreteHtmlNodeBase<T> extends ConcreteBasicNode<T> {
  attrList?: ConcreteAttributeNode[];
}

export interface ConcreteHtmlDoctype extends ConcreteBasicNode<ConcreteNodeTypes.HtmlDoctype> {
  legacyDoctypeString: string | null;
}

export interface ConcreteHtmlComment extends ConcreteBasicNode<ConcreteNodeTypes.HtmlComment> {
  body: string;
}

export interface ConcreteHtmlRawTag extends ConcreteHtmlNodeBase<ConcreteNodeTypes.HtmlRawTag> {
  name: string;
  body: string;
  blockStartLocStart: number;
  blockStartLocEnd: number;
  blockEndLocStart: number;
  blockEndLocEnd: number;
}
export interface ConcreteHtmlVoidElement extends ConcreteHtmlNodeBase<ConcreteNodeTypes.HtmlVoidElement> {
  name: string;
}
export interface ConcreteHtmlSelfClosingElement extends ConcreteHtmlNodeBase<ConcreteNodeTypes.HtmlSelfClosingElement> {
  name: (ConcreteTextNode | ConcreteTwigDrop)[];
}
export interface ConcreteHtmlTagOpen extends ConcreteHtmlNodeBase<ConcreteNodeTypes.HtmlTagOpen> {
  name: (ConcreteTextNode | ConcreteTwigDrop)[];
}
export interface ConcreteHtmlTagClose extends ConcreteHtmlNodeBase<ConcreteNodeTypes.HtmlTagClose> {
  name: (ConcreteTextNode | ConcreteTwigDrop)[];
}

export interface ConcreteAttributeNodeBase<T> extends ConcreteBasicNode<T> {
  name: (ConcreteTwigDrop | ConcreteTextNode)[];
  value: (ConcreteTwigNode | ConcreteTextNode)[];
}

export type ConcreteAttributeNode =
  | ConcreteTwigNode
  | ConcreteAttrSingleQuoted
  | ConcreteAttrDoubleQuoted
  | ConcreteAttrUnquoted
  | ConcreteAttrEmpty;

export interface ConcreteAttrSingleQuoted extends ConcreteAttributeNodeBase<ConcreteNodeTypes.AttrSingleQuoted> {}
export interface ConcreteAttrDoubleQuoted extends ConcreteAttributeNodeBase<ConcreteNodeTypes.AttrDoubleQuoted> {}
export interface ConcreteAttrUnquoted extends ConcreteAttributeNodeBase<ConcreteNodeTypes.AttrUnquoted> {}
export interface ConcreteAttrEmpty extends ConcreteBasicNode<ConcreteNodeTypes.AttrEmpty> {
  name: (ConcreteTwigDrop | ConcreteTextNode)[];
}

export type ConcreteTwigNode =
  | ConcreteTwigRawTag
  | ConcreteTwigTagOpen
  | ConcreteTwigTagClose
  | ConcreteTwigTag
  | ConcreteTwigDrop;

interface ConcreteBasicTwigNode<T> extends ConcreteBasicNode<T> {
  whitespaceStart: null | '-';
  whitespaceEnd: null | '-';
}

export interface ConcreteTwigRawTag extends ConcreteBasicTwigNode<ConcreteNodeTypes.TwigRawTag> {
  name: string;
  body: string;
  markup: string;
  delimiterWhitespaceStart: null | '-';
  delimiterWhitespaceEnd: null | '-';
  blockStartLocStart: number;
  blockStartLocEnd: number;
  blockEndLocStart: number;
  blockEndLocEnd: number;
}

export type ConcreteTwigTagOpen = ConcreteTwigTagOpenBaseCase | ConcreteTwigTagOpenNamed;
export type ConcreteTwigTagOpenNamed =
  | ConcreteTwigTagOpenCapture
  | ConcreteTwigTagOpenSet
  | ConcreteTwigTagOpenIf
  | ConcreteTwigTagOpenUnless
  | ConcreteTwigTagOpenForm
  | ConcreteTwigTagOpenFor
  | ConcreteTwigTagOpenPaginate
  | ConcreteTwigTagOpenSwitch
  | ConcreteTwigTagOpenTablerow;

export interface ConcreteTwigTagOpenNode<
  Name,
  Markup,
> extends ConcreteBasicTwigNode<ConcreteNodeTypes.TwigTagOpen> {
  name: Name;
  markup: Markup;
}

export interface ConcreteTwigTagOpenBaseCase extends ConcreteTwigTagOpenNode<string, string> {}

export interface ConcreteTwigTagOpenCapture extends ConcreteTwigTagOpenNode<
  NamedTags.capture,
  ConcreteTwigVariableLookup
> {}
export interface ConcreteTwigTagOpenSet extends ConcreteTwigTagOpenNode<
  NamedTags.set,
  ConcreteTwigVariableLookup
> {}

export interface ConcreteTwigTagOpenSwitch extends ConcreteTwigTagOpenNode<
  NamedTags.switch,
  ConcreteTwigExpression
> {}
export interface ConcreteTwigTagCase extends ConcreteTwigTagNode<
  NamedTags.case,
  ConcreteTwigExpression
> {}

export interface ConcreteTwigTagOpenIf extends ConcreteTwigTagOpenNode<
  NamedTags.if,
  ConcreteTwigCondition[]
> {}
export interface ConcreteTwigTagOpenUnless extends ConcreteTwigTagOpenNode<
  NamedTags.unless,
  ConcreteTwigCondition[]
> {}
export interface ConcreteTwigTagElseif extends ConcreteTwigTagNode<
  NamedTags.elseif,
  ConcreteTwigCondition[]
> {}
export interface ConcreteTwigTagElsif extends ConcreteTwigTagNode<
  NamedTags.elsif,
  ConcreteTwigCondition[]
> {}

export interface ConcreteTwigCondition extends ConcreteBasicNode<ConcreteNodeTypes.Condition> {
  relation: 'and' | 'or' | null;
  expression: ConcreteTwigComparison | ConcreteTwigExpression;
}

export interface ConcreteTwigComparison extends ConcreteBasicNode<ConcreteNodeTypes.Comparison> {
  comparator: Comparators;
  left: ConcreteTwigExpression;
  right: ConcreteTwigExpression;
}

export interface ConcreteTwigTagOpenForm extends ConcreteTwigTagOpenNode<
  NamedTags.form,
  ConcreteTwigArgument[]
> {}

export interface ConcreteTwigTagOpenFor extends ConcreteTwigTagOpenNode<
  NamedTags.for,
  ConcreteTwigTagForMarkup
> {}
export interface ConcreteTwigTagForMarkup extends ConcreteBasicNode<ConcreteNodeTypes.ForMarkup> {
  variableName: string;
  collection: ConcreteTwigExpression;
  reversed: 'reversed' | null;
  args: ConcreteTwigNamedArgument[];
}

export interface ConcreteTwigTagOpenTablerow extends ConcreteTwigTagOpenNode<
  NamedTags.tablerow,
  ConcreteTwigTagForMarkup
> {}

export interface ConcreteTwigTagOpenPaginate extends ConcreteTwigTagOpenNode<
  NamedTags.paginate,
  ConcretePaginateMarkup
> {}

export interface ConcretePaginateMarkup extends ConcreteBasicNode<ConcreteNodeTypes.PaginateMarkup> {
  collection: ConcreteTwigExpression;
  pageSize: ConcreteTwigExpression;
  args: ConcreteTwigNamedArgument[] | null;
}

export interface ConcreteTwigTagClose extends ConcreteBasicTwigNode<ConcreteNodeTypes.TwigTagClose> {
  name: string;
}

export type ConcreteTwigTag = ConcreteTwigTagNamed | ConcreteTwigTagBaseCase;
export type ConcreteTwigTagNamed =
  | ConcreteTwigTagAssign
  | ConcreteTwigTagCase
  | ConcreteTwigTagCycle
  | ConcreteTwigTagEcho
  | ConcreteTwigTagIncrement
  | ConcreteTwigTagDecrement
  | ConcreteTwigTagElseif
  | ConcreteTwigTagElsif
  | ConcreteTwigTagInclude
  | ConcreteTwigTagLayout
  | ConcreteTwigTagTwig
  | ConcreteTwigTagRender
  | ConcreteTwigTagSection
  | ConcreteTwigTagSections;

export interface ConcreteTwigTagNode<
  Name,
  Markup,
> extends ConcreteBasicTwigNode<ConcreteNodeTypes.TwigTag> {
  markup: Markup;
  name: Name;
}

export interface ConcreteTwigTagBaseCase extends ConcreteTwigTagNode<string, string> {}
export interface ConcreteTwigTagEcho extends ConcreteTwigTagNode<
  NamedTags.echo,
  ConcreteTwigVariable
> {}
export interface ConcreteTwigTagIncrement extends ConcreteTwigTagNode<
  NamedTags.increment,
  ConcreteTwigVariableLookup
> {}
export interface ConcreteTwigTagDecrement extends ConcreteTwigTagNode<
  NamedTags.decrement,
  ConcreteTwigVariableLookup
> {}
export interface ConcreteTwigTagSection extends ConcreteTwigTagNode<
  NamedTags.section,
  ConcreteStringLiteral
> {}
export interface ConcreteTwigTagSections extends ConcreteTwigTagNode<
  NamedTags.sections,
  ConcreteStringLiteral
> {}
export interface ConcreteTwigTagLayout extends ConcreteTwigTagNode<
  NamedTags.layout,
  ConcreteTwigExpression
> {}

export interface ConcreteTwigTagTwig extends ConcreteTwigTagNode<
  NamedTags.twig,
  ConcreteTwigTwigTagNode[]
> {}
export type ConcreteTwigTwigTagNode =
  | ConcreteTwigTagOpen
  | ConcreteTwigTagClose
  | ConcreteTwigTag
  | ConcreteTwigRawTag;

export interface ConcreteTwigTagAssign extends ConcreteTwigTagNode<
  NamedTags.assign,
  ConcreteTwigTagAssignMarkup
> {}
export interface ConcreteTwigTagAssignMarkup extends ConcreteBasicNode<ConcreteNodeTypes.AssignMarkup> {
  name: string;
  value: ConcreteTwigVariable;
}

export interface ConcreteTwigTagCycle extends ConcreteTwigTagNode<
  NamedTags.cycle,
  ConcreteTwigTagCycleMarkup
> {}
export interface ConcreteTwigTagCycleMarkup extends ConcreteBasicNode<ConcreteNodeTypes.CycleMarkup> {
  groupName: ConcreteTwigExpression | null;
  args: ConcreteTwigExpression[];
}

export interface ConcreteTwigTagRender extends ConcreteTwigTagNode<
  NamedTags.render,
  ConcreteTwigTagRenderMarkup
> {}
export interface ConcreteTwigTagInclude extends ConcreteTwigTagNode<
  NamedTags.include,
  ConcreteTwigTagRenderMarkup
> {}

export interface ConcreteTwigTagRenderMarkup extends ConcreteBasicNode<ConcreteNodeTypes.RenderMarkup> {
  snippet: ConcreteStringLiteral | ConcreteTwigVariableLookup;
  alias: string | null;
  variable: ConcreteRenderVariableExpression | null;
  args: ConcreteTwigNamedArgument[];
}

export interface ConcreteRenderVariableExpression extends ConcreteBasicNode<ConcreteNodeTypes.RenderVariableExpression> {
  kind: 'for' | 'with';
  name: ConcreteTwigExpression;
}

export interface ConcreteTwigDrop extends ConcreteBasicTwigNode<ConcreteNodeTypes.TwigDrop> {
  markup: ConcreteTwigVariable | string;
}

// The variable is the name + filters, like shopify/twig.
export interface ConcreteTwigVariable extends ConcreteBasicNode<ConcreteNodeTypes.TwigVariable> {
  expression: ConcreteTwigExpression;
  filters: ConcreteTwigFilter[];
  rawSource: string;
}

export interface ConcreteTwigFilter extends ConcreteBasicNode<ConcreteNodeTypes.TwigFilter> {
  name: string;
  args: ConcreteTwigArgument[];
}

export type ConcreteTwigArgument = ConcreteTwigExpression | ConcreteTwigNamedArgument;

export interface ConcreteTwigNamedArgument extends ConcreteBasicNode<ConcreteNodeTypes.NamedArgument> {
  name: string;
  value: ConcreteTwigExpression;
}

export type ConcreteTwigExpression =
  | ConcreteStringLiteral
  | ConcreteNumberLiteral
  | ConcreteTwigLiteral
  | ConcreteTwigRange
  | ConcreteTwigVariableLookup;

export interface ConcreteStringLiteral extends ConcreteBasicNode<ConcreteNodeTypes.String> {
  value: string;
  single: boolean;
}

export interface ConcreteNumberLiteral extends ConcreteBasicNode<ConcreteNodeTypes.Number> {
  value: string; // float parsing is weird but supported
}

export interface ConcreteTwigLiteral extends ConcreteBasicNode<ConcreteNodeTypes.TwigLiteral> {
  keyword: keyof typeof TwigLiteralValues;
  value: (typeof TwigLiteralValues)[keyof typeof TwigLiteralValues];
}

export interface ConcreteTwigRange extends ConcreteBasicNode<ConcreteNodeTypes.Range> {
  start: ConcreteTwigExpression;
  end: ConcreteTwigExpression;
}

export interface ConcreteTwigVariableLookup extends ConcreteBasicNode<ConcreteNodeTypes.VariableLookup> {
  name: string | null;
  lookups: ConcreteTwigExpression[];
}

export type ConcreteHtmlNode =
  | ConcreteHtmlDoctype
  | ConcreteHtmlComment
  | ConcreteHtmlRawTag
  | ConcreteHtmlVoidElement
  | ConcreteHtmlSelfClosingElement
  | ConcreteHtmlTagOpen
  | ConcreteHtmlTagClose;

export interface ConcreteTextNode extends ConcreteBasicNode<ConcreteNodeTypes.TextNode> {
  value: string;
}

export interface ConcreteYamlFrontmatterNode extends ConcreteBasicNode<ConcreteNodeTypes.YAMLFrontmatter> {
  body: string;
}

export type CraftTwigConcreteNode =
  | ConcreteHtmlNode
  | ConcreteTwigNode
  | ConcreteTextNode
  | ConcreteYamlFrontmatterNode;

export type TwigConcreteNode = ConcreteTwigNode | ConcreteTextNode | ConcreteYamlFrontmatterNode;

export type CraftTwigCST = CraftTwigConcreteNode[];

export type TwigCST = TwigConcreteNode[];

interface Mapping {
  [k: string]: number | TemplateMapping | TopLevelFunctionMapping;
}

interface TemplateMapping {
  type: ConcreteNodeTypes;
  locStart: (node: Node[]) => number;
  locEnd: (node: Node[]) => number;
  source: string;
  [k: string]: FunctionMapping | string | number | boolean | object | null;
}

type TopLevelFunctionMapping = (...nodes: Node[]) => any;
type FunctionMapping = (nodes: Node[]) => any;

const markup = (i: number) => (tokens: Node[]) => tokens[i].sourceString.trim();
const markupTrimEnd = (i: number) => (tokens: Node[]) => tokens[i].sourceString.trimEnd();

export interface CSTBuildOptions {
  /**
   * 'strict' will disable the Twig parsing base cases. Which means that we will
   * throw an error if we can't parse the node `markup` properly.
   *
   * 'tolerant' is the default case so that prettier can pretty print nodes
   * that it doesn't understand.
   */
  mode: 'strict' | 'tolerant' | 'completion';
}

const Grammars: Record<CSTBuildOptions['mode'], TwigGrammars> = {
  strict: strictGrammars,
  tolerant: tolerantGrammars,
  completion: placeholderGrammars,
};

export function toCraftTwigCST(
  source: string,
  options: CSTBuildOptions = { mode: 'tolerant' },
): CraftTwigCST {
  const grammars = Grammars[options.mode];
  const grammar = grammars.CraftTwig;
  return toCST(source, grammars, grammar, ['HelperMappings', 'TwigMappings', 'CraftTwigMappings']);
}

export function toTwigCST(
  source: string,
  options: CSTBuildOptions = { mode: 'tolerant' },
): TwigCST {
  const grammars = Grammars[options.mode];
  const grammar = grammars.Twig;
  return toCST(source, grammars, grammar, ['HelperMappings', 'TwigMappings']);
}

function toCST<T>(
  source: string,
  grammars: TwigGrammars,
  grammar: ohm.Grammar,
  cstMappings: ('HelperMappings' | 'TwigMappings' | 'CraftTwigMappings')[],
): T {
  // When we switch parser, our locStart and locEnd functions must account
  // for the offset of the {% twig %} markup
  let twigStatementOffset = 0;
  const locStart = (tokens: Node[]) => twigStatementOffset + tokens[0].source.startIdx;
  const locEnd = (tokens: Node[]) => twigStatementOffset + tokens[tokens.length - 1].source.endIdx;
  const locEndSecondToLast = (tokens: Node[]) =>
    twigStatementOffset + tokens[tokens.length - 2].source.endIdx;

  const textNode = {
    type: ConcreteNodeTypes.TextNode,
    value: function () {
      return (this as any).sourceString;
    },
    locStart,
    locEnd,
    source,
  };

  const res = grammar.match(source, 'Node');
  if (res.failed()) {
    throw new CraftTwigCSTParsingError(res);
  }

  const HelperMappings: Mapping = {
    Node: 0,
    TextNode: textNode,
    orderedListOf: 0,

    listOf: 0,
    empty: () => null,
    emptyListOf: () => [],
    nonemptyListOf(first: any, _sep: any, rest: any) {
      const self = this as any;
      return [first.toAST(self.args.mapping)].concat(rest.toAST(self.args.mapping));
    },

    nonemptyOrderedListOf: 0,
    nonemptyOrderedListOfBoth(nonemptyListOfA: Node, _sep: Node, nonemptyListOfB: Node) {
      const self = this as any;
      return nonemptyListOfA
        .toAST(self.args.mapping)
        .concat(nonemptyListOfB.toAST(self.args.mapping));
    },
  };

  const TwigMappings: Mapping = {
    twigNode: 0,
    twigRawTag: 0,
    twigRawTagImpl: {
      type: ConcreteNodeTypes.TwigRawTag,
      name: 3,
      body: 9,
      markup: 6,
      whitespaceStart: 1,
      whitespaceEnd: 7,
      delimiterWhitespaceStart: 11,
      delimiterWhitespaceEnd: 17,
      locStart,
      locEnd,
      source,
      blockStartLocStart: (tokens: Node[]) => tokens[0].source.startIdx,
      blockStartLocEnd: (tokens: Node[]) => tokens[8].source.endIdx,
      blockEndLocStart: (tokens: Node[]) => tokens[10].source.startIdx,
      blockEndLocEnd: (tokens: Node[]) => tokens[18].source.endIdx,
    },
    twigBlockComment: {
      type: ConcreteNodeTypes.TwigRawTag,
      name: 'comment',
      body: (tokens: Node[]) => tokens[1].sourceString,
      whitespaceStart: (tokens: Node[]) => tokens[0].children[1].sourceString,
      whitespaceEnd: (tokens: Node[]) => tokens[0].children[7].sourceString,
      delimiterWhitespaceStart: (tokens: Node[]) => tokens[2].children[1].sourceString,
      delimiterWhitespaceEnd: (tokens: Node[]) => tokens[2].children[7].sourceString,
      locStart,
      locEnd,
      source,
      blockStartLocStart: (tokens: Node[]) => tokens[0].source.startIdx,
      blockStartLocEnd: (tokens: Node[]) => tokens[0].source.endIdx,
      blockEndLocStart: (tokens: Node[]) => tokens[2].source.startIdx,
      blockEndLocEnd: (tokens: Node[]) => tokens[2].source.endIdx,
    },
    twigInlineComment: {
      type: ConcreteNodeTypes.TwigTag,
      name: 'twig',
      markup: markupTrimEnd(3),
      whitespaceStart: 1,
      whitespaceEnd: 4,
      locStart,
      locEnd,
      source,
    },

    twigTagOpen: 0,
    twigTagOpenStrict: 0,
    twigTagOpenBaseCase: 0,
    twigTagOpenRule: {
      type: ConcreteNodeTypes.TwigTagOpen,
      name: 3,
      markup(nodes: Node[]) {
        const markupNode = nodes[6];
        const nameNode = nodes[3];
        if (NamedTags.hasOwnProperty(nameNode.sourceString)) {
          return markupNode.toAST((this as any).args.mapping);
        }
        return markupNode.sourceString.trim();
      },
      whitespaceStart: 1,
      whitespaceEnd: 7,
      locStart,
      locEnd,
      source,
    },

    twigTagOpenCapture: 0,
    twigTagOpenSet: 0,
    twigTagOpenForm: 0,
    twigTagOpenFormMarkup: 0,
    twigTagOpenFor: 0,
    twigTagOpenForMarkup: {
      type: ConcreteNodeTypes.ForMarkup,
      variableName: 0,
      collection: 4,
      reversed: 6,
      args: 8,
      locStart,
      locEnd,
      source,
    },
    twigTagBreak: 0,
    twigTagContinue: 0,
    twigTagOpenTablerow: 0,
    twigTagOpenPaginate: 0,
    twigTagOpenPaginateMarkup: {
      type: ConcreteNodeTypes.PaginateMarkup,
      collection: 0,
      pageSize: 4,
      args: 6,
      locStart,
      locEnd,
      source,
    },
    twigTagOpenSwitch: 0,
    twigTagOpenSwitchMarkup: 0,
    twigTagCase: 0,
    twigTagCaseMarkup: 0,
    twigTagDefault: 0,
    twigTagOpenIf: 0,
    twigTagOpenUnless: 0,
    twigTagElseif: 0,
    twigTagElsif: 0,
    twigTagElse: 0,
    twigTagOpenConditionalMarkup: 0,
    condition: {
      type: ConcreteNodeTypes.Condition,
      relation: 0,
      expression: 2,
      locStart,
      locEnd,
      source,
    },
    comparison: {
      type: ConcreteNodeTypes.Comparison,
      comparator: 2,
      left: 0,
      right: 4,
      locStart,
      locEnd,
      source,
    },

    twigTagClose: {
      type: ConcreteNodeTypes.TwigTagClose,
      name: 4,
      whitespaceStart: 1,
      whitespaceEnd: 7,
      locStart,
      locEnd,
      source,
    },

    twigTag: 0,
    twigTagStrict: 0,
    twigTagBaseCase: 0,
    twigTagAssign: 0,
    twigTagEcho: 0,
    twigTagCycle: 0,
    twigTagIncrement: 0,
    twigTagDecrement: 0,
    twigTagRender: 0,
    twigTagInclude: 0,
    twigTagSection: 0,
    twigTagSections: 0,
    twigTagLayout: 0,
    twigTagRule: {
      type: ConcreteNodeTypes.TwigTag,
      name: 3,
      markup(nodes: Node[]) {
        const markupNode = nodes[6];
        const nameNode = nodes[3];
        if (NamedTags.hasOwnProperty(nameNode.sourceString)) {
          return markupNode.toAST((this as any).args.mapping);
        }
        return markupNode.sourceString.trim();
      },
      whitespaceStart: 1,
      whitespaceEnd: 7,
      source,
      locStart,
      locEnd,
    },

    twigTagTwig: 0,
    twigTagTwigMarkup(tagMarkup: Node) {
      const res = grammars['TwigStatement'].match(tagMarkup.sourceString, 'Node');

      if (res.failed()) {
        throw new CraftTwigCSTParsingError(res);
      }

      // We're reparsing with a different startIdx
      twigStatementOffset = tagMarkup.source.startIdx;
      const subCST = toAST(res, {
        ...HelperMappings,
        ...TwigMappings,
        ...TwigStatement,
      });
      twigStatementOffset = 0;

      return subCST;
    },

    twigTagEchoMarkup: 0,
    twigTagSectionMarkup: 0,
    twigTagSectionsMarkup: 0,
    twigTagLayoutMarkup: 0,
    twigTagAssignMarkup: {
      type: ConcreteNodeTypes.AssignMarkup,
      name: 0,
      value: 4,
      locStart,
      locEnd,
      source,
    },

    twigTagCycleMarkup: {
      type: ConcreteNodeTypes.CycleMarkup,
      groupName: 0,
      args: 3,
      locStart,
      locEnd,
      source,
    },

    twigTagRenderMarkup: {
      type: ConcreteNodeTypes.RenderMarkup,
      snippet: 0,
      variable: 1,
      alias: 2,
      args: 4,
      locStart,
      locEnd,
      source,
    },
    snippetExpression: 0,
    renderVariableExpression: {
      type: ConcreteNodeTypes.RenderVariableExpression,
      kind: 1,
      name: 3,
      locStart,
      locEnd,
      source,
    },
    renderAliasExpression: 3,

    twigDrop: {
      type: ConcreteNodeTypes.TwigDrop,
      markup: 3,
      whitespaceStart: 1,
      whitespaceEnd: 4,
      locStart,
      locEnd,
      source,
    },

    twigDropCases: 0,
    twigExpression: 0,
    twigDropBaseCase: (sw: Node) => sw.sourceString.trimEnd(),
    twigVariable: {
      type: ConcreteNodeTypes.TwigVariable,
      expression: 0,
      filters: 1,
      rawSource: (tokens: Node[]) =>
        source.slice(locStart(tokens), tokens[tokens.length - 2].source.endIdx).trimEnd(),
      locStart,
      // The last node of this rule is a positive lookahead, we don't
      // want its endIdx, we want the endIdx of the previous one.
      locEnd: (tokens: Node[]) => tokens[tokens.length - 2].source.endIdx,
      source,
    },

    twigFilter: {
      type: ConcreteNodeTypes.TwigFilter,
      name: 3,
      locStart,
      locEnd,
      source,
      args(nodes: Node[]) {
        // Traditinally, this would get transformed into null or array. But
        // it's better if we have an empty array instead of null here.
        if (nodes[7].sourceString === '') {
          return [];
        } else {
          return nodes[7].toAST((this as any).args.mapping);
        }
      },
    },
    arguments: 0,
    tagArguments: 0,
    positionalArgument: 0,
    namedArgument: {
      type: ConcreteNodeTypes.NamedArgument,
      name: 0,
      value: 4,
      locStart,
      locEnd,
      source,
    },

    twigString: 0,
    twigDoubleQuotedString: {
      type: ConcreteNodeTypes.String,
      single: () => false,
      value: 1,
      locStart,
      locEnd,
      source,
    },
    twigSingleQuotedString: {
      type: ConcreteNodeTypes.String,
      single: () => true,
      value: 1,
      locStart,
      locEnd,
      source,
    },

    twigNumber: {
      type: ConcreteNodeTypes.Number,
      value: 0,
      locStart,
      locEnd,
      source,
    },

    twigLiteral: {
      type: ConcreteNodeTypes.TwigLiteral,
      value: (tokens: Node[]) => {
        const keyword = tokens[0].sourceString as keyof typeof TwigLiteralValues;
        return TwigLiteralValues[keyword];
      },
      keyword: 0,
      locStart,
      locEnd,
      source,
    },

    twigRange: {
      type: ConcreteNodeTypes.Range,
      start: 2,
      end: 6,
      locStart,
      locEnd,
      source,
    },

    twigVariableLookup: {
      type: ConcreteNodeTypes.VariableLookup,
      name: 0,
      lookups: 1,
      locStart,
      locEnd,
      source,
    },
    variableSegmentAsLookupMarkup: 0,
    variableSegmentAsLookup: {
      type: ConcreteNodeTypes.VariableLookup,
      name: 0,
      lookups: () => [],
      locStart,
      locEnd,
      source,
    },

    lookup: 0,
    indexLookup: 3,
    dotLookup: {
      type: ConcreteNodeTypes.String,
      value: 3,
      locStart: (nodes: Node[]) => nodes[2].source.startIdx,
      locEnd: (nodes: Node[]) => nodes[nodes.length - 1].source.endIdx,
      source,
    },

    // trim on both sides
    tagMarkup: (n: Node) => n.sourceString.trim(),
  };

  const TwigStatement: Mapping = {
    TwigStatement: 0,
    twigTagOpenRule: {
      type: ConcreteNodeTypes.TwigTagOpen,
      name: 0,
      markup(nodes: Node[]) {
        const markupNode = nodes[2];
        const nameNode = nodes[0];
        if (NamedTags.hasOwnProperty(nameNode.sourceString)) {
          return markupNode.toAST((this as any).args.mapping);
        }
        return markupNode.sourceString.trim();
      },
      whitespaceStart: null,
      whitespaceEnd: null,
      locStart,
      locEnd: locEndSecondToLast,
      source,
    },

    twigTagClose: {
      type: ConcreteNodeTypes.TwigTagClose,
      name: 1,
      whitespaceStart: null,
      whitespaceEnd: null,
      locStart,
      locEnd: locEndSecondToLast,
      source,
    },

    twigTagRule: {
      type: ConcreteNodeTypes.TwigTag,
      name: 0,
      markup(nodes: Node[]) {
        const markupNode = nodes[2];
        const nameNode = nodes[0];
        if (NamedTags.hasOwnProperty(nameNode.sourceString)) {
          return markupNode.toAST((this as any).args.mapping);
        }
        return markupNode.sourceString.trim();
      },
      whitespaceStart: null,
      whitespaceEnd: null,
      locStart,
      locEnd: locEndSecondToLast,
      source,
    },

    twigRawTagImpl: {
      type: ConcreteNodeTypes.TwigRawTag,
      name: 0,
      body: 4,
      whitespaceStart: null,
      whitespaceEnd: null,
      delimiterWhitespaceStart: null,
      delimiterWhitespaceEnd: null,
      locStart,
      locEnd: locEndSecondToLast,
      source,
      blockStartLocStart: (tokens: Node[]) => twigStatementOffset + tokens[0].source.startIdx,
      blockStartLocEnd: (tokens: Node[]) => twigStatementOffset + tokens[2].source.endIdx,
      blockEndLocStart: (tokens: Node[]) => twigStatementOffset + tokens[5].source.startIdx,
      blockEndLocEnd: (tokens: Node[]) => twigStatementOffset + tokens[5].source.endIdx,
    },

    twigBlockComment: {
      type: ConcreteNodeTypes.TwigRawTag,
      name: 'comment',
      body: (tokens: Node[]) =>
        // We want this to behave like TwigRawTag, so we have to do some
        // shenanigans to make it behave the same while also supporting
        // nested comments
        //
        // We're stripping the newline from the statementSep, that's why we
        // slice(1). Since statementSep = newline (space | newline)*
        tokens[1].sourceString.slice(1) + tokens[2].sourceString,
      whitespaceStart: '',
      whitespaceEnd: '',
      delimiterWhitespaceStart: '',
      delimiterWhitespaceEnd: '',
      locStart,
      locEnd,
      source,
      blockStartLocStart: (tokens: Node[]) => twigStatementOffset + tokens[0].source.startIdx,
      blockStartLocEnd: (tokens: Node[]) => twigStatementOffset + tokens[0].source.endIdx,
      blockEndLocStart: (tokens: Node[]) => twigStatementOffset + tokens[4].source.startIdx,
      blockEndLocEnd: (tokens: Node[]) => twigStatementOffset + tokens[4].source.endIdx,
    },

    twigInlineComment: {
      type: ConcreteNodeTypes.TwigTag,
      name: 0,
      markup: markupTrimEnd(2),
      whitespaceStart: null,
      whitespaceEnd: null,
      locStart,
      locEnd: locEndSecondToLast,
      source,
    },
  };

  const CraftTwigMappings: Mapping = {
    Node(frontmatter: Node, nodes: Node) {
      const self = this as any;
      const frontmatterNode =
        frontmatter.sourceString.length === 0 ? [] : [frontmatter.toAST(self.args.mapping)];

      return frontmatterNode.concat(nodes.toAST(self.args.mapping));
    },

    yamlFrontmatter: {
      type: ConcreteNodeTypes.YAMLFrontmatter,
      body: 2,
      locStart,
      locEnd,
      source,
    },

    HtmlDoctype: {
      type: ConcreteNodeTypes.HtmlDoctype,
      legacyDoctypeString: 4,
      locStart,
      locEnd,
      source,
    },

    HtmlComment: {
      type: ConcreteNodeTypes.HtmlComment,
      body: markup(1),
      locStart,
      locEnd,
      source,
    },

    HtmlRawTagImpl: {
      type: ConcreteNodeTypes.HtmlRawTag,
      name: (tokens: Node[]) => tokens[0].children[1].sourceString,
      attrList(tokens: Node[]) {
        const mappings = (this as any).args.mapping;
        return tokens[0].children[2].toAST(mappings);
      },
      body: (tokens: Node[]) => source.slice(tokens[0].source.endIdx, tokens[2].source.startIdx),
      locStart,
      locEnd,
      source,
      blockStartLocStart: (tokens: any) => tokens[0].source.startIdx,
      blockStartLocEnd: (tokens: any) => tokens[0].source.endIdx,
      blockEndLocStart: (tokens: any) => tokens[2].source.startIdx,
      blockEndLocEnd: (tokens: any) => tokens[2].source.endIdx,
    },

    HtmlVoidElement: {
      type: ConcreteNodeTypes.HtmlVoidElement,
      name: 1,
      attrList: 3,
      locStart,
      locEnd,
      source,
    },

    HtmlSelfClosingElement: {
      type: ConcreteNodeTypes.HtmlSelfClosingElement,
      name: 1,
      attrList: 2,
      locStart,
      locEnd,
      source,
    },

    HtmlTagOpen: {
      type: ConcreteNodeTypes.HtmlTagOpen,
      name: 1,
      attrList: 2,
      locStart,
      locEnd,
      source,
    },

    HtmlTagClose: {
      type: ConcreteNodeTypes.HtmlTagClose,
      name: 1,
      locStart,
      locEnd,
      source,
    },

    leadingTagNamePart: 0,
    leadingTagNameTextNode: textNode,
    trailingTagNamePart: 0,
    trailingTagNameTextNode: textNode,
    tagName(leadingPart: Node, trailingParts: Node) {
      const mappings = (this as any).args.mapping;
      return [leadingPart.toAST(mappings)].concat(trailingParts.toAST(mappings));
    },

    AttrUnquoted: {
      type: ConcreteNodeTypes.AttrUnquoted,
      name: 0,
      value: 2,
      locStart,
      locEnd,
      source,
    },

    AttrSingleQuoted: {
      type: ConcreteNodeTypes.AttrSingleQuoted,
      name: 0,
      value: 3,
      locStart,
      locEnd,
      source,
    },

    AttrDoubleQuoted: {
      type: ConcreteNodeTypes.AttrDoubleQuoted,
      name: 0,
      value: 3,
      locStart,
      locEnd,
      source,
    },

    attrEmpty: {
      type: ConcreteNodeTypes.AttrEmpty,
      name: 0,
      locStart,
      locEnd,
      source,
    },

    attrName: 0,
    attrNameTextNode: textNode,
    attrDoubleQuotedValue: 0,
    attrSingleQuotedValue: 0,
    attrUnquotedValue: 0,
    attrDoubleQuotedTextNode: textNode,
    attrSingleQuotedTextNode: textNode,
    attrUnquotedTextNode: textNode,
  };

  const defaultMappings = {
    HelperMappings,
    TwigMappings,
    CraftTwigMappings,
  };

  const selectedMappings = cstMappings.reduce(
    (mappings, key) => ({
      ...mappings,
      ...defaultMappings[key],
    }),
    {},
  );

  return toAST(res, selectedMappings) as T;
}
