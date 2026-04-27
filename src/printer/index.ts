import {
  printerLiquidHtml2,
  printerLiquidHtml3,
} from '~/printer/printer-liquid-html';
import { craftTwigAstFormat } from '~/parser';

export const printers2 = {
  [craftTwigAstFormat]: printerLiquidHtml2,
};

export const printers3 = {
  [craftTwigAstFormat]: printerLiquidHtml3,
};
