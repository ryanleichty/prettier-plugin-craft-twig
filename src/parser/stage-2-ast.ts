/**
 * This is the second stage of the parser.
 *
 * Input:
 *  - A Concrete Syntax Tree (CST)
 *
 * Output:
 *  - An Abstract Syntax Tree (AST)
 *
 * This stage traverses the flat tree we get from the previous stage and
 * establishes the parent/child relationship between the nodes.
 *
 * Recall the Twig example we had in the first stage:
 *   {% if cond %}hi <em>there!</em>{% endif %}
 *
 * Whereas the previous stage gives us this CST:
 *   - TwigTagOpen/if
 *     condition: TwigVariableExpression/cond
 *   - TextNode/"hi "
 *   - HtmlTagOpen/em
 *   - TextNode/"there!"
 *   - HtmlTagClose/em
 *   - TwigTagClose/if
 *
 * We now traverse all the nodes and turn that into a proper AST:
 *   - TwigTag/if
 *     condition: TwigVariableExpression
 *     children:
 *       - TextNode/"hi "
 *       - HtmlElement/em
 *         children:
 *           - TextNode/"there!"
 *
 */

import {
  ConcreteAttributeNode,
  ConcreteHtmlTagClose,
  ConcreteHtmlTagOpen,
  ConcreteHtmlVoidElement,
  ConcreteTwigDrop,
  ConcreteTwigNode,
  ConcreteTwigTagClose,
  ConcreteNodeTypes,
  ConcreteTextNode,
  TwigCST,
  CraftTwigCST,
  toCraftTwigCST,
  ConcreteHtmlSelfClosingElement,
  ConcreteAttrSingleQuoted,
  ConcreteAttrDoubleQuoted,
  ConcreteAttrUnquoted,
  ConcreteTwigVariable,
  ConcreteTwigLiteral,
  ConcreteTwigFilter,
  ConcreteTwigExpression,
  ConcreteTwigNamedArgument,
  ConcreteTwigTagNamed,
  ConcreteTwigTag,
  ConcreteTwigTagAssignMarkup,
  ConcreteTwigTagRenderMarkup,
  ConcreteRenderVariableExpression,
  ConcreteTwigTagOpenNamed,
  ConcreteTwigTagOpen,
  ConcreteTwigArgument,
  ConcretePaginateMarkup,
  ConcreteTwigCondition,
  ConcreteTwigComparison,
  ConcreteTwigTagForMarkup,
  ConcreteTwigTagCycleMarkup,
  ConcreteHtmlRawTag,
  ConcreteTwigRawTag,
  CraftTwigConcreteNode,
} from '~/parser/stage-1-cst';
import {
  Comparators,
  isCraftTwigNode,
  NamedTags,
  NodeTypes,
  nonTraversableProperties,
  Position,
} from '~/types';
import { assertNever, deepGet, dropLast } from '~/utils';
import { CraftTwigASTParsingError } from '~/parser/errors';
import { TAGS_WITHOUT_MARKUP } from '~/parser/grammar';
import { toTwigCST } from '~/parser/stage-1-cst';

interface HasPosition {
  locStart: number;
  locEnd: number;
}

export type CraftTwigNode =
  | DocumentNode
  | YAMLFrontmatter
  | TwigNode
  | HtmlDoctype
  | HtmlNode
  | AttributeNode
  | TwigVariable
  | TwigExpression
  | TwigFilter
  | TwigNamedArgument
  | AssignMarkup
  | CycleMarkup
  | ForMarkup
  | RenderMarkup
  | PaginateMarkup
  | RawMarkup
  | RenderVariableExpression
  | TwigLogicalExpression
  | TwigComparison
  | TextNode;

export type TwigAST =
  | DocumentNode
  | TwigNode
  | TwigVariable
  | TwigExpression
  | TwigFilter
  | TwigNamedArgument
  | AssignMarkup
  | CycleMarkup
  | ForMarkup
  | RenderMarkup
  | PaginateMarkup
  | RawMarkup
  | RenderVariableExpression
  | TwigLogicalExpression
  | TwigComparison
  | TextNode;

export interface DocumentNode extends ASTNode<NodeTypes.Document> {
  children: CraftTwigNode[];
  name: '#document';
}

export interface YAMLFrontmatter extends ASTNode<NodeTypes.YAMLFrontmatter> {
  body: string;
}

export type TwigNode = TwigRawTag | TwigTag | TwigDrop | TwigBranch;
export type TwigStatement = TwigRawTag | TwigTag | TwigBranch;

export interface HasChildren {
  children?: CraftTwigNode[];
}
export interface HasAttributes {
  attributes: AttributeNode[];
}
export interface HasValue {
  value: (TextNode | TwigNode)[];
}
export interface HasName {
  name: string | TwigDrop;
}
export interface HasCompoundName {
  name: (TextNode | TwigNode)[];
}

export type ParentNode = Extract<
  CraftTwigNode,
  HasChildren | HasAttributes | HasValue | HasName | HasCompoundName
>;

export interface TwigRawTag extends ASTNode<NodeTypes.TwigRawTag> {
  /**
   * e.g. raw, style, javascript
   */
  name: string;
  markup: string;

  /**
   * String body of the tag. So we don't try to parse it.
   */
  body: RawMarkup;
  whitespaceStart: '-' | '';
  whitespaceEnd: '-' | '';
  delimiterWhitespaceStart: '-' | '';
  delimiterWhitespaceEnd: '-' | '';
  blockStartPosition: Position;
  blockEndPosition: Position;
}

export type TwigTag = TwigTagNamed | TwigTagBaseCase;
export type TwigTagNamed =
  | TwigTagAssign
  | TwigTagCapture
  | TwigTagCycle
  | TwigTagDecrement
  | TwigTagEcho
  | TwigTagFor
  | TwigTagForm
  | TwigTagIf
  | TwigTagInclude
  | TwigTagIncrement
  | TwigTagLayout
  | TwigTagTwig
  | TwigTagPaginate
  | TwigTagRender
  | TwigTagSection
  | TwigTagSections
  | TwigTagSet
  | TwigTagSwitch
  | TwigTagTablerow
  | TwigTagUnless;

