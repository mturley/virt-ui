import * as React from 'react';
import { TreeViewDataItem } from '@patternfly/react-core';
import {
  ICommonTreeObject,
  IHook,
  INameNamespaceRef,
  INetworkMapping,
  IPlan,
  SourceVM,
  IStorageMapping,
  IInventoryHostTree,
  ISourceVMConcern,
  IVMwareFolderTree,
  MappingSource,
  MappingType,
  InventoryTree,
  InventoryTreeType,
  IVMwareVM,
  IRHVVM,
} from '@app/queries/types';
import { ClusterIcon, OutlinedHddIcon, FolderIcon } from '@patternfly/react-icons';
import {
  getBuilderItemsFromMappingItems,
  getBuilderItemsWithMissingSources,
  getMappingFromBuilderItems,
} from '@app/Mappings/components/MappingBuilder/helpers';
import { PlanWizardFormState } from './PlanWizard';
import { CLUSTER_API_VERSION, META, ProviderType } from '@app/common/constants';
import {
  getAggregateQueryStatus,
  getFirstQueryError,
  isSameResource,
  nameAndNamespace,
} from '@app/queries/helpers';
import {
  findProvidersByRefs,
  useMappingResourceQueries,
  useInventoryProvidersQuery,
  useInventoryTreeQuery,
  useMappingsQuery,
  useHooksQuery,
  useSourceVMsQuery,
  IndexedTree,
  IndexedSourceVMs,
} from '@app/queries';
import { UseQueryResult, QueryStatus } from 'react-query';
import { StatusType } from '@konveyor/lib-ui';
import { PlanHookInstance } from './PlanAddEditHookModal';
import { IKubeList } from '@app/client/types';
import { getObjectRef } from '@app/common/helpers';

// Exclude VMs and Hosts from the rendered tree entirely
export const isIncludedNode = (node: InventoryTree): boolean =>
  node.kind !== 'VM' && node.kind !== 'Host';
export const isIncludedLeafNode = (node: InventoryTree): boolean =>
  isIncludedNode(node) &&
  (!node.children ||
    node.children.length === 0 ||
    node.children.every((child) => !isIncludedNode(child)));

// Helper for filterAndConvertInventoryTree
const subtreeMatchesSearch = (node: InventoryTree, searchText: string) => {
  if (!isIncludedNode(node)) return false;
  if (
    searchText === '' ||
    (node.object?.name || '').toLowerCase().includes(searchText.toLowerCase())
  ) {
    return true;
  }
  return node.children?.some((child) => subtreeMatchesSearch(child, searchText)) || false;
};

export const useIsNodeSelectableCallback = (
  treeType: InventoryTreeType
): ((node: InventoryTree) => boolean) =>
  React.useCallback(
    (node: InventoryTree) => {
      if (isIncludedLeafNode(node)) return true;
      if (treeType === InventoryTreeType.VM) {
        return node.kind === 'Folder' || node.kind === 'Datacenter';
      }
      return false;
    },
    [treeType]
  );

const areSomeDescendantsSelected = (
  indexedTree: IndexedTree,
  node: InventoryTree,
  isNodeSelected: (node: InventoryTree) => boolean
) => {
  if (isNodeSelected(node)) return true;
  return indexedTree.getDescendants(node).some(isNodeSelected);
};

const areAllSelectableDescendantsSelected = (
  indexedTree: IndexedTree,
  node: InventoryTree,
  isNodeSelected: (node: InventoryTree) => boolean,
  isNodeSelectable: (node: InventoryTree) => boolean
) => {
  if (!node.children) return isNodeSelected(node);
  return indexedTree.getDescendants(node).filter(isNodeSelectable).every(isNodeSelected);
};

export const isNodeFullyChecked = (
  indexedTree: IndexedTree,
  node: InventoryTree | null,
  isNodeSelected: (node: InventoryTree) => boolean,
  isNodeSelectable: (node: InventoryTree) => boolean
): boolean => {
  if (!node) return false;
  return (
    isNodeSelected(node) ||
    areAllSelectableDescendantsSelected(indexedTree, node, isNodeSelected, isNodeSelectable)
  );
};

