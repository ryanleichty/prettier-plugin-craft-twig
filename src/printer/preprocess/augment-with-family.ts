import { Augment, CraftTwigNode, WithFamily } from '~/types';

export const augmentWithFamily: Augment<{}> = (_options, node) => {
  const children: CraftTwigNode[] = (node as any).children || [];
  const augmentations: WithFamily = {
    firstChild: children[0],
    lastChild: children[children.length - 1],
  };

  Object.assign(node, augmentations);
};
