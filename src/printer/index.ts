import { printerCraftTwig2, printerCraftTwig3 } from '~/printer/printer-craft-twig';
import { craftTwigAstFormat } from '~/parser';

export const printers2 = {
  [craftTwigAstFormat]: printerCraftTwig2,
};

export const printers3 = {
  [craftTwigAstFormat]: printerCraftTwig3,
};