export interface TwigTagNode<Name, Markup> extends ASTNode<NodeTypes.TwigTag> {
  /**
   * e.g. if, ifchanged, for, etc.
   */
  name: Name;

  /**
   * The body of the tag. May contain arguments. Excludes the name of the tag. Left trimmed if string.
   */
  markup: Markup;
  children?: CraftTwigNode[];
  whitespaceStart: '-' | '';
  whitespaceEnd: '-' | '';
  delimiterWhitespaceStart?: '-' | '';
  delimiterWhitespaceEnd?: '-' | '';
  blockStartPosition: Position;
  blockEndPosition?: Position;
}

export interface TwigTagBaseCase extends TwigTagNode<string, string> {}
export interface TwigTagEcho extends TwigTagNode<NamedTags.echo, TwigVariable> {}

export interface TwigTagAssign extends TwigTagNode<NamedTags.assign, AssignMarkup> {}
export interface AssignMarkup extends ASTNode<NodeTypes.AssignMarkup> {
  name: string;
  value: TwigVariable;
}

export interface TwigTagIncrement extends TwigTagNode<NamedTags.increment, TwigVariableLookup> {}
export interface TwigTagDecrement extends TwigTagNode<NamedTags.decrement, TwigVariableLookup> {}

export interface TwigTagCapture extends TwigTagNode<NamedTags.capture, TwigVariableLookup> {}
export interface TwigTagSet extends TwigTagNode<NamedTags.set, TwigVariableLookup> {}

export interface TwigTagCycle extends TwigTagNode<NamedTags.cycle, CycleMarkup> {}
export interface CycleMarkup extends ASTNode<NodeTypes.CycleMarkup> {
  groupName: TwigExpression | null;
  args: TwigExpression[];
}

export interface TwigTagSwitch extends TwigTagNode<NamedTags.switch, TwigExpression> {}
export interface TwigBranchCase extends TwigBranchNode<NamedTags.case, TwigExpression> {}

export interface TwigTagForm extends TwigTagNode<NamedTags.form, TwigArgument[]> {}

export interface TwigTagFor extends TwigTagNode<NamedTags.for, ForMarkup> {}
export interface ForMarkup extends ASTNode<NodeTypes.ForMarkup> {
  variableName: string;
  collection: TwigExpression;
  reversed: boolean;
  args: TwigNamedArgument[];
}

export interface TwigTagTablerow extends TwigTagNode<NamedTags.tablerow, ForMarkup> {}

export interface TwigTagIf extends TwigTagConditional<NamedTags.if> {}
export interface TwigTagUnless extends TwigTagConditional<NamedTags.unless> {}
export interface TwigBranchElseif
  extends TwigBranchNode<NamedTags.elseif, TwigConditionalExpression> {}
export interface TwigBranchElsif
  extends TwigBranchNode<NamedTags.elsif, TwigConditionalExpression> {}
export interface TwigTagConditional<Name> extends TwigTagNode<Name, TwigConditionalExpression> {}

export type TwigConditionalExpression = TwigLogicalExpression | TwigComparison | TwigExpression;

export interface TwigLogicalExpression extends ASTNode<NodeTypes.LogicalExpression> {
  relation: 'and' | 'or';
  left: TwigConditionalExpression;
  right: TwigConditionalExpression;
}

export interface TwigComparison extends ASTNode<NodeTypes.Comparison> {
  comparator: Comparators;
  left: TwigConditionalExpression;
  right: TwigConditionalExpression;
}

export interface TwigTagPaginate extends TwigTagNode<NamedTags.paginate, PaginateMarkup> {}
export interface PaginateMarkup extends ASTNode<NodeTypes.PaginateMarkup> {
  collection: TwigExpression;
  pageSize: TwigExpression;
  args: TwigNamedArgument[];
}

export interface TwigTagRender extends TwigTagNode<NamedTags.render, RenderMarkup> {}
export interface TwigTagInclude extends TwigTagNode<NamedTags.include, RenderMarkup> {}

export interface TwigTagSection extends TwigTagNode<NamedTags.section, TwigString> {}
export interface TwigTagSections extends TwigTagNode<NamedTags.sections, TwigString> {}
export interface TwigTagLayout extends TwigTagNode<NamedTags.layout, TwigExpression> {}

export interface TwigTagTwig extends TwigTagNode<NamedTags.twig, TwigStatement[]> {}

export interface RenderMarkup extends ASTNode<NodeTypes.RenderMarkup> {
  snippet: TwigString | TwigVariableLookup;
  alias: string | null;
  variable: RenderVariableExpression | null;
  args: TwigNamedArgument[];
}

export interface RenderVariableExpression extends ASTNode<NodeTypes.RenderVariableExpression> {
  kind: 'for' | 'with';
  name: TwigExpression;
}

export type TwigBranch = TwigBranchUnnamed | TwigBranchBaseCase | TwigBranchNamed;
export type TwigBranchNamed = TwigBranchCase | TwigBranchElseif | TwigBranchElsif;

interface TwigBranchNode<Name, Markup> extends ASTNode<NodeTypes.TwigBranch> {
  /**
   * e.g. else, elsif, when | null when in the main branch
   */
  name: Name;

  /**
   * The body of the branch tag. May contain arguments. Excludes the name of the tag. Left trimmed.
   */
  markup: Markup;
  children: CraftTwigNode[];
  whitespaceStart: '-' | '';
  whitespaceEnd: '-' | '';
  blockStartPosition: Position;
}

export interface TwigBranchUnnamed extends TwigBranchNode<null, string> {}
export interface TwigBranchBaseCase extends TwigBranchNode<string, string> {}

export interface TwigDrop extends ASTNode<NodeTypes.TwigDrop> {
  /**
   * The body of the drop. May contain filters. Not trimmed.
   */
  markup: string | TwigVariable;
  whitespaceStart: '-' | '';
  whitespaceEnd: '-' | '';
}

interface TwigVariable extends ASTNode<NodeTypes.TwigVariable> {
  expression: TwigExpression;
  filters: TwigFilter[];
  rawSource: string;
}

export type TwigExpression = TwigString | TwigNumber | TwigLiteral | TwigRange | TwigVariableLookup;

interface TwigFilter extends ASTNode<NodeTypes.TwigFilter> {
  name: string;
  args: TwigArgument[];
}

