import * as React from 'react';
import { TreeView, Tabs, Tab, TabTitleText, TextContent, Text } from '@patternfly/react-core';
import spacing from '@patternfly/react-styles/css/utilities/Spacing/spacing';
import { useSelectionState } from '@konveyor/lib-ui';
import { useInventoryTreeQuery, useSourceVMsQuery } from '@app/queries';
import {
  IPlan,
  SourceInventoryProvider,
  InventoryTree,
  InventoryTreeType,
} from '@app/queries/types';
import {
  filterAndConvertInventoryTree,
  findMatchingSelectableNode,
  findMatchingSelectableNodeAndDescendants,
  findNodesMatchingSelectedVMs,
  getAvailableVMs,
  getSelectedVMsFromPlan,
  isNodeFullyChecked,
  useIsNodeSelectableCallback,
} from './helpers';
import { PlanWizardFormState } from './PlanWizard';

import { ResolvedQueries } from '@app/common/components/ResolvedQuery';
import { usePausedPollingEffect } from '@app/common/context';
import { LONG_LOADING_MESSAGE } from '@app/queries/constants';

interface IFilterVMsFormProps {
  form: PlanWizardFormState['filterVMs'];
  sourceProvider: SourceInventoryProvider | null;
  planBeingEdited: IPlan | null;
}

const FilterVMsForm: React.FunctionComponent<IFilterVMsFormProps> = ({
  form,
  sourceProvider,
  planBeingEdited,
}: IFilterVMsFormProps) => {
  usePausedPollingEffect();

  const [searchText, setSearchText] = React.useState('');

  const vmsQuery = useSourceVMsQuery(sourceProvider);
  const treeQuery = useInventoryTreeQuery(sourceProvider, form.values.treeType);

  const isNodeSelectable = useIsNodeSelectableCallback(form.values.treeType);

  const treeSelection = useSelectionState({
    items: treeQuery.indexedData?.flattenedNodes.filter(isNodeSelectable) || [],
    externalState: [form.fields.selectedTreeNodes.value, form.fields.selectedTreeNodes.setValue],
    isEqual: (a: InventoryTree, b: InventoryTree) => a.object?.selfLink === b.object?.selfLink,
  });

  const isFirstRender = React.useRef(true);
  const lastTreeType = React.useRef(form.values.treeType);
  React.useEffect(() => {
    // Clear or reset selection when the tree type tab changes
    const treeTypeChanged = form.values.treeType !== lastTreeType.current;
    if (!isFirstRender.current && treeTypeChanged) {
      if (!planBeingEdited || !form.values.isPrefilled) {
        treeSelection.selectAll(false);
        lastTreeType.current = form.values.treeType;
      } else if (vmsQuery.result.isSuccess && treeQuery.result.isSuccess && treeQuery.indexedData) {
        const selectedVMs = getSelectedVMsFromPlan(planBeingEdited, vmsQuery.indexedData);
        const selectedTreeNodes = findNodesMatchingSelectedVMs(
          treeQuery.indexedData,
          selectedVMs,
          isNodeSelectable
        );
        treeSelection.setSelectedItems(selectedTreeNodes);
        lastTreeType.current = form.values.treeType;
      }
    }
    isFirstRender.current = false;
  }, [
    form.values.treeType,
    form.values.isPrefilled,
    planBeingEdited,
    treeQuery,
    vmsQuery,
    treeSelection,
    isNodeSelectable,
  ]);

  const getNodeBadgeContent = (node: InventoryTree, isRootNode: boolean) => {
    if (!treeQuery.indexedData) return null;
    const { treeType } = form.values;
    const { isItemSelected, selectedItems } = treeSelection;
    const selectedDescendants = treeQuery.indexedData.getDescendants(node).filter(isItemSelected);
    const numVMs = getAvailableVMs(
      treeQuery.indexedData,
      selectedDescendants,
      vmsQuery.indexedData,
      treeType
    ).length;
    const rootNodeSuffix = ` VM${numVMs !== 1 ? 's' : ''}`;
    if (numVMs || isItemSelected(node) || (isRootNode && selectedItems.length > 0)) {
      return `${numVMs}${isRootNode ? rootNodeSuffix : ''}`;
    }
    return null;
  };

  return (
    <div className="plan-wizard-filter-vms-form">
      <TextContent>
        <Text component="p">
          Refine the list of VMs selectable for migration by clusters
          {sourceProvider?.type === 'vsphere' ? ' or by folders' : ''}.
        </Text>
      </TextContent>
      {sourceProvider?.type === 'vsphere' ? (
        <Tabs
          activeKey={form.values.treeType}
          onSelect={(_event, tabKey) => form.fields.treeType.setValue(tabKey as InventoryTreeType)}
          className={spacing.mtMd}
        >
          <Tab
            key={InventoryTreeType.Cluster}
            eventKey={InventoryTreeType.Cluster}
            title={<TabTitleText>By clusters</TabTitleText>}
          />
          <Tab
            key={InventoryTreeType.VM}
            eventKey={InventoryTreeType.VM}
            title={<TabTitleText>By folders</TabTitleText>}
          />
        </Tabs>
      ) : null}
      <ResolvedQueries
        results={[vmsQuery.result, treeQuery.result]}
        errorTitles={['Error loading VMs', 'Error loading inventory tree data']}
        emptyStateBody={LONG_LOADING_MESSAGE}
      >
        <TreeView
          data={filterAndConvertInventoryTree(
            treeQuery.indexedData || null,
            searchText,
            treeSelection.isItemSelected,
            treeSelection.areAllSelected,
            isNodeSelectable,
            getNodeBadgeContent
          )}
          defaultAllExpanded
          hasChecks
          hasBadges
          onSearch={(event) => setSearchText(event.target.value)}
          onCheck={(_event, treeViewItem) => {
            if (treeViewItem.id === 'converted-root') {
              treeSelection.selectAll(!treeSelection.areAllSelected);
            } else if (treeQuery.indexedData) {
              const matchingNode = findMatchingSelectableNode(
                treeQuery.indexedData,
                treeViewItem.id || '',
                isNodeSelectable
              );
              const isFullyChecked = isNodeFullyChecked(
                treeQuery.indexedData,
                matchingNode,
                treeSelection.isItemSelected,
                isNodeSelectable
              );
              const nodesToSelect = findMatchingSelectableNodeAndDescendants(
                treeQuery.indexedData,
                treeViewItem.id || '',
                isNodeSelectable
              );
              if (nodesToSelect.length > 0) {
                treeSelection.selectMultiple(nodesToSelect, !isFullyChecked);
              }
            }
          }}
          searchProps={{
            id: 'inventory-search',
            name: 'search-inventory',
            'aria-label': 'Search inventory',
          }}
        />
      </ResolvedQueries>
    </div>
  );
};

export default FilterVMsForm;
