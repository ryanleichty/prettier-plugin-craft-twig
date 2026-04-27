export const TWIG_CRAFT_PAIRED_TAGS = [
  'apply',
  'autoescape',
  'block',
  'cache',
  'embed',
  'for',
  'html',
  'if',
  'ifchildren',
  'js',
  'macro',
  'namespace',
  'nav',
  'paginate',
  'sandbox',
  'script',
  'set',
  'switch',
  'tag',
  'verbatim',
  'with',
] as const;

export const TWIG_CRAFT_RAW_TAGS = [
  'css',
  'html',
  'js',
  'javascript',
  'raw',
  'script',
  'style',
  'stylesheet',
  'verbatim',
] as const;

export const TWIG_CRAFT_BRANCH_TAGS = ['case', 'default', 'else', 'elseif', 'elsif'] as const;

export const TWIG_CRAFT_STANDALONE_TAGS = [
  'dd',
  'deprecated',
  'do',
  'dump',
  'exit',
  'expires',
  'extends',
  'flush',
  'from',
  'header',
  'hook',
  'import',
  'include',
  'redirect',
  'requireAdmin',
  'requireEdition',
  'requireGuest',
  'requireLogin',
  'requirePermission',
  'use',
] as const;

export const TWIG_CRAFT_CONTENT_PRESERVING_TAGS = [
  'css',
  'html',
  'js',
  'javascript',
  'raw',
  'script',
  'style',
  'stylesheet',
  'verbatim',
] as const;

export function isTwigCraftPairedTag(name: string) {
  return (TWIG_CRAFT_PAIRED_TAGS as readonly string[]).includes(name);
}

export function isTwigCraftBranchTag(name: string) {
  return (TWIG_CRAFT_BRANCH_TAGS as readonly string[]).includes(name);
}