type TwigArgument = TwigExpression | TwigNamedArgument;

interface TwigNamedArgument extends ASTNode<NodeTypes.NamedArgument> {
  name: string;
  value: TwigExpression;
}

interface TwigString extends ASTNode<NodeTypes.String> {
  single: boolean;
  value: string;
}

interface TwigNumber extends ASTNode<NodeTypes.Number> {
  value: string;
}

interface TwigRange extends ASTNode<NodeTypes.Range> {
  start: TwigExpression;
  end: TwigExpression;
}

interface TwigLiteral extends ASTNode<NodeTypes.TwigLiteral> {
  keyword: ConcreteTwigLiteral['keyword'];
  value: ConcreteTwigLiteral['value'];
}

interface TwigVariableLookup extends ASTNode<NodeTypes.VariableLookup> {
  name: string | null;
  lookups: TwigExpression[];
}

export type HtmlNode =
  | HtmlComment
  | HtmlElement
  | HtmlDanglingMarkerOpen
  | HtmlDanglingMarkerClose
  | HtmlVoidElement
  | HtmlSelfClosingElement
  | HtmlRawNode;

export interface HtmlElement extends HtmlNodeBase<NodeTypes.HtmlElement> {
  /**
   * The name of the tag can be compound
   * @example <{{ header_type }}--header />
   */
  name: (TextNode | TwigDrop)[];
  children: CraftTwigNode[];
  blockEndPosition: Position;
}

export interface HtmlDanglingMarkerOpen extends HtmlNodeBase<NodeTypes.HtmlDanglingMarkerOpen> {
  name: (TextNode | TwigDrop)[];
}

export interface HtmlDanglingMarkerClose extends ASTNode<NodeTypes.HtmlDanglingMarkerClose> {
  name: (TextNode | TwigDrop)[];
  blockStartPosition: Position;
}

export interface HtmlSelfClosingElement extends HtmlNodeBase<NodeTypes.HtmlSelfClosingElement> {
  /**
   * The name of the tag can be compound
   * @example <{{ header_type }}--header />
   */
  name: (TextNode | TwigDrop)[];
}

export interface HtmlVoidElement extends HtmlNodeBase<NodeTypes.HtmlVoidElement> {
  name: string;
}

export interface HtmlRawNode extends HtmlNodeBase<NodeTypes.HtmlRawNode> {
  /**
   * The innerHTML of the tag as a string. Not trimmed. Not parsed.
   */
  body: RawMarkup;
  name: string;
  blockEndPosition: Position;
}

export enum RawMarkupKinds {
  css = 'css',
  html = 'html',
  javascript = 'javascript',
  json = 'json',
  markdown = 'markdown',
  typescript = 'typescript',
  text = 'text',
}

export interface RawMarkup extends ASTNode<NodeTypes.RawMarkup> {
  kind: RawMarkupKinds;
  value: string;
}

export interface HtmlDoctype extends ASTNode<NodeTypes.HtmlDoctype> {
  legacyDoctypeString: string | null;
}

export interface HtmlComment extends ASTNode<NodeTypes.HtmlComment> {
  body: string;
}

export interface HtmlNodeBase<T> extends ASTNode<T> {
  attributes: AttributeNode[];
  blockStartPosition: Position;
}

export type AttributeNode =
  | TwigNode
  | AttrSingleQuoted
  | AttrDoubleQuoted
  | AttrUnquoted
  | AttrEmpty;

export interface AttrSingleQuoted extends AttributeNodeBase<NodeTypes.AttrSingleQuoted> {}
export interface AttrDoubleQuoted extends AttributeNodeBase<NodeTypes.AttrDoubleQuoted> {}
export interface AttrUnquoted extends AttributeNodeBase<NodeTypes.AttrUnquoted> {}
export interface AttrEmpty extends ASTNode<NodeTypes.AttrEmpty> {
  name: (TextNode | TwigDrop)[];
}

export type ValueNode = TextNode | TwigNode;

export interface AttributeNodeBase<T> extends ASTNode<T> {
  name: (TextNode | TwigDrop)[];
  value: ValueNode[];
  attributePosition: Position;
}

export interface TextNode extends ASTNode<NodeTypes.TextNode> {
  value: string;
}

export interface ASTNode<T> {
  type: T;
  position: Position;
  source: string;
}

interface ASTBuildOptions {
  /**
   * Whether the parser should throw if the document node isn't closed
   */
  allowUnclosedDocumentNode: boolean;

  /**
   * 'strict' will disable the Twig parsing base cases. Which means that we will
   * throw an error if we can't parse the node `markup` properly.
   *
   * 'tolerant' is the default case so that prettier can pretty print nodes
   * that it doesn't understand.
   */
  mode: 'strict' | 'tolerant' | 'completion';
}

export function isBranchedTag(node: CraftTwigNode) {
  return (
    node.type === NodeTypes.TwigTag &&
    ['if', 'for', 'ifchildren', 'unless', 'switch'].includes(node.name)
  );
}

// Not exported because you can use node.type === NodeTypes.TwigBranch.
function isTwigBranchDisguisedAsTag(node: CraftTwigNode): node is TwigTagBaseCase {
  return (
    node.type === NodeTypes.TwigTag &&
    ['case', 'default', 'else', 'elseif', 'elsif'].includes(node.name)
  );
}

function isConcreteTwigBranchDisguisedAsTag(
  node: CraftTwigConcreteNode,
): node is ConcreteTwigNode & {
  name: 'case' | 'default' | 'else' | 'elseif' | 'eslif';
} {
  return (
    node.type === ConcreteNodeTypes.TwigTag &&
    ['case', 'default', 'else', 'elseif', 'eslif'].includes(node.name)
  );
}

export function toTwigAST(
  source: string,
  options: ASTBuildOptions = {
    allowUnclosedDocumentNode: true,
    mode: 'tolerant',
  },
) {
  const cst = toTwigCST(source, { mode: options.mode });
  const root: DocumentNode = {
    type: NodeTypes.Document,
    source: source,
    children: cstToAst(cst, options),
    name: '#document',
    position: {
      start: 0,
      end: source.length,
    },
  };
  return root;
}

