import {
  HtmlSelfClosingElement,
  CraftTwigNode,
  NodeTypes,
  TextNode,
  TwigNode,
  TwigNodeTypes,
  HtmlNodeTypes,
  HtmlNode,
  HtmlVoidElement,
  HtmlComment,
  HtmlElement,
  TwigTag,
  AttributeNode,
  TwigDrop,
  HtmlDanglingMarkerOpen,
  HtmlDanglingMarkerClose,
} from '~/types';
import { isEmpty } from '~/printer/utils/array';

export function isScriptLikeTag(node: { type: NodeTypes }) {
  return node.type === NodeTypes.HtmlRawNode;
}

export function isPreLikeNode(node: { cssWhitespace: string }) {
  return node.cssWhitespace.startsWith('pre');
}

// A bit like self-closing except we distinguish between them.
// Comments are also considered self-closing.
export function hasNoCloseMarker(
  node: CraftTwigNode,
): node is
  | HtmlComment
  | HtmlVoidElement
  | HtmlSelfClosingElement
  | HtmlDanglingMarkerOpen
  | HtmlDanglingMarkerClose {
  return (
    isSelfClosing(node) ||
    isVoidElement(node) ||
    isHtmlComment(node) ||
    isHtmlDanglingMarkerOpen(node) ||
    isHtmlDanglingMarkerClose(node)
  );
}

export function isHtmlDanglingMarkerOpen(node: CraftTwigNode): node is HtmlDanglingMarkerOpen {
  return node.type === NodeTypes.HtmlDanglingMarkerOpen;
}

export function isHtmlDanglingMarkerClose(node: CraftTwigNode): node is HtmlDanglingMarkerClose {
  return node.type === NodeTypes.HtmlDanglingMarkerClose;
}

export function isHtmlComment(node: CraftTwigNode): node is HtmlComment {
  return node.type === NodeTypes.HtmlComment;
}

export function isSelfClosing(node: CraftTwigNode): node is HtmlSelfClosingElement {
  return node.type === NodeTypes.HtmlSelfClosingElement;
}

export function isVoidElement(node: CraftTwigNode): node is HtmlVoidElement {
  return node.type === NodeTypes.HtmlVoidElement;
}

export function isHtmlElement(node: CraftTwigNode): node is HtmlElement {
  return node.type === NodeTypes.HtmlElement;
}

export function isTextLikeNode(node: CraftTwigNode | undefined): node is TextNode {
  return !!node && node.type === NodeTypes.TextNode;
}

export function isTwigNode(node: CraftTwigNode | undefined): node is TwigNode {
  return !!node && TwigNodeTypes.includes(node.type as any);
}

export function isMultilineTwigTag(node: CraftTwigNode | undefined): node is TwigTag {
  return !!node && node.type === NodeTypes.TwigTag && !!node.children && !isEmpty(node.children);
}

export function isHtmlNode(node: CraftTwigNode | undefined): node is HtmlNode {
  return !!node && HtmlNodeTypes.includes(node.type as any);
}

export function isAttributeNode(
  node: CraftTwigNode,
): node is AttributeNode & { parentNode: HtmlNode } {
  return (
    isHtmlNode(node.parentNode) &&
    'attributes' in node.parentNode &&
    node.parentNode.attributes.indexOf(node as AttributeNode) !== -1
  );
}

export function hasNonTextChild(node: CraftTwigNode) {
  return (
    (node as any).children &&
    (node as any).children.some((child: CraftTwigNode) => child.type !== NodeTypes.TextNode)
  );
}

