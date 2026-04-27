import { printerCraftTwig } from '~/printer/printer-craft-twig';
import { craftTwigAstFormat } from '~/parser';

export const printers = {
  [craftTwigAstFormat]: printerCraftTwig,
};