export function toCraftTwigAST(
  source: string,
  options: ASTBuildOptions = {
    allowUnclosedDocumentNode: false,
    mode: 'tolerant',
  },
): DocumentNode {
  const cst = toCraftTwigCST(source, { mode: options.mode });
  const root: DocumentNode = {
    type: NodeTypes.Document,
    source: source,
    children: cstToAst(cst, options),
    name: '#document',
    position: {
      start: 0,
      end: source.length,
    },
  };
  return root;
}

class ASTBuilder {
  ast: CraftTwigNode[];
  cursor: (string | number)[];
  source: string;

  constructor(source: string) {
    this.ast = [];
    this.cursor = [];
    this.source = source;
  }

  get current() {
    return deepGet<CraftTwigNode[]>(this.cursor, this.ast) as CraftTwigNode[];
  }

  get currentPosition(): number {
    return (this.current || []).length - 1;
  }

  get parent(): ParentNode | undefined {
    if (this.cursor.length == 0) return undefined;
    return deepGet<TwigTag | HtmlElement>(dropLast(1, this.cursor), this.ast);
  }

  get grandparent(): ParentNode | undefined {
    if (this.cursor.length < 4) return undefined;
    return deepGet<TwigTag | HtmlElement>(dropLast(3, this.cursor), this.ast);
  }

  open(node: CraftTwigNode) {
    this.current.push(node);
    this.cursor.push(this.currentPosition);
    this.cursor.push('children');

    if (isBranchedTag(node)) {
      this.open(toUnnamedTwigBranch(node));
    }
  }

  push(node: CraftTwigNode) {
    if (node.type === NodeTypes.TwigTag && isTwigBranchDisguisedAsTag(node)) {
      this.cursor.pop();
      this.cursor.pop();
      this.open(toNamedTwigBranchBaseCase(node));
    } else if (node.type === NodeTypes.TwigBranch) {
      this.cursor.pop();
      this.cursor.pop();
      this.open(node);
    } else {
      if (this.parent?.type === NodeTypes.TwigBranch) {
        this.parent.position.end = node.position.end;
      }
      this.current.push(node);
    }
  }

  close(
    node: ConcreteTwigTagClose | ConcreteHtmlTagClose,
    nodeType: NodeTypes.TwigTag | NodeTypes.HtmlElement,
  ) {
    if (isTwigBranch(this.parent)) {
      this.parent.position.end = node.locStart;
      this.cursor.pop();
      this.cursor.pop();
    }

    if (!this.parent) {
      throw new CraftTwigASTParsingError(
        `Attempting to close ${nodeType} '${getName(node)}' before it was opened`,
        this.source,
        node.locStart,
        node.locEnd,
      );
    }

    if (getName(this.parent) !== getName(node) || this.parent.type !== nodeType) {
      throw new CraftTwigASTParsingError(
        `Attempting to close ${nodeType} '${getName(node)}' before ${this.parent.type} '${getName(
          this.parent,
        )}' was closed`,
        this.source,
        this.parent.position.start,
        node.locEnd,
      );
    }

    // The parent end is the end of the outer tag.
    this.parent.position.end = node.locEnd;
    this.parent.blockEndPosition = position(node);
    if (this.parent.type == NodeTypes.TwigTag && node.type == ConcreteNodeTypes.TwigTagClose) {
      this.parent.delimiterWhitespaceStart = node.whitespaceStart ?? '';
      this.parent.delimiterWhitespaceEnd = node.whitespaceEnd ?? '';
    }
    this.cursor.pop();
    this.cursor.pop();
  }
}

function isTwigBranch(node: CraftTwigNode | undefined): node is TwigBranchNode<any, any> {
  return !!node && node.type === NodeTypes.TwigBranch;
}

function getName(
  node: ConcreteTwigTagClose | ConcreteHtmlTagClose | ParentNode | undefined,
): string | TwigDrop | null {
  if (!node) return null;
  switch (node.type) {
    case NodeTypes.HtmlElement:
    case NodeTypes.HtmlDanglingMarkerOpen:
    case NodeTypes.HtmlDanglingMarkerClose:
    case NodeTypes.HtmlSelfClosingElement:
    case ConcreteNodeTypes.HtmlTagClose:
      return node.name
        .map((part) => {
          if (part.type === NodeTypes.TextNode || part.type == ConcreteNodeTypes.TextNode) {
            return part.value;
          } else if (typeof part.markup === 'string') {
            return `{{${part.markup.trim()}}}`;
          } else {
            return `{{${part.markup.rawSource}}}`;
          }
        })
        .join('');
    case NodeTypes.AttrEmpty:
    case NodeTypes.AttrUnquoted:
    case NodeTypes.AttrDoubleQuoted:
    case NodeTypes.AttrSingleQuoted:
      // <a href="{{ hello }}">
      return node.name
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          } else {
            return part.source.slice(part.position.start, part.position.end);
          }
        })
        .join('');
    default:
      return node.name;
  }
}

export function cstToAst(
  cst: CraftTwigCST | TwigCST | ConcreteAttributeNode[],
  options: ASTBuildOptions,
): CraftTwigNode[] {
  if (cst.length === 0) return [];

  const builder = buildAst(cst, options);

  if (!options.allowUnclosedDocumentNode && builder.cursor.length !== 0) {
    throw new CraftTwigASTParsingError(
      `Attempting to end parsing before ${builder.parent?.type} '${getName(
        builder.parent,
      )}' was closed`,
      builder.source,
      builder.source.length - 1,
      builder.source.length,
    );
  }

  return builder.ast;
}

