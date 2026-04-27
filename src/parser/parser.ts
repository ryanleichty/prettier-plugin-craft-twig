import { locEnd, locStart } from '~/utils';
import { toLiquidHtmlAST, LiquidHtmlNode } from '~/parser/stage-2-ast';

export function parse(text: string): LiquidHtmlNode {
  return toLiquidHtmlAST(text);
}

export const craftTwigAstFormat = 'craft-twig-ast';

export const craftTwigLanguageName = 'craft-twig';

export const craftTwigParser = {
  parse,
  astFormat: craftTwigAstFormat,
  locStart,
  locEnd,
};