export function shouldPreserveContent(node: CraftTwigNode) {
  // // unterminated node in ie conditional comment
  // // e.g. <!--[if lt IE 9]><html><![endif]-->
  // if (
  //   node.type === "ieConditionalComment" &&
  //   node.lastChild &&
  //   !node.lastChild.isSelfClosing &&
  //   !node.lastChild.endSourceSpan
  // ) {
  //   return true;
  // }

  // // incomplete html in ie conditional comment
  // // e.g. <!--[if lt IE 9]></div><![endif]-->
  // if (node.type === "ieConditionalComment" && !node.complete) {
  //   return true;
  // }

  // TODO: Handle pre correctly?
  if (isPreLikeNode(node)) {
    return true;
  }

  return false;
}

export function isPrettierIgnoreHtmlNode(node: CraftTwigNode | undefined): node is HtmlComment {
  return (
    !!node && node.type === NodeTypes.HtmlComment && /^\s*prettier-ignore(?=\s|$)/m.test(node.body)
  );
}

export function isPrettierIgnoreTwigNode(node: CraftTwigNode | undefined): node is TwigTag {
  return (
    !!node &&
    node.type === NodeTypes.TwigTag &&
    node.name === 'twig' &&
    typeof node.markup === 'string' &&
    /^\s*prettier-ignore(?=\s|$)/m.test(node.markup)
  );
}

export function isPrettierIgnoreNode(
  node: CraftTwigNode | undefined,
): node is HtmlComment | TwigTag {
  return isPrettierIgnoreTwigNode(node) || isPrettierIgnoreHtmlNode(node);
}

export function hasPrettierIgnore(node: CraftTwigNode) {
  return isPrettierIgnoreNode(node) || isPrettierIgnoreNode(node.prev);
}

function getPrettierIgnoreAttributeCommentData(value: string): boolean {
  const match = value.trim().match(/prettier-ignore-attribute(?:s?)(?:\s+(.+))?$/s);

  if (!match) {
    return false;
  }

  if (!match[1]) {
    return true;
  }

  // TODO We should support 'prettier-ignore-attribute a,b,c' and allow users to not
  // format the insides of some attributes.
  //
  // But since we don't reformat the insides of attributes yet (because of
  // issue #4), that feature doesn't really make sense.
  //
  // For now, we'll only support `prettier-ignore-attribute`
  //
  // https://github.com/Shopify/prettier-plugin-twig/issues/4
  //
  // return match[1].split(/\s+/);
  return true;
}

export function isPrettierIgnoreAttributeNode(node: CraftTwigNode | undefined): boolean {
  if (!node) return false;
  if (node.type === NodeTypes.HtmlComment) {
    return getPrettierIgnoreAttributeCommentData(node.body);
  }

  if (node.type === NodeTypes.TwigTag && node.name === 'twig' && typeof node.markup === 'string') {
    return getPrettierIgnoreAttributeCommentData(node.markup);
  }

  return false;
}

export function forceNextEmptyLine(node: CraftTwigNode | undefined) {
  if (!node) return false;
  if (!node.next) return false;
  const source = node.source;
  // Current implementation: force next empty line when two consecutive
  // lines exist between nodes.
  let tmp: number;
  tmp = source.indexOf('\n', node.position.end);
  if (tmp === -1) return false;
  tmp = source.indexOf('\n', tmp + 1);
  if (tmp === -1) return false;
  return tmp < node.next.position.start;
}

/** firstChild leadingSpaces and lastChild trailingSpaces */
export function forceBreakContent(node: CraftTwigNode) {
  return (
    forceBreakChildren(node) ||
    (node.type === NodeTypes.HtmlElement &&
      node.children.length > 0 &&
      (isTagNameIncluded(['body', 'script', 'style'], node.name) ||
        node.children.some((child) => hasNonTextChild(child)))) ||
    (node.firstChild &&
      node.firstChild === node.lastChild &&
      node.firstChild.type !== NodeTypes.TextNode &&
      hasLeadingLineBreak(node.firstChild) &&
      (!node.lastChild.isTrailingWhitespaceSensitive || hasTrailingLineBreak(node.lastChild)))
  );
}

