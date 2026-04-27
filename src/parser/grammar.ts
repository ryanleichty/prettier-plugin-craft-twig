import ohm from 'ohm-js';

export const craftTwigGrammars = ohm.grammars(require('../../grammar/craft-twig.ohm.js'));

export interface TwigGrammars {
  Twig: ohm.Grammar;
  CraftTwig: ohm.Grammar;
  TwigStatement: ohm.Grammar;
}

export const strictGrammars: TwigGrammars = {
  Twig: craftTwigGrammars['StrictTwig'],
  CraftTwig: craftTwigGrammars['StrictCraftTwig'],
  TwigStatement: craftTwigGrammars['StrictTwigStatement'],
};

export const tolerantGrammars: TwigGrammars = {
  Twig: craftTwigGrammars['Twig'],
  CraftTwig: craftTwigGrammars['CraftTwig'],
  TwigStatement: craftTwigGrammars['TwigStatement'],
};

export const placeholderGrammars: TwigGrammars = {
  Twig: craftTwigGrammars['WithPlaceholderTwig'],
  CraftTwig: craftTwigGrammars['WithPlaceholderCraftTwig'],
  TwigStatement: craftTwigGrammars['WithPlaceholderTwigStatement'],
};

// see ../../grammar/craft-twig.ohm for full list
export const BLOCKS = (strictGrammars.CraftTwig.rules as any).blockName.body.factors[0].terms.map(
  (x: any) => x.obj,
) as string[];

// see ../../grammar/craft-twig.ohm for full list
export const RAW_TAGS = (strictGrammars.CraftTwig.rules as any).twigRawTag.body.terms
  .map((term: any) => term.args[0].obj)
  .concat('comment') as string[];

// see ../../grammar/craft-twig.ohm for full list
export const VOID_ELEMENTS = (
  strictGrammars.CraftTwig.rules as any
).voidElementName.body.factors[0].terms.map((x: any) => x.args[0].obj) as string[];

export const TAGS_WITHOUT_MARKUP = [
  'css',
  'html',
  'js',
  'script',
  'style',
  'schema',
  'verbatim',
  'javascript',
  'break',
  'continue',
  'comment',
  'raw',
];
