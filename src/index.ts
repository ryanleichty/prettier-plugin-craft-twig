import { SupportLanguage, SupportOptions } from 'prettier';
import type { Plugin } from 'prettier';
import { parsers, craftTwigLanguageName } from '~/parser';
import { printers } from '~/printer';
import { CraftTwigNode } from '~/types';

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
    description: 'Use single quotes instead of double quotes in Twig tags and objects.',
  },
  embeddedSingleQuote: {
    type: 'boolean',
    category: 'TWIG',
    default: true,
    description:
      'Use single quotes instead of double quotes in embedded languages (JavaScript, CSS, TypeScript inside <script>, <style> or Twig equivalents).',
  },
  singleLineLinkTags: {
    type: 'boolean',
    category: 'HTML',
    default: false,
    description: 'Always print link tags on a single line to remove clutter',
  },
  indentSchema: {
    type: 'boolean',
    category: 'TWIG',
    default: false,
    description: 'Indent the contents of the {% schema %} tag',
  },
};

const defaultOptions = {
  printWidth: 120,
};

const plugin: Plugin<CraftTwigNode> = {
  languages,
  parsers: parsers as Plugin['parsers'],
  printers: printers as any,
  options,
  defaultOptions,
};

export = plugin;