/** spaces between children */
export function forceBreakChildren(node: CraftTwigNode) {
  return (
    node.type === NodeTypes.HtmlElement &&
    node.children.length > 0 &&
    (isTagNameIncluded(['html', 'head', 'ul', 'ol', 'select'], node.name) ||
      (node.cssDisplay.startsWith('table') && node.cssDisplay !== 'table-cell'))
  );
}

export function preferHardlineAsSurroundingSpaces(node: CraftTwigNode) {
  switch (node.type) {
    // case 'ieConditionalComment':
    case NodeTypes.HtmlComment:
      return true;
    case NodeTypes.HtmlElement:
      return isTagNameIncluded(['script', 'select'], node.name);
    case NodeTypes.TwigTag:
      if ((node.prev && isTextLikeNode(node.prev)) || (node.next && isTextLikeNode(node.next))) {
        return false;
      }
      return node.children && node.children.length > 0;
  }

  return false;
}

export function preferHardlineAsLeadingSpaces(node: CraftTwigNode) {
  return (
    preferHardlineAsSurroundingSpaces(node) ||
    (isTwigNode(node) && node.prev && isTwigNode(node.prev)) ||
    (node.prev && preferHardlineAsTrailingSpaces(node.prev)) ||
    hasSurroundingLineBreak(node)
  );
}

export function preferHardlineAsTrailingSpaces(node: CraftTwigNode) {
  return (
    preferHardlineAsSurroundingSpaces(node) ||
    (isTwigNode(node) && node.next && (isTwigNode(node.next) || isHtmlNode(node.next))) ||
    (node.type === NodeTypes.HtmlElement && isTagNameIncluded(['br'], node.name)) ||
    hasSurroundingLineBreak(node)
  );
}

export function hasMeaningfulLackOfLeadingWhitespace(node: CraftTwigNode): boolean {
  return node.isLeadingWhitespaceSensitive && !node.hasLeadingWhitespace;
}

export function hasMeaningfulLackOfTrailingWhitespace(node: CraftTwigNode): boolean {
  return node.isTrailingWhitespaceSensitive && !node.hasTrailingWhitespace;
}

export function hasMeaningfulLackOfDanglingWhitespace(node: CraftTwigNode): boolean {
  return node.isDanglingWhitespaceSensitive && !node.hasDanglingWhitespace;
}

function hasSurroundingLineBreak(node: CraftTwigNode) {
  return hasLeadingLineBreak(node) && hasTrailingLineBreak(node);
}

function hasLeadingLineBreak(node: CraftTwigNode) {
  if (node.type === NodeTypes.Document) return false;

  return (
    node.hasLeadingWhitespace &&
    hasLineBreakInRange(
      node.source,
      node.prev
        ? node.prev.position.end
        : (node.parentNode as any).blockStartPosition
          ? (node.parentNode as any).blockStartPosition.end
          : (node.parentNode as any).position.start,
      node.position.start,
    )
  );
}

function hasTrailingLineBreak(node: CraftTwigNode) {
  if (node.type === NodeTypes.Document) return false;
  return (
    node.hasTrailingWhitespace &&
    hasLineBreakInRange(
      node.source,
      node.position.end,
      node.next
        ? node.next.position.start
        : (node.parentNode as any).blockEndPosition
          ? (node.parentNode as any).blockEndPosition.start
          : (node.parentNode as any).position.end,
    )
  );
}

function hasLineBreakInRange(source: string, start: number, end: number) {
  const index = source.indexOf('\n', start);
  return index !== -1 && index < end;
}

export function getLastDescendant(node: CraftTwigNode): CraftTwigNode {
  return node.lastChild ? getLastDescendant(node.lastChild) : node;
}

function isTagNameIncluded(collection: string[], name: (TextNode | TwigDrop)[]): boolean {
  if (name.length !== 1 || name[0].type !== NodeTypes.TextNode) return false;
  return collection.includes(name[0].value);
}
