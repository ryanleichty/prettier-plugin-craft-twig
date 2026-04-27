import { craftTwigParser, craftTwigAstFormat, craftTwigLanguageName } from '~/parser/parser';

export * from '~/parser/stage-2-ast';

export { craftTwigLanguageName, craftTwigAstFormat };

export const parsers = {
  [craftTwigLanguageName]: craftTwigParser,
};