function buildAst(cst: CraftTwigCST | TwigCST | ConcreteAttributeNode[], options: ASTBuildOptions) {
  const builder = new ASTBuilder(cst[0].source);

  for (let i = 0; i < cst.length; i++) {
    const node = cst[i];

    switch (node.type) {
      case ConcreteNodeTypes.TextNode: {
        builder.push(toTextNode(node));
        break;
      }

      case ConcreteNodeTypes.TwigDrop: {
        builder.push(toTwigDrop(node));
        break;
      }

      case ConcreteNodeTypes.TwigTagOpen: {
        builder.open(toTwigTag(node, { isBlockTag: true, ...options }));
        break;
      }

      case ConcreteNodeTypes.TwigTagClose: {
        builder.close(node, NodeTypes.TwigTag);
        break;
      }

      case ConcreteNodeTypes.TwigTag: {
        builder.push(toTwigTag(node, { isBlockTag: false, ...options }));
        break;
      }

      case ConcreteNodeTypes.TwigRawTag: {
        builder.push({
          type: NodeTypes.TwigRawTag,
          markup: markup(node.name, node.markup),
          name: node.name,
          body: toRawMarkup(node),
          whitespaceStart: node.whitespaceStart ?? '',
          whitespaceEnd: node.whitespaceEnd ?? '',
          delimiterWhitespaceStart: node.delimiterWhitespaceStart ?? '',
          delimiterWhitespaceEnd: node.delimiterWhitespaceEnd ?? '',
          position: position(node),
          blockStartPosition: {
            start: node.blockStartLocStart,
            end: node.blockStartLocEnd,
          },
          blockEndPosition: {
            start: node.blockEndLocStart,
            end: node.blockEndLocEnd,
          },
          source: node.source,
        });
        break;
      }

      case ConcreteNodeTypes.HtmlTagOpen: {
        if (isAcceptableDanglingMarkerOpen(builder, cst as CraftTwigCST, i)) {
          builder.push(toHtmlDanglingMarkerOpen(node, options));
        } else {
          builder.open(toHtmlElement(node, options));
        }
        break;
      }

      case ConcreteNodeTypes.HtmlTagClose: {
        if (isAcceptableDanglingMarkerClose(builder, cst as CraftTwigCST, i)) {
          builder.push(toHtmlDanglingMarkerClose(node, options));
        } else {
          builder.close(node, NodeTypes.HtmlElement);
        }
        break;
      }

      case ConcreteNodeTypes.HtmlVoidElement: {
        builder.push(toHtmlVoidElement(node, options));
        break;
      }

      case ConcreteNodeTypes.HtmlSelfClosingElement: {
        builder.push(toHtmlSelfClosingElement(node, options));
        break;
      }

      case ConcreteNodeTypes.HtmlDoctype: {
        builder.push({
          type: NodeTypes.HtmlDoctype,
          legacyDoctypeString: node.legacyDoctypeString,
          position: position(node),
          source: node.source,
        });
        break;
      }

      case ConcreteNodeTypes.HtmlComment: {
        builder.push({
          type: NodeTypes.HtmlComment,
          body: node.body,
          position: position(node),
          source: node.source,
        });
        break;
      }

      case ConcreteNodeTypes.HtmlRawTag: {
        builder.push({
          type: NodeTypes.HtmlRawNode,
          name: node.name,
          body: toRawMarkup(node),
          attributes: toAttributes(node.attrList || [], options),
          position: position(node),
          source: node.source,
          blockStartPosition: {
            start: node.blockStartLocStart,
            end: node.blockStartLocEnd,
          },
          blockEndPosition: {
            start: node.blockEndLocStart,
            end: node.blockEndLocEnd,
          },
        });
        break;
      }

      case ConcreteNodeTypes.AttrEmpty: {
        builder.push({
          type: NodeTypes.AttrEmpty,
          name: cstToAst(node.name, options) as (TextNode | TwigDrop)[],
          position: position(node),
          source: node.source,
        });
        break;
      }

      case ConcreteNodeTypes.AttrSingleQuoted:
      case ConcreteNodeTypes.AttrDoubleQuoted:
      case ConcreteNodeTypes.AttrUnquoted: {
        const abstractNode: AttrUnquoted | AttrSingleQuoted | AttrDoubleQuoted = {
          type: node.type as unknown as
            | NodeTypes.AttrSingleQuoted
            | NodeTypes.AttrDoubleQuoted
            | NodeTypes.AttrUnquoted,
          name: cstToAst(node.name, options) as (TextNode | TwigDrop)[],
          position: position(node),
          source: node.source,

          // placeholders
          attributePosition: { start: -1, end: -1 },
          value: [],
        };
        const value = toAttributeValue(node.value, options);
        abstractNode.value = value;
        abstractNode.attributePosition = toAttributePosition(node, value);
        builder.push(abstractNode);
        break;
      }

      case ConcreteNodeTypes.YAMLFrontmatter: {
        builder.push({
          type: NodeTypes.YAMLFrontmatter,
          body: node.body,
          position: position(node),
          source: node.source,
        });
        break;
      }

      default: {
        assertNever(node);
      }
    }
  }

  return builder;
}

function nameLength(names: (ConcreteTwigDrop | ConcreteTextNode)[]) {
  const start = names.at(0)!;
  const end = names.at(-1)!;
  return end.locEnd - start.locStart;
}

function toAttributePosition(
  node: ConcreteAttrSingleQuoted | ConcreteAttrDoubleQuoted | ConcreteAttrUnquoted,
  value: (TwigNode | TextNode)[],
): Position {
  if (value.length === 0) {
    // This is bugged when there's whitespace on either side. But I don't
    // think it's worth solving.
    return {
      start: node.locStart + nameLength(node.name) + '='.length + '"'.length,
      // name=""
      // 012345678
      // 0 + 4 + 1 + 1
      // = 6
      end: node.locStart + nameLength(node.name) + '='.length + '"'.length,
      // name=""
      // 012345678
      // 0 + 4 + 1 + 2
      // = 6
    };
  }

  return {
    start: value[0].position.start,
    end: value[value.length - 1].position.end,
  };
}

function toAttributeValue(
  value: (ConcreteTwigNode | ConcreteTextNode)[],
  options: ASTBuildOptions,
): (TwigNode | TextNode)[] {
  return cstToAst(value, options) as (TwigNode | TextNode)[];
}

function toAttributes(
  attrList: ConcreteAttributeNode[],
  options: ASTBuildOptions,
): AttributeNode[] {
  return cstToAst(attrList, options) as AttributeNode[];
}

function twigTagBaseAttributes(
  node: ConcreteTwigTag | ConcreteTwigTagOpen,
): Omit<TwigTag, 'name' | 'markup'> {
  return {
    type: NodeTypes.TwigTag,
    position: position(node),
    whitespaceStart: node.whitespaceStart ?? '',
    whitespaceEnd: node.whitespaceEnd ?? '',
    blockStartPosition: position(node),
    source: node.source,
  };
}

