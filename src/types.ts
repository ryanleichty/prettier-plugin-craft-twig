import { Doc } from 'prettier';
import type { AstPath as AstPath2 } from 'prettier';
import type { AstPath as AstPath3, ParserOptions as ParserOptions3 } from 'prettier3';
import * as AST from '~/parser/stage-2-ast';

export type CommonKeys<T1, T2> = Extract<keyof T1, keyof T2>;
export type AstPath<T = any> = Pick<AstPath2<T>, CommonKeys<AstPath2<T>, AstPath3<T>>>;
export type ParserOptions<T = any> = ParserOptions3<T>;

export interface Position {
  start: number;
  end: number;
}

export enum NodeTypes {
  Document = 'Document',
  TwigRawTag = 'TwigRawTag',
  TwigTag = 'TwigTag',
  TwigBranch = 'TwigBranch',
  TwigDrop = 'TwigDrop',
  HtmlSelfClosingElement = 'HtmlSelfClosingElement',
  HtmlVoidElement = 'HtmlVoidElement',
  HtmlDoctype = 'HtmlDoctype',
  HtmlComment = 'HtmlComment',
  HtmlElement = 'HtmlElement',
  HtmlDanglingMarkerOpen = 'HtmlDanglingMarkerOpen',
  HtmlDanglingMarkerClose = 'HtmlDanglingMarkerClose',
  HtmlRawNode = 'HtmlRawNode',
  AttrSingleQuoted = 'AttrSingleQuoted',
  AttrDoubleQuoted = 'AttrDoubleQuoted',
  AttrUnquoted = 'AttrUnquoted',
  AttrEmpty = 'AttrEmpty',
  TextNode = 'TextNode',
  YAMLFrontmatter = 'YAMLFrontmatter',

  TwigVariable = 'TwigVariable',
  TwigFilter = 'TwigFilter',
  NamedArgument = 'NamedArgument',
  TwigLiteral = 'TwigLiteral',
  String = 'String',
  Number = 'Number',
  Range = 'Range',
  VariableLookup = 'VariableLookup',
  Comparison = 'Comparison',
  LogicalExpression = 'LogicalExpression',

  AssignMarkup = 'AssignMarkup',
  CycleMarkup = 'CycleMarkup',
  ForMarkup = 'ForMarkup',
  PaginateMarkup = 'PaginateMarkup',
  RawMarkup = 'RawMarkup',
  RenderMarkup = 'RenderMarkup',
  RenderVariableExpression = 'RenderVariableExpression',
}

export function isCraftTwigNode(value: any): value is CraftTwigNode {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    NodeTypes.hasOwnProperty(value.type)
  );
}

// These are officially supported with special node types
export enum NamedTags {
  assign = 'assign',
  capture = 'capture',
  case = 'case',
  cycle = 'cycle',
  decrement = 'decrement',
  echo = 'echo',
  elseif = 'elseif',
  elsif = 'elsif',
  for = 'for',
  form = 'form',
  if = 'if',
  include = 'include',
  increment = 'increment',
  layout = 'layout',
  twig = 'twig',
  paginate = 'paginate',
  render = 'render',
  section = 'section',
  sections = 'sections',
  set = 'set',
  switch = 'switch',
  tablerow = 'tablerow',
  unless = 'unless',
}

export enum Comparators {
  CONTAINS = 'contains',
  EQUAL = '==',
  GREATER_THAN = '>',
  GREATER_THAN_OR_EQUAL = '>=',
  LESS_THAN = '<',
  LESS_THAN_OR_EQUAL = '<=',
  NOT_EQUAL = '!=',
}

export const HtmlNodeTypes = [
  NodeTypes.HtmlElement,
  NodeTypes.HtmlDanglingMarkerOpen,
  NodeTypes.HtmlDanglingMarkerClose,
  NodeTypes.HtmlRawNode,
  NodeTypes.HtmlVoidElement,
  NodeTypes.HtmlSelfClosingElement,
] as const;

export const TwigNodeTypes = [
  NodeTypes.TwigTag,
  NodeTypes.TwigDrop,
  NodeTypes.TwigBranch,
  NodeTypes.TwigRawTag,
] as const;

export type TwigAstPath = AstPath<CraftTwigNode>;
export type TwigParserOptions = ParserOptions<CraftTwigNode> & {
  singleAttributePerLine: boolean;
  singleLineLinkTags: boolean;
  twigSingleQuote: boolean;
  embeddedSingleQuote: boolean;
  indentSchema: boolean;
};
export type TwigPrinterArgs = {
  leadingSpaceGroupId?: symbol[] | symbol;
  trailingSpaceGroupId?: symbol[] | symbol;
  isTwigStatement?: boolean;
  truncate?: boolean;
};
export type TwigPrinter = (path: AstPath<CraftTwigNode>, args?: TwigPrinterArgs) => Doc;

// Those properties create loops that would make walking infinite
export const nonTraversableProperties = new Set([
  'parentNode',
  'prev',
  'next',
  'firstChild',
  'lastChild',
]);

