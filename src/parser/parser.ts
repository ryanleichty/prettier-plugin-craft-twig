import { locEnd, locStart } from '~/utils';
import { toCraftTwigAST, CraftTwigNode } from '~/parser/stage-2-ast';

export function parse(text: string): CraftTwigNode {
  return toCraftTwigAST(text);
}

export const craftTwigAstFormat = 'craft-twig-ast';

export const craftTwigLanguageName = 'craft-twig';

export const craftTwigParser = {
  parse,
  astFormat: craftTwigAstFormat,
  locStart,
  locEnd,
};
