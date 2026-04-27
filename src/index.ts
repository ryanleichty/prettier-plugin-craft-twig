import { SupportLanguage, SupportOptions, version } from 'prettier';
import type { Plugin as Plugin2 } from 'prettier';
import type { Plugin as Plugin3 } from 'prettier3';
import { parsers, craftTwigLanguageName } from '~/parser';
import { printers2, printers3 } from '~/printer';
import { LiquidHtmlNode } from '~/types';

const languages: SupportLanguage[] = [
  {
    name: 'CraftTwig',
    parsers: [craftTwigLanguageName],
    extensions: ['.twig'],
    vscodeLanguageIds: ['twig', 'Twig'],
  },
];

const options: SupportOptions = {
  twigSingleQuote: {
    type: 'boolean',
    category: 'TWIG',
    default: true,
    description:
      'Use single quotes instead of double quotes in Twig tags and objects.',
    since: '0.2.0',
  },
  embeddedSingleQuote: {
    type: 'boolean',
    category: 'TWIG',
    default: true,
    description:
      'Use single quotes instead of double quotes in embedded languages (JavaScript, CSS, TypeScript inside <script>, <style> or Twig equivalents).',
    since: '0.4.0',
  },
  singleLineLinkTags: {
    type: 'boolean',
    category: 'HTML',
    default: false,
    description: 'Always print link tags on a single line to remove clutter',
    since: '0.1.0',
  },
  indentSchema: {
    type: 'boolean',
    category: 'TWIG',
    default: false,
    description: 'Indent the contents of the {% schema %} tag',
    since: '0.1.0',
  },
};

const defaultOptions = {
  printWidth: 120,
};

const plugin2: Plugin2<LiquidHtmlNode> = {
  languages,
  parsers: parsers as Plugin2['parsers'],
  printers: printers2,
  options,
  defaultOptions,
};

const plugin3: Plugin3<LiquidHtmlNode> = {
  languages,
  parsers: parsers as Plugin3['parsers'],
  printers: printers3 as any,
  options,
  defaultOptions,
};

const prettierMajor = version.split('.')[0]!;

export = prettierMajor === '2' ? plugin2 : plugin3;