export const isNodePartiallyChecked = (
  indexedTree: IndexedTree,
  node: InventoryTree | null,
  isNodeSelected: (node: InventoryTree) => boolean,
  isFullyChecked: boolean
): boolean => {
  if (!node) return false;
  return !isFullyChecked && areSomeDescendantsSelected(indexedTree, node, isNodeSelected);
};

// Helper for filterAndConvertInventoryTree
const convertInventoryTreeNode = (
  indexedTree: IndexedTree,
  node: InventoryTree,
  searchText: string,
  isNodeSelected: (node: InventoryTree) => boolean,
  isNodeSelectable: (node: InventoryTree) => boolean,
  getNodeBadgeContent: (node: InventoryTree, isRootNode: boolean) => React.ReactNode
): TreeViewDataItem => {
  const isFullyChecked = isNodeFullyChecked(indexedTree, node, isNodeSelected, isNodeSelectable);
  const isPartiallyChecked = isNodePartiallyChecked(
    indexedTree,
    node,
    isNodeSelected,
    isFullyChecked
  );
  const badge = getNodeBadgeContent(node, false);
  return {
    name: node.object?.name || '',
    id: node.object?.selfLink,
    children: filterAndConvertInventoryTreeChildren(
      indexedTree,
      node.children,
      searchText,
      isNodeSelected,
      isNodeSelectable,
      getNodeBadgeContent
    ),
    checkProps: {
      'aria-label': `Select ${node.kind} ${node.object?.name || ''}`,
      checked: isPartiallyChecked ? null : isFullyChecked,
    },
    icon:
      node.kind === 'Cluster' ? (
        <ClusterIcon />
      ) : node.kind === 'Host' ? (
        <OutlinedHddIcon />
      ) : node.kind === 'Folder' ? (
        <FolderIcon />
      ) : null,
    customBadgeContent: badge,
    hasBadge: !!badge,
  };
};

// Helper for filterAndConvertInventoryTree
const filterAndConvertInventoryTreeChildren = (
  indexedTree: IndexedTree,
  children: InventoryTree[] | null,
  searchText: string,
  isNodeSelected: (node: InventoryTree) => boolean,
  isNodeSelectable: (node: InventoryTree) => boolean,
  getNodeBadgeContent: (node: InventoryTree, isRootNode: boolean) => React.ReactNode
): TreeViewDataItem[] | undefined => {
  const filteredChildren = ((children || []) as InventoryTree[]).filter((node) =>
    subtreeMatchesSearch(node, searchText)
  );
  if (filteredChildren.length > 0)
    return filteredChildren.map((node) =>
      convertInventoryTreeNode(
        indexedTree,
        node,
        searchText,
        isNodeSelected,
        isNodeSelectable,
        getNodeBadgeContent
      )
    );
  return undefined;
};

// Convert the API tree structure to the PF TreeView structure, while filtering by the user's search text.
export const filterAndConvertInventoryTree = (
  indexedTree: IndexedTree | null,
  searchText: string,
  isNodeSelected: (node: InventoryTree) => boolean,
  areAllSelected: boolean,
  isNodeSelectable: (node: InventoryTree) => boolean,
  getNodeBadgeContent: (node: InventoryTree, isRootNode: boolean) => React.ReactNode
): TreeViewDataItem[] => {
  if (!indexedTree?.tree) return [];
  const rootNode = indexedTree.tree;
  const isPartiallyChecked = isNodePartiallyChecked(
    indexedTree,
    rootNode,
    isNodeSelected,
    areAllSelected
  );
  const badge = getNodeBadgeContent(rootNode, true);
  return [
    {
      name: 'All datacenters',
      id: 'converted-root',
      checkProps: {
        'aria-label': 'Select all datacenters',
        checked: isPartiallyChecked ? null : areAllSelected,
      },
      children: filterAndConvertInventoryTreeChildren(
        indexedTree,
        rootNode.children,
        searchText,
        isNodeSelected,
        isNodeSelectable,
        getNodeBadgeContent
      ),
      customBadgeContent: badge,
      hasBadge: !!badge,
    },
  ];
};