// This one warrants a bit of an explanation 'cuz it's definitely next
// level typescript kung-fu shit.
//
// We have an AST, right? And we want to augment every node in the AST with
// new properties. But we don't want to have to _rewrite_ all of the types
// of all the AST nodes that were augmented. So we use this neat little
// trick that will surprise you:
//
// - If the property was   TwigNode[],
//   then we'll map it to  Augmented<TwigNode>[];
//
// - If the property was   (string | number)[],
//   then we'll map it to  (string | number)[];
//
// - If the property was   string | TwigNode,
//   then we'll map it to  string | Augmented<TwigNode>;
//
// - If the property was   TwigNode,
//   then we'll map it to  Augmented<TwigNode>;
//
// - If the property was   string,
//   then we'll map it to  string;
//
// So, Augmented<TwigTag, WithParent> =>
//  - TwigTag with a parentNode,
//  - TwigTag.children all have a parentNode since TwigTag.children is CraftTwigNode, then
//  - TwigTag.markup all have a parentNode since TwigTag.markup may be TwigTagAssignMarkup.
//  - TwigTag.name will remain a string
//
// Topics to google to understand what's going on:
//  - TypeScript generic types (for creating types from types)
//  - TypeScript mapped types (for mapping the input type's properties to new types)
//  - TypeScript union types (A | B | C)
//  - TypeScript conditional types (and the section on distribution for union types)
//
// prettier-ignore
export type Augmented<T, Aug> = {
  [Property in keyof T]: [T[Property]] extends [(infer Item)[] | undefined]
    // First branch: property?: Item[]
    ? [Item] extends [AST.CraftTwigNode] // If *all* Item extend AST.CraftTwigNode
      ? Augmented<Item, Aug>[]            // If yes, => Augmented<Node>[]
      : Item[]                            // If not, => string[], number[], etc.

    // Second branch: property is NOT Item[]
    : T[Property] extends infer P    // T[Property] to distributed P alias
      ? P extends AST.CraftTwigNode // Distribute if P extends AST.CraftTwigNode
        ? Augmented<P, Aug>          // => If yes, => Augmented<Node>
        : P                          // => If not, => string, number, Position, etc.
      : never;
} & Aug;

export type AllAugmentations = WithParent &
  WithSiblings &
  WithFamily &
  WithCssProperties &
  WithWhitespaceHelpers;

export type WithParent = {
  parentNode?: ParentNode;
};

export type WithSiblings = {
  // We're cheating here by saying the prev/next will have all the props.
  // That's kind of a lie. But it would be too complicated to do this any
  // other way.
  prev: CraftTwigNode | undefined;
  next: CraftTwigNode | undefined;
};

export type WithFamily = {
  firstChild: CraftTwigNode | undefined;
  lastChild: CraftTwigNode | undefined;
};

export type WithCssProperties = {
  cssDisplay: string;
  cssWhitespace: string;
};

export type WithWhitespaceHelpers = {
  isDanglingWhitespaceSensitive: boolean;
  isWhitespaceSensitive: boolean;
  isLeadingWhitespaceSensitive: boolean;
  isTrailingWhitespaceSensitive: boolean;
  isIndentationSensitive: boolean;
  hasLeadingWhitespace: boolean;
  hasTrailingWhitespace: boolean;
  hasDanglingWhitespace: boolean;
};

export type AugmentedNode<Aug> = Augmented<AST.CraftTwigNode, Aug>;

export type Augment<Aug> = <NodeType extends AugmentedNode<Aug>>(
  options: TwigParserOptions,
  node: NodeType,
  parentNode?: NodeType,
) => void;

export type CraftTwigNode = Augmented<AST.CraftTwigNode, AllAugmentations>;
export type DocumentNode = Augmented<AST.DocumentNode, AllAugmentations>;
export type TwigNode = Augmented<AST.TwigNode, AllAugmentations>;
export type TwigStatement = Augmented<AST.TwigStatement, AllAugmentations>;
export type ParentNode = Augmented<AST.ParentNode, AllAugmentations>;
export type TwigRawTag = Augmented<AST.TwigRawTag, AllAugmentations>;
export type TwigTag = Augmented<AST.TwigTag, AllAugmentations>;
export type TwigTagNamed = Augmented<AST.TwigTagNamed, AllAugmentations>;
export type TwigBranch = Augmented<AST.TwigBranch, AllAugmentations>;
export type TwigBranchNamed = Augmented<AST.TwigBranchNamed, AllAugmentations>;
export type TwigDrop = Augmented<AST.TwigDrop, AllAugmentations>;
export type HtmlNode = Augmented<AST.HtmlNode, AllAugmentations>;
export type HtmlTag = Exclude<HtmlNode, HtmlComment>;
export type HtmlElement = Augmented<AST.HtmlElement, AllAugmentations>;
export type HtmlDanglingMarkerOpen = Augmented<AST.HtmlDanglingMarkerOpen, AllAugmentations>;
export type HtmlDanglingMarkerClose = Augmented<AST.HtmlDanglingMarkerClose, AllAugmentations>;
export type HtmlVoidElement = Augmented<AST.HtmlVoidElement, AllAugmentations>;
export type HtmlSelfClosingElement = Augmented<AST.HtmlSelfClosingElement, AllAugmentations>;
export type HtmlRawNode = Augmented<AST.HtmlRawNode, AllAugmentations>;
export type HtmlDoctype = Augmented<AST.HtmlDoctype, AllAugmentations>;
export type HtmlComment = Augmented<AST.HtmlComment, AllAugmentations>;
export type AttributeNode = Augmented<AST.AttributeNode, AllAugmentations>;
export type AttrSingleQuoted = Augmented<AST.AttrSingleQuoted, AllAugmentations>;
export type AttrDoubleQuoted = Augmented<AST.AttrDoubleQuoted, AllAugmentations>;
export type AttrUnquoted = Augmented<AST.AttrUnquoted, AllAugmentations>;
export type AttrEmpty = Augmented<AST.AttrEmpty, AllAugmentations>;
export type TwigExpression = Augmented<AST.TwigExpression, AllAugmentations>;
export type TextNode = Augmented<AST.TextNode, AllAugmentations>;
