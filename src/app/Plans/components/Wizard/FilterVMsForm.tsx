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
  findMatchingSelectableDescendants,
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
  console.log('--- starting render');
  usePausedPollingEffect();

  const [searchText, setSearchText] = React.useState('');

  const vmsQuery = useSourceVMsQuery(sourceProvider);
  const treeQuery = useInventoryTreeQuery(sourceProvider, form.values.treeType);

  const isNodeSelectable = useIsNodeSelectableCallback(form.values.treeType);

  const treeSelection = useSelectionState({
    items: treeQuery.data?.flattenedNodes.filter(isNodeSelectable) || [],
    externalState: [form.fields.selectedTreeNodes.value, form.fields.selectedTreeNodes.setValue],
    isEqual: (a: InventoryTree, b: InventoryTree) => a.object?.selfLink === b.object?.selfLink,
  });

  console.log('   - useSelectionState called');

  const isFirstRender = React.useRef(true);
  const lastTreeType = React.useRef(form.values.treeType);
  React.useEffect(() => {
    // Clear or reset selection when the tree type tab changes
    const treeTypeChanged = form.values.treeType !== lastTreeType.current;
    if (!isFirstRender.current && treeTypeChanged) {
      console.log('   - clearing/resetting things in the tree?');
      if (!planBeingEdited || !form.values.isPrefilled) {
        treeSelection.selectAll(false);
        lastTreeType.current = form.values.treeType;
      } else if (vmsQuery.isSuccess && treeQuery.isSuccess) {
        const selectedVMs = getSelectedVMsFromPlan(planBeingEdited, vmsQuery.data);
        const selectedTreeNodes = findNodesMatchingSelectedVMs(
          treeQuery.data,
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

  console.log('   - useEffect called');

  const getNodeBadgeContent = (node: InventoryTree, isRootNode: boolean) => {
    console.log('   - getting node badge content', node);
    if (!treeQuery.data) return null;
    const { treeType } = form.values;
    const { isItemSelected, selectedItems } = treeSelection;
    console.log('   - === getting selected descendants');
    const selectedDescendants = treeQuery.data.getDescendants(node, true).filter(isItemSelected);
    console.log('   - === ...done getting selected descendants');
    console.log('   - === getting available VMs');
    const numVMs = getAvailableVMs(
      treeQuery.data,
      selectedDescendants,
      vmsQuery.data,
      treeType
    ).length;
    console.log('   - === ...done getting available VMs');
    const rootNodeSuffix = ` VM${numVMs !== 1 ? 's' : ''}`;
    if (numVMs || isItemSelected(node) || (isRootNode && selectedItems.length > 0)) {
      return `${numVMs}${isRootNode ? rootNodeSuffix : ''}`;
    }
    console.log('   - ...done getting node badge content', node);
    return null;
  };

  const treeViewData = filterAndConvertInventoryTree(
    treeQuery.data || null,
    searchText,
    treeSelection.isItemSelected,
    treeSelection.areAllSelected,
    isNodeSelectable,
    getNodeBadgeContent
  );

  console.log('--- ...done rendering');

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
        results={[vmsQuery, treeQuery]}
        errorTitles={['Error loading VMs', 'Error loading inventory tree data']}
        emptyStateBody={LONG_LOADING_MESSAGE}
      >
        <TreeView
          data={treeViewData}
          defaultAllExpanded
          hasChecks
          hasBadges
          onSearch={(event) => setSearchText(event.target.value)}
          onCheck={(_event, treeViewItem) => {
            console.log('handling selection');
            if (treeViewItem.id === 'converted-root') {
              treeSelection.selectAll(!treeSelection.areAllSelected);
            } else if (treeQuery.data) {
              const matchingPath = treeQuery.data.pathsBySelfLink[treeViewItem.id || ''];
              if (matchingPath) {
                const matchingNode = matchingPath[matchingPath.length - 1];
                const isFullyChecked = isNodeFullyChecked(
                  treeQuery.data,
                  matchingNode,
                  treeSelection.isItemSelected,
                  isNodeSelectable
                );
                const nodesToSelect = findMatchingSelectableDescendants(
                  treeQuery.data,
                  matchingNode,
                  isNodeSelectable
                );
                if (nodesToSelect.length > 0) {
                  treeSelection.selectMultiple(nodesToSelect, !isFullyChecked);
                }
              }
            }
            console.log('...done handling selection');
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
