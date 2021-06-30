import { usePollingContext } from '@app/common/context';
import { UseQueryResult } from 'react-query';
import { getInventoryApiUrl, useMockableQuery } from './helpers';
import { MOCK_RHV_HOST_TREE, MOCK_VMWARE_HOST_TREE, MOCK_VMWARE_VM_TREE } from './mocks/tree.mock';
import { SourceInventoryProvider } from './types';
import { InventoryTree, InventoryTreeType } from './types/tree.types';
import { useAuthorizedFetch } from './fetchHelpers';

const sortTreeItemsByName = <T extends InventoryTree>(tree: T): T => ({
  ...tree,
  children:
    tree.children &&
    (tree.children as T[]).map(sortTreeItemsByName).sort((a?: T, b?: T) => {
      if (!a || !a.object) return -1;
      if (!b || !b.object) return 1;
      return a.object.name < b.object.name ? -1 : 1;
    }),
});

export interface IndexedTree<T extends InventoryTree = InventoryTree> {
  tree: T;
  flattenedNodes: T[];
  vmSelfLinks: string[];
  pathsBySelfLink: Record<string, T[] | undefined>; // Flattened list of nodes leading to each node
  descendantsBySelfLink: Record<string, T[] | undefined>; // Flattened list of nodes under each node
  getDescendants: (node: InventoryTree, includeNode?: boolean) => InventoryTree[];
}

const indexTree = <T extends InventoryTree>(tree: T): IndexedTree<T> => {
  const flattenedNodes: T[] = [];
  const vmSelfLinks: string[] = [];
  const pathsBySelfLink: Record<string, T[] | undefined> = {};
  const descendantsBySelfLink: Record<string, T[] | undefined> = {};
  const walk = (node: T, ancestors: T[] = []): T[] => {
    if (node.object) {
      flattenedNodes.push(node);
      if (node.kind === 'VM') vmSelfLinks.push(node.object.selfLink);
      pathsBySelfLink[node.object.selfLink] = [...ancestors, node];
    }
    if (node.children) {
      const children = node.children as T[];
      const flattenedDescendants = children.flatMap((childNode) => [
        ...children,
        ...walk(childNode, [...ancestors, node]),
      ]);
      if (node.object) descendantsBySelfLink[node.object.selfLink] = flattenedDescendants;
      return flattenedDescendants;
    }
    return [];
  };
  return {
    tree,
    flattenedNodes: walk(tree),
    vmSelfLinks,
    descendantsBySelfLink,
    pathsBySelfLink,
    getDescendants: (node: InventoryTree, includeNode = true) => {
      const descendants = descendantsBySelfLink[node.object?.selfLink || ''] || [];
      return includeNode ? [node, ...descendants] : descendants;
    },
  };
};

export const useInventoryTreeQuery = <T extends InventoryTree>(
  provider: SourceInventoryProvider | null,
  treeType: InventoryTreeType
): UseQueryResult<IndexedTree<T>> => {
  // VMware providers have both Host and VM trees, but RHV only has Host trees.
  const isValidQuery = provider?.type === 'vsphere' || treeType === InventoryTreeType.Cluster;
  const apiSlug =
    treeType === InventoryTreeType.Cluster
      ? provider?.type === 'vsphere'
        ? '/tree/host' // TODO in the future, this vsphere tree will also be at /tree/cluster
        : '/tree/cluster'
      : '/tree/vm';
  const result = useMockableQuery<T, unknown, IndexedTree<T>>(
    {
      queryKey: ['inventory-tree', provider?.name, treeType],
      queryFn: useAuthorizedFetch(getInventoryApiUrl(`${provider?.selfLink || ''}${apiSlug}`)),
      enabled: isValidQuery && !!provider,
      refetchInterval: usePollingContext().refetchInterval,
      select: (tree) => indexTree(sortTreeItemsByName(tree)),
    },
    (treeType === InventoryTreeType.Cluster
      ? provider?.type === 'vsphere'
        ? MOCK_VMWARE_HOST_TREE
        : MOCK_RHV_HOST_TREE
      : MOCK_VMWARE_VM_TREE) as T
  );
  return result;
};