// From the flattened selected nodes list, get all the unique VMs.
const getAllVMChildren = (
  indexedTree: IndexedTree,
  nodes: InventoryTree[],
  treeType: InventoryTreeType
): InventoryTree[] => {
  if (nodes.length === 0) return [];
  const getDirectVMChildren = (node: InventoryTree): InventoryTree[] =>
    node.children?.filter((node) => node.kind === 'VM') || [];
  return Array.from(
    new Set(
      nodes.flatMap((node) => {
        // Only include direct children of nodes in the folder tree so we can exclude subfolders
        if (
          node.kind === 'Folder' ||
          (treeType === InventoryTreeType.VM && node.kind === 'Datacenter')
        ) {
          return getDirectVMChildren(node);
        }
        // Otherwise, we might have VMs under hidden descendants like hosts
        return indexedTree.getDescendants(node).flatMap(getDirectVMChildren);
      })
    )
  );
};

export const getAvailableVMs = (
  indexedTree: IndexedTree | undefined,
  selectedTreeNodes: InventoryTree[],
  indexedVMs: IndexedSourceVMs | undefined,
  treeType: InventoryTreeType,
  includeExtraVMs: SourceVM[] = []
): SourceVM[] => {
  if (!indexedTree) return [];
  const treeVMNodes = getAllVMChildren(indexedTree, selectedTreeNodes, treeType);
  const vmSelfLinks = treeVMNodes.flatMap(({ object }) => (object ? [object.selfLink] : []));
  const matchingVMs = indexedVMs?.findVMsBySelfLinks(vmSelfLinks) || [];
  return [
    ...includeExtraVMs,
    ...matchingVMs?.filter((vm) => !includeExtraVMs.some((extraVM) => vm.id === extraVM.id)),
  ];
};

export interface IVMTreePathInfo {
  datacenter: ICommonTreeObject | null;
  cluster: ICommonTreeObject | null;
  host: ICommonTreeObject | null;
  folders: ICommonTreeObject[] | null;
  folderPathStr: string | null;
}

export const getVMTreePathInfo = (
  vmSelfLink: string,
  hostTree?: IndexedTree<IInventoryHostTree>,
  vmTree?: IndexedTree<IVMwareFolderTree>
): IVMTreePathInfo => {
  const hostTreePath = hostTree?.pathsBySelfLink[vmSelfLink];
  const vmTreePath = vmTree?.pathsBySelfLink[vmSelfLink];
  if (!hostTreePath) {
    return {
      datacenter: null,
      cluster: null,
      host: null,
      folders: null,
      folderPathStr: null,
    };
  }
  let folders: ICommonTreeObject[] = [];
  if (vmTreePath) {
    folders =
      (vmTreePath
        ?.filter((node) => !!node && node.kind === 'Folder')
        .map((node) => node.object) as ICommonTreeObject[]) || null;
  }
  return {
    datacenter: hostTreePath?.find((node) => node.kind === 'Datacenter')?.object || null,
    cluster: hostTreePath?.find((node) => node.kind === 'Cluster')?.object || null,
    host: hostTreePath?.find((node) => node.kind === 'Host')?.object || null,
    folders,
    folderPathStr: folders?.map((folder) => folder.name).join('/') || null,
  };
};

export const findMatchingSelectableNode = (
  indexedTree: IndexedTree,
  vmSelfLink: string,
  isNodeSelectable: (node: InventoryTree) => boolean
): InventoryTree | null => {
  const matchingPath = indexedTree.pathsBySelfLink[vmSelfLink];
  const matchingNode = matchingPath?.slice().reverse().find(isNodeSelectable);
  return matchingNode || null;
};