function twigBranchBaseAttributes(node: ConcreteTwigTag): Omit<TwigBranch, 'name' | 'markup'> {
  return {
    type: NodeTypes.TwigBranch,
    children: [],
    position: position(node),
    whitespaceStart: node.whitespaceStart ?? '',
    whitespaceEnd: node.whitespaceEnd ?? '',
    blockStartPosition: position(node),
    source: node.source,
  };
}

function toTwigTag(
  node: ConcreteTwigTag | ConcreteTwigTagOpen,
  options: ASTBuildOptions & { isBlockTag: boolean },
): TwigTag | TwigBranch {
  if (typeof node.markup !== 'string') {
    return toNamedTwigTag(node as ConcreteTwigTagNamed, options);
  } else if (options.isBlockTag) {
    return {
      name: node.name,
      markup: markup(node.name, node.markup),
      children: options.isBlockTag ? [] : undefined,
      ...twigTagBaseAttributes(node),
    };
  }
  return {
    name: node.name,
    markup: markup(node.name, node.markup),
    ...twigTagBaseAttributes(node),
  };
}

function toNamedTwigTag(
  node: ConcreteTwigTagNamed | ConcreteTwigTagOpenNamed,
  options: ASTBuildOptions,
): TwigTagNamed | TwigBranchNamed {
  switch (node.name) {
    case NamedTags.echo: {
      return {
        ...twigTagBaseAttributes(node),
        name: NamedTags.echo,
        markup: toTwigVariable(node.markup),
      };
    }

    case NamedTags.assign: {
      return {
        ...twigTagBaseAttributes(node),
        name: NamedTags.assign,
        markup: toAssignMarkup(node.markup),
      };
    }

    case NamedTags.cycle: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toCycleMarkup(node.markup),
      };
    }

    case NamedTags.increment:
    case NamedTags.decrement: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toExpression(node.markup) as TwigVariableLookup,
      };
    }

    case NamedTags.capture:
    case NamedTags.set: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toExpression(node.markup) as TwigVariableLookup,
        children: [],
      };
    }

    case NamedTags.include:
    case NamedTags.render: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toRenderMarkup(node.markup),
      };
    }

    case NamedTags.layout:
    case NamedTags.section: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toExpression(node.markup) as TwigString,
      };
    }
    case NamedTags.sections: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toExpression(node.markup) as TwigString,
      };
    }

    case NamedTags.form: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: node.markup.map(toTwigArgument),
        children: [],
      };
    }

    case NamedTags.tablerow:
    case NamedTags.for: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toForMarkup(node.markup),
        children: [],
      };
    }

    case NamedTags.paginate: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toPaginateMarkup(node.markup),
        children: [],
      };
    }

    case NamedTags.if:
    case NamedTags.unless: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toConditionalExpression(node.markup),
        children: [],
      };
    }

    case NamedTags.elseif:
    case NamedTags.elsif: {
      return {
        ...twigBranchBaseAttributes(node),
        name: node.name,
        markup: toConditionalExpression(node.markup),
      };
    }

    case NamedTags.switch: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: toExpression(node.markup),
        children: [],
      };
    }

    case NamedTags.case: {
      return {
        ...twigBranchBaseAttributes(node),
        name: node.name,
        markup: toExpression(node.markup),
      };
    }

    case NamedTags.twig: {
      return {
        ...twigTagBaseAttributes(node),
        name: node.name,
        markup: cstToAst(node.markup, options) as TwigStatement[],
      };
    }

    default: {
      return assertNever(node);
    }
  }
}

function toNamedTwigBranchBaseCase(node: TwigTagBaseCase): TwigBranchBaseCase {
  return {
    name: node.name,
    type: NodeTypes.TwigBranch,
    markup: node.markup,
    position: { ...node.position },
    children: [],
    blockStartPosition: { ...node.position },
    whitespaceStart: node.whitespaceStart,
    whitespaceEnd: node.whitespaceEnd,
    source: node.source,
  };
}

function toUnnamedTwigBranch(parentNode: CraftTwigNode): TwigBranchUnnamed {
  return {
    type: NodeTypes.TwigBranch,
    name: null,
    markup: '',
    position: {
      start: parentNode.position.end,
      end: parentNode.position.end, // tmp value
    },
    blockStartPosition: {
      start: parentNode.position.end,
      end: parentNode.position.end,
    },
    children: [],
    whitespaceStart: '',
    whitespaceEnd: '',
    source: parentNode.source,
  };
}

function toAssignMarkup(node: ConcreteTwigTagAssignMarkup): AssignMarkup {
  return {
    type: NodeTypes.AssignMarkup,
    name: node.name,
    value: toTwigVariable(node.value),
    position: position(node),
    source: node.source,
  };
}

function toCycleMarkup(node: ConcreteTwigTagCycleMarkup): CycleMarkup {
  return {
    type: NodeTypes.CycleMarkup,
    groupName: node.groupName ? toExpression(node.groupName) : null,
    args: node.args.map(toExpression),
    position: position(node),
    source: node.source,
  };
}

function toForMarkup(node: ConcreteTwigTagForMarkup): ForMarkup {
  return {
    type: NodeTypes.ForMarkup,
    variableName: node.variableName,
    collection: toExpression(node.collection),
    args: node.args.map(toNamedArgument),
    reversed: !!node.reversed,
    position: position(node),
    source: node.source,
  };
}

function toPaginateMarkup(node: ConcretePaginateMarkup): PaginateMarkup {
  return {
    type: NodeTypes.PaginateMarkup,
    collection: toExpression(node.collection),
    pageSize: toExpression(node.pageSize),
    position: position(node),
    args: node.args ? node.args.map(toNamedArgument) : [],
    source: node.source,
  };
}

function toRawMarkup(node: ConcreteHtmlRawTag | ConcreteTwigRawTag): RawMarkup {
  return {
    type: NodeTypes.RawMarkup,
    kind: toRawMarkupKind(node),
    value: node.body,
    position: {
      start: node.blockStartLocEnd,
      end: node.blockEndLocStart,
    },
    source: node.source,
  };
}

function toRawMarkupKind(node: ConcreteHtmlRawTag | ConcreteTwigRawTag): RawMarkupKinds {
  switch (node.type) {
    case ConcreteNodeTypes.HtmlRawTag:
      return toRawMarkupKindFromHtmlNode(node);
    case ConcreteNodeTypes.TwigRawTag:
      return toRawMarkupKindFromTwigNode(node);
    default:
      return assertNever(node);
  }
}