export const findMatchingSelectableNodeAndDescendants = (
  indexedTree: IndexedTree,
  vmSelfLink: string,
  isNodeSelectable: (node: InventoryTree) => boolean
): InventoryTree[] => {
  const matchingNode = findMatchingSelectableNode(indexedTree, vmSelfLink, isNodeSelectable);
  if (!matchingNode) return [];
  return indexedTree.getDescendants(matchingNode);
};

export const findNodesMatchingSelectedVMs = (
  indexedTree: IndexedTree,
  selectedVMs: SourceVM[],
  isNodeSelectable: (node: InventoryTree) => boolean
): InventoryTree[] =>
  Array.from(
    new Set(
      selectedVMs
        .map((vm) => findMatchingSelectableNode(indexedTree, vm.selfLink, isNodeSelectable))
        .filter((node) => !!node) as InventoryTree[]
    )
  );

export const filterSourcesBySelectedVMs = (
  availableSources: MappingSource[],
  selectedVMs: SourceVM[],
  mappingType: MappingType,
  sourceProviderType: ProviderType
): MappingSource[] => {
  const sourceIds = Array.from(
    new Set(
      selectedVMs.flatMap((vm) => {
        if (mappingType === MappingType.Network) {
          if (sourceProviderType === 'vsphere') {
            return (vm as IVMwareVM).networks.map((network) => network.id);
          }
          if (sourceProviderType === 'ovirt') {
            return (vm as IRHVVM).nics.map((nic) => nic.profile.network);
          }
        }
        if (mappingType === MappingType.Storage) {
          if (sourceProviderType === 'vsphere') {
            return (vm as IVMwareVM).disks.map((disk) => disk.datastore.id);
          }
          if (sourceProviderType === 'ovirt') {
            return (vm as IRHVVM).diskAttachments.map((da) => da.disk.storageDomain);
          }
        }
        return [];
      })
    )
  );
  return availableSources.filter((source) => sourceIds.includes(source.id));
};

export const warmCriticalConcerns = ['Changed Block Tracking (CBT) not enabled'];

export const getMostSevereVMConcern = (vm: SourceVM): ISourceVMConcern | null => {
  if (!vm.concerns || vm.concerns.length === 0) {
    return null;
  }
  const critical = vm.concerns.find((concern) => concern.category === 'Critical');
  const warning = vm.concerns.find((concern) => concern.category === 'Warning');
  const advisory = vm.concerns.find(
    (concern) => concern.category === 'Information' || concern.category === 'Advisory'
  );
  if (critical) return critical;
  if (warning) return warning;
  if (advisory) return advisory;
  // Default to warning if an unexpected severity is found
  return { category: 'Warning', label: 'Unknown', assessment: '' };
};

export const getVMConcernStatusType = (concern: ISourceVMConcern | null): StatusType | null =>
  !concern
    ? 'Ok'
    : concern.category === 'Critical'
    ? 'Error'
    : concern.category === 'Warning'
    ? 'Warning'
    : concern.category === 'Information' || concern.category === 'Advisory'
    ? 'Info'
    : null;

export const getVMConcernStatusLabel = (concern: ISourceVMConcern | null): string =>
  concern?.category === 'Information' || concern?.category === 'Advisory'
    ? 'Advisory'
    : concern?.category || 'Ok';

export const someVMHasConcern = (vms: SourceVM[], concernLabel: string): boolean =>
  vms.some((vm) => vm.concerns.some((concern) => concern.label === concernLabel));

export interface IGenerateMappingsArgs {
  forms: PlanWizardFormState;
  generateName?: string;
  owner?: IPlan;
}