const twigToken = /(\{%|\{\{)-?/g;

function toRawMarkupKindFromHtmlNode(node: ConcreteHtmlRawTag): RawMarkupKinds {
  switch (node.name) {
    case 'script': {
      const scriptAttr = node.attrList?.find(
        (attr) =>
          'name' in attr &&
          typeof attr.name !== 'string' &&
          attr.name.length === 1 &&
          attr.name[0].type === ConcreteNodeTypes.TextNode &&
          attr.name[0].value === 'type',
      );

      if (
        !scriptAttr ||
        !('value' in scriptAttr) ||
        scriptAttr.value.length === 0 ||
        scriptAttr.value[0].type !== ConcreteNodeTypes.TextNode
      ) {
        return RawMarkupKinds.javascript;
      }
      const type = scriptAttr.value[0].value;

      if (type === 'text/markdown') {
        return RawMarkupKinds.markdown;
      }

      if (type === 'application/x-typescript') {
        return RawMarkupKinds.typescript;
      }

      if (type === 'text/html') {
        return RawMarkupKinds.html;
      }

      if (
        (type && (type.endsWith('json') || type.endsWith('importmap'))) ||
        type === 'speculationrules'
      ) {
        return RawMarkupKinds.json;
      }

      return RawMarkupKinds.javascript;
    }
    case 'style':
      if (twigToken.test(node.body)) {
        return RawMarkupKinds.text;
      }
      return RawMarkupKinds.css;
    default:
      return RawMarkupKinds.text;
  }
}

function toRawMarkupKindFromTwigNode(node: ConcreteTwigRawTag): RawMarkupKinds {
  switch (node.name) {
    case 'javascript':
      return RawMarkupKinds.javascript;
    case 'stylesheet':
    case 'style':
      if (twigToken.test(node.body)) {
        return RawMarkupKinds.text;
      }
      return RawMarkupKinds.css;
    case 'schema':
      return RawMarkupKinds.json;
    default:
      return RawMarkupKinds.text;
  }
}

function toRenderMarkup(node: ConcreteTwigTagRenderMarkup): RenderMarkup {
  return {
    type: NodeTypes.RenderMarkup,
    snippet: toExpression(node.snippet) as TwigString | TwigVariableLookup,
    alias: node.alias,
    variable: toRenderVariableExpression(node.variable),
    args: node.args.map(toNamedArgument),
    position: position(node),
    source: node.source,
  };
}

function toRenderVariableExpression(
  node: ConcreteRenderVariableExpression | null,
): RenderVariableExpression | null {
  if (!node) return null;
  return {
    type: NodeTypes.RenderVariableExpression,
    kind: node.kind,
    name: toExpression(node.name),
    position: position(node),
    source: node.source,
  };
}

function toConditionalExpression(nodes: ConcreteTwigCondition[]): TwigConditionalExpression {
  if (nodes.length === 1) {
    return toComparisonOrExpression(nodes[0]);
  }

  const [first, second] = nodes;
  const [, ...rest] = nodes;
  return {
    type: NodeTypes.LogicalExpression,
    relation: second.relation as 'and' | 'or',
    left: toComparisonOrExpression(first),
    right: toConditionalExpression(rest),
    position: {
      start: first.locStart,
      end: nodes[nodes.length - 1].locEnd,
    },
    source: first.source,
  };
}

function toComparisonOrExpression(node: ConcreteTwigCondition): TwigComparison | TwigExpression {
  const expression = node.expression;
  switch (expression.type) {
    case ConcreteNodeTypes.Comparison:
      return toComparison(expression);
    default:
      return toExpression(expression);
  }
}

function toComparison(node: ConcreteTwigComparison): TwigComparison {
  return {
    type: NodeTypes.Comparison,
    comparator: node.comparator,
    left: toExpression(node.left),
    right: toExpression(node.right),
    position: position(node),
    source: node.source,
  };
}

function toTwigDrop(node: ConcreteTwigDrop): TwigDrop {
  return {
    type: NodeTypes.TwigDrop,
    markup: typeof node.markup === 'string' ? node.markup : toTwigVariable(node.markup),
    whitespaceStart: node.whitespaceStart ?? '',
    whitespaceEnd: node.whitespaceEnd ?? '',
    position: position(node),
    source: node.source,
  };
}

function toTwigVariable(node: ConcreteTwigVariable): TwigVariable {
  return {
    type: NodeTypes.TwigVariable,
    expression: toExpression(node.expression),
    filters: node.filters.map(toFilter),
    position: position(node),
    rawSource: node.rawSource,
    source: node.source,
  };
}

function toExpression(node: ConcreteTwigExpression): TwigExpression {
  switch (node.type) {
    case ConcreteNodeTypes.String: {
      return {
        type: NodeTypes.String,
        position: position(node),
        single: node.single,
        value: node.value,
        source: node.source,
      };
    }
    case ConcreteNodeTypes.Number: {
      return {
        type: NodeTypes.Number,
        position: position(node),
        value: node.value,
        source: node.source,
      };
    }
    case ConcreteNodeTypes.TwigLiteral: {
      return {
        type: NodeTypes.TwigLiteral,
        position: position(node),
        value: node.value,
        keyword: node.keyword,
        source: node.source,
      };
    }
    case ConcreteNodeTypes.Range: {
      return {
        type: NodeTypes.Range,
        start: toExpression(node.start),
        end: toExpression(node.end),
        position: position(node),
        source: node.source,
      };
    }
    case ConcreteNodeTypes.VariableLookup: {
      return {
        type: NodeTypes.VariableLookup,
        name: node.name,
        lookups: node.lookups.map(toExpression),
        position: position(node),
        source: node.source,
      };
    }
    default: {
      return assertNever(node);
    }
  }
}

function toFilter(node: ConcreteTwigFilter): TwigFilter {
  return {
    type: NodeTypes.TwigFilter,
    name: node.name,
    args: node.args.map(toTwigArgument),
    position: position(node),
    source: node.source,
  };
}

function toTwigArgument(node: ConcreteTwigArgument): TwigArgument {
  switch (node.type) {
    case ConcreteNodeTypes.NamedArgument: {
      return toNamedArgument(node);
    }
    default: {
      return toExpression(node);
    }
  }
}

function toNamedArgument(node: ConcreteTwigNamedArgument): TwigNamedArgument {
  return {
    type: NodeTypes.NamedArgument,
    name: node.name,
    value: toExpression(node.value),
    position: position(node),
    source: node.source,
  };
}

function toHtmlElement(node: ConcreteHtmlTagOpen, options: ASTBuildOptions): HtmlElement {
  return {
    type: NodeTypes.HtmlElement,
    name: cstToAst(node.name, options) as (TextNode | TwigDrop)[],
    attributes: toAttributes(node.attrList || [], options),
    position: position(node),
    blockStartPosition: position(node),
    blockEndPosition: { start: -1, end: -1 },
    children: [],
    source: node.source,
  };
}

function toHtmlDanglingMarkerOpen(
  node: ConcreteHtmlTagOpen,
  options: ASTBuildOptions,
): HtmlDanglingMarkerOpen {
  return {
    type: NodeTypes.HtmlDanglingMarkerOpen,
    name: cstToAst(node.name, options) as (TextNode | TwigDrop)[],
    attributes: toAttributes(node.attrList || [], options),
    position: position(node),
    blockStartPosition: position(node),
    source: node.source,
  };
}

function toHtmlDanglingMarkerClose(
  node: ConcreteHtmlTagClose,
  options: ASTBuildOptions,
): HtmlDanglingMarkerClose {
  return {
    type: NodeTypes.HtmlDanglingMarkerClose,
    name: cstToAst(node.name, options) as (TextNode | TwigDrop)[],
    position: position(node),
    blockStartPosition: position(node),
    source: node.source,
  };
}

function toHtmlVoidElement(
  node: ConcreteHtmlVoidElement,
  options: ASTBuildOptions,
): HtmlVoidElement {
  return {
    type: NodeTypes.HtmlVoidElement,
    name: node.name,
    attributes: toAttributes(node.attrList || [], options),
    position: position(node),
    blockStartPosition: position(node),
    source: node.source,
  };
}

function toHtmlSelfClosingElement(
  node: ConcreteHtmlSelfClosingElement,
  options: ASTBuildOptions,
): HtmlSelfClosingElement {
  return {
    type: NodeTypes.HtmlSelfClosingElement,
    name: cstToAst(node.name, options) as (TextNode | TwigDrop)[],
    attributes: toAttributes(node.attrList || [], options),
    position: position(node),
    blockStartPosition: position(node),
    source: node.source,
  };
}

function toTextNode(node: ConcreteTextNode): TextNode {
  return {
    type: NodeTypes.TextNode,
    value: node.value,
    position: position(node),
    source: node.source,
  };
}

const MAX_NUMBER_OF_SIBLING_DANGLING_NODES = 2;

function isAcceptableDanglingMarkerOpen(
  builder: ASTBuilder,
  cst: CraftTwigCST,
  currIndex: number,
): boolean {
  return isAcceptableDanglingMarker(builder, cst, currIndex, ConcreteNodeTypes.HtmlTagOpen);
}

function isAcceptableDanglingMarkerClose(
  builder: ASTBuilder,
  cst: CraftTwigCST,
  currIndex: number,
): boolean {
  return isAcceptableDanglingMarker(builder, cst, currIndex, ConcreteNodeTypes.HtmlTagClose);
}

function isAcceptableDanglingMarker(
  builder: ASTBuilder,
  cst: CraftTwigCST,
  currIndex: number,
  nodeType: ConcreteNodeTypes.HtmlTagOpen | ConcreteNodeTypes.HtmlTagClose,
): boolean {
  if (!isAcceptingDanglingMarkers(builder, nodeType)) {
    return false;
  }

  const maxIndex = Math.min(
    cst.length,
    currIndex + MAX_NUMBER_OF_SIBLING_DANGLING_NODES - builder.current.length,
  );

  for (let i = currIndex; i <= maxIndex; i++) {
    if (isConcreteExceptionEnd(cst[i])) {
      return true;
    }
    if (cst[i].type !== nodeType) {
      return false;
    }
  }

  return false;
}

const DanglingMapping = {
  [ConcreteNodeTypes.HtmlTagOpen]: NodeTypes.HtmlDanglingMarkerOpen,
  [ConcreteNodeTypes.HtmlTagClose]: NodeTypes.HtmlDanglingMarkerClose,
} as const;

function isAcceptingDanglingMarkers(
  builder: ASTBuilder,
  nodeType: ConcreteNodeTypes.HtmlTagOpen | ConcreteNodeTypes.HtmlTagClose,
) {
  const { parent, grandparent } = builder;
  if (!parent || !grandparent) return false;
  return (
    parent.type === NodeTypes.TwigBranch &&
    grandparent.type === NodeTypes.TwigTag &&
    ['if', 'unless', 'switch'].includes(grandparent.name) &&
    builder.current.every((node) => node.type === DanglingMapping[nodeType])
  );
}

// checking that is a {% else %} or {% endif %}
function isConcreteExceptionEnd(node: CraftTwigConcreteNode | undefined) {
  return (
    !node ||
    node.type === ConcreteNodeTypes.TwigTagClose ||
    isConcreteTwigBranchDisguisedAsTag(node)
  );
}

function markup(name: string, markup: string) {
  if (TAGS_WITHOUT_MARKUP.includes(name)) return '';
  return markup;
}

function position(node: HasPosition): Position {
  return {
    start: node.locStart,
    end: node.locEnd,
  };
}

export function walk(
  ast: CraftTwigNode,
  fn: (ast: CraftTwigNode, parentNode: CraftTwigNode | undefined) => void,
  parentNode?: CraftTwigNode,
) {
  for (const key of Object.keys(ast)) {
    if (nonTraversableProperties.has(key)) {
      continue;
    }

    const value = (ast as any)[key];
    if (Array.isArray(value)) {
      value.filter(isCraftTwigNode).forEach((node: CraftTwigNode) => walk(node, fn, ast));
    } else if (isCraftTwigNode(value)) {
      walk(value, fn, ast);
    }
  }

  fn(ast, parentNode);
}