export const generateMappings = ({
  forms,
  generateName,
  owner,
}: IGenerateMappingsArgs): {
  networkMapping: INetworkMapping | null;
  storageMapping: IStorageMapping | null;
} => {
  const { sourceProvider, targetProvider } = forms.general.values;
  const existingMappingRefs = owner?.spec.map;
  const networkMapping =
    sourceProvider && targetProvider
      ? (getMappingFromBuilderItems({
          mappingType: MappingType.Network,
          mappingName:
            existingMappingRefs?.network.name || forms.networkMapping.values.newMappingName || null,
          generateName: generateName || null,
          owner,
          sourceProvider,
          targetProvider,
          builderItems: forms.networkMapping.values.builderItems,
        }) as INetworkMapping)
      : null;
  const storageMapping =
    sourceProvider && targetProvider
      ? (getMappingFromBuilderItems({
          mappingType: MappingType.Storage,
          mappingName:
            existingMappingRefs?.storage.name || forms.storageMapping.values.newMappingName || null,
          generateName: generateName || null,
          owner,
          sourceProvider,
          targetProvider,
          builderItems: forms.storageMapping.values.builderItems,
        }) as IStorageMapping)
      : null;
  return { networkMapping, storageMapping };
};

interface IHookRef {
  ref: INameNamespaceRef;
  instance: PlanHookInstance;
}

export const generatePlan = (
  forms: PlanWizardFormState,
  networkMappingRef: INameNamespaceRef,
  storageMappingRef: INameNamespaceRef,
  hooksRef?: IHookRef[]
): IPlan => ({
  apiVersion: CLUSTER_API_VERSION,
  kind: 'Plan',
  metadata: {
    name: forms.general.values.planName,
    namespace: META.namespace,
  },
  spec: {
    description: forms.general.values.planDescription,
    provider: {
      source: nameAndNamespace(forms.general.values.sourceProvider),
      destination: nameAndNamespace(forms.general.values.targetProvider),
    },
    targetNamespace: forms.general.values.targetNamespace,
    // Note: This assumes we will only ever allow migration networks that are in the target namespace.
    //       We may want to store migrationNetwork name/namespace in form state instead of just name.
    transferNetwork: forms.general.values.migrationNetwork
      ? {
          name: forms.general.values.migrationNetwork,
          namespace: forms.general.values.targetNamespace,
        }
      : null,
    map: {
      network: networkMappingRef,
      storage: storageMappingRef,
    },
    vms: hooksRef
      ? forms.selectVMs.values.selectedVMIds.map((id) => ({
          id,
          hooks: hooksRef.map((hookRef) => ({ hook: hookRef.ref, step: hookRef.instance.step })),
        }))
      : forms.selectVMs.values.selectedVMIds.map((id) => ({ id })),
    warm: forms.type.values.type === 'Warm',
  },
});

export const getSelectedVMsFromPlan = (
  planBeingEdited: IPlan | null,
  indexedVMs: IndexedSourceVMs | undefined
): SourceVM[] => {
  if (!planBeingEdited || !indexedVMs) return [];
  return indexedVMs.findVMsByIds(planBeingEdited?.spec.vms.map(({ id }) => id));
};

interface IEditingPrefillResults {
  prefillQueryStatus: QueryStatus;
  prefillQueryError: unknown;
  isDonePrefilling: boolean;
  prefillQueries: UseQueryResult<unknown>[];
  prefillErrorTitles: string[];
}

export const useEditingPlanPrefillEffect = (
  forms: PlanWizardFormState,
  planBeingEdited: IPlan | null,
  isEditMode: boolean
): IEditingPrefillResults => {
  const providersQuery = useInventoryProvidersQuery();
  const { sourceProvider, targetProvider } = findProvidersByRefs(
    planBeingEdited?.spec.provider || null,
    providersQuery
  );
  const vmsQuery = useSourceVMsQuery(sourceProvider);
  const hostTreeQuery = useInventoryTreeQuery(sourceProvider, InventoryTreeType.Cluster);

  const networkMappingResourceQueries = useMappingResourceQueries(
    sourceProvider,
    targetProvider,
    MappingType.Network
  );
  const storageMappingResourceQueries = useMappingResourceQueries(
    sourceProvider,
    targetProvider,
    MappingType.Storage
  );

  const networkMappingsQuery = useMappingsQuery(MappingType.Network);
  const storageMappingsQuery = useMappingsQuery(MappingType.Storage);

  const hooksQuery = useHooksQuery();

  const queries = [
    providersQuery,
    vmsQuery,
    hostTreeQuery,
    ...networkMappingResourceQueries.queries,
    ...storageMappingResourceQueries.queries,
    networkMappingsQuery,
    storageMappingsQuery,
    hooksQuery,
  ];
  const errorTitles = [
    'Error loading providers',
    'Error loading VMs',
    'Error loading inventory tree data',
    'Error loading source networks',
    'Error loading target networks',
    'Error loading source storages',
    'Error loading target storage classes',
    'Error loading network mappings',
    'Error loading storage mappings',
    'Error loading hooks',
  ];

  const queryStatus = getAggregateQueryStatus(queries);
  const queryError = getFirstQueryError(queries);

  const [isStartedPrefilling, setIsStartedPrefilling] = React.useState(false);
  const [isDonePrefilling, setIsDonePrefilling] = React.useState(!isEditMode);

  const defaultTreeType = InventoryTreeType.Cluster;
  const isNodeSelectable = useIsNodeSelectableCallback(defaultTreeType);

  React.useEffect(() => {
    if (
      !isStartedPrefilling &&
      queryStatus === 'success' &&
      planBeingEdited &&
      hostTreeQuery.data
    ) {
      setIsStartedPrefilling(true);
      const selectedVMs = getSelectedVMsFromPlan(planBeingEdited, vmsQuery.data);
      const selectedTreeNodes = findNodesMatchingSelectedVMs(
        hostTreeQuery.data,
        selectedVMs,
        isNodeSelectable
      );
      const networkMapping = networkMappingsQuery.data?.items.find((mapping) =>
        isSameResource(mapping.metadata, planBeingEdited.spec.map.network)
      );
      const storageMapping = storageMappingsQuery.data?.items.find((mapping) =>
        isSameResource(mapping.metadata, planBeingEdited.spec.map.storage)
      );

      forms.general.fields.planName.prefill(planBeingEdited.metadata.name);
      if (planBeingEdited.spec.description) {
        forms.general.fields.planDescription.prefill(planBeingEdited.spec.description);
      }
      forms.general.fields.sourceProvider.prefill(sourceProvider);
      forms.general.fields.targetProvider.prefill(targetProvider);
      forms.general.fields.targetNamespace.prefill(planBeingEdited.spec.targetNamespace);
      forms.general.fields.migrationNetwork.prefill(
        planBeingEdited.spec.transferNetwork?.name || null
      );

      forms.filterVMs.fields.treeType.prefill(defaultTreeType);
      forms.filterVMs.fields.selectedTreeNodes.prefill(selectedTreeNodes);
      forms.filterVMs.fields.isPrefilled.prefill(true);

      forms.selectVMs.fields.selectedVMIds.prefill(selectedVMs.map((vm) => vm.id));

      forms.networkMapping.fields.builderItems.prefill(
        getBuilderItemsWithMissingSources(
          getBuilderItemsFromMappingItems(
            networkMapping?.spec.map || [],
            MappingType.Network,
            networkMappingResourceQueries.availableSources,
            networkMappingResourceQueries.availableTargets
          ),
          networkMappingResourceQueries,
          selectedVMs,
          MappingType.Network,
          sourceProvider?.type || 'vsphere',
          false
        )
      );
      forms.networkMapping.fields.isPrefilled.prefill(true);

      forms.storageMapping.fields.builderItems.prefill(
        getBuilderItemsWithMissingSources(
          getBuilderItemsFromMappingItems(
            storageMapping?.spec.map || [],
            MappingType.Storage,
            storageMappingResourceQueries.availableSources,
            storageMappingResourceQueries.availableTargets
          ),
          storageMappingResourceQueries,
          selectedVMs,
          MappingType.Storage,
          sourceProvider?.type || 'vsphere',
          false
        )
      );
      forms.storageMapping.fields.isPrefilled.prefill(true);

      forms.type.fields.type.prefill(planBeingEdited.spec.warm ? 'Warm' : 'Cold');

      forms.hooks.fields.instances.prefill(getPlanHookFormInstances(planBeingEdited, hooksQuery));

      // Wait for effects to run based on field changes first
      window.setTimeout(() => {
        setIsDonePrefilling(true);
      }, 0);
    }
  }, [
    isStartedPrefilling,
    queryStatus,
    forms,
    planBeingEdited,
    sourceProvider,
    targetProvider,
    networkMappingResourceQueries,
    storageMappingResourceQueries,
    vmsQuery,
    hostTreeQuery,
    networkMappingsQuery,
    storageMappingsQuery,
    hooksQuery,
    defaultTreeType,
    isNodeSelectable,
  ]);

  return {
    prefillQueryStatus: queryStatus,
    prefillQueryError: queryError,
    isDonePrefilling,
    prefillQueries: queries,
    prefillErrorTitles: errorTitles,
  };
};

export const concernMatchesFilter = (concern: ISourceVMConcern, filterText?: string): boolean =>
  !!filterText &&
  `${concern.label}: ${concern.assessment}`.toLowerCase().indexOf(filterText.toLowerCase()) !== -1;

export const vmMatchesConcernFilter = (vm: SourceVM, filterText?: string): boolean =>
  !!filterText && vm.concerns.some((concern) => concernMatchesFilter(concern, filterText));

export const generateHook = (
  instance: PlanHookInstance,
  existingHook: INameNamespaceRef | null,
  generateName?: string,
  owner?: IPlan
): IHook => ({
  apiVersion: CLUSTER_API_VERSION,
  kind: 'Hook',
  metadata: {
    ...(existingHook ? { name: existingHook.name } : { generateName: generateName || '' }),
    namespace: META.namespace,
    ...(owner ? { ownerReferences: [getObjectRef(owner)] } : {}),
  },
  spec: {
    ...(instance.type === 'playbook'
      ? { playbook: btoa(instance.playbook), image: 'quay.io/konveyor/hook-runner:latest' }
      : { image: instance.image }),
  },
});

export const getPlanHookFormInstances = (
  plan: IPlan,
  hooksQuery: UseQueryResult<IKubeList<IHook>>
): PlanHookInstance[] => {
  if (plan.spec.vms.length === 0) return [];
  const planHookRefs = plan.spec.vms[0].hooks || [];
  const hooksAllMatch = plan.spec.vms.every(
    (vm) =>
      (vm.hooks || []).length === planHookRefs.length &&
      (vm.hooks || []).every(
        (planHookRef) => !!planHookRefs.find((ref) => isSameResource(ref.hook, planHookRef.hook))
      )
  );
  if (!hooksAllMatch) {
    alert(`
      WARNING: This plan is not using the same hooks on all VMs.
      The API supports arbitrary hooks for each VM, but the UI only supports one set of hooks for all VMs.
      The hooks from the first VM in the plan will be used, and other hooks will be lost.
    `);
  }
  const instances: PlanHookInstance[] = [];
  planHookRefs.forEach((planHookRef) => {
    const matchingHook = (hooksQuery.data?.items || []).find((hook) => {
      return isSameResource(hook.metadata, planHookRef.hook);
    });

    if (matchingHook) {
      instances.push({
        step: planHookRef.step,
        type: matchingHook.spec.playbook ? 'playbook' : 'image',
        playbook: atob(matchingHook.spec.playbook || ''),
        image: matchingHook.spec.playbook ? '' : matchingHook.spec.image || '',
        prefilledFromHook: matchingHook,
      });
    }
  });

  return instances;
};
