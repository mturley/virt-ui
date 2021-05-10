import * as React from 'react';
import {
  Dropdown,
  KebabToggle,
  DropdownItem,
  DropdownPosition,
  Modal,
  Button,
} from '@patternfly/react-core';
import { useHistory } from 'react-router-dom';

import { IPlan } from '@app/queries/types';
import { PlanStatusType } from '@app/common/constants';
import { hasCondition } from '@app/common/helpers';
import { useClusterProvidersQuery, useDeletePlanMutation } from '@app/queries';
import ConfirmModal from '@app/common/components/ConfirmModal';
import ConditionalTooltip from '@app/common/components/ConditionalTooltip';
import { areAssociatedProvidersReady } from '@app/queries/helpers';
import PlanDetails from './PlanDetails';

interface IPlansActionDropdownProps {
  plan: IPlan;
}

const PlansActionsDropdown: React.FunctionComponent<IPlansActionDropdownProps> = ({
  plan,
}: IPlansActionDropdownProps) => {
  const [kebabIsOpen, setKebabIsOpen] = React.useState(false);
  const [isDeleteModalOpen, toggleDeleteModal] = React.useReducer((isOpen) => !isOpen, false);
  const [isDetailsModalOpen, toggleDetailsModal] = React.useReducer((isOpen) => !isOpen, false);
  const [deletePlan, deletePlanResult] = useDeletePlanMutation(toggleDeleteModal);
  const history = useHistory();
  const conditions = plan.status?.conditions || [];
  const clusterProvidersQuery = useClusterProvidersQuery();
  const areProvidersReady = React.useMemo(
    () => kebabIsOpen && areAssociatedProvidersReady(clusterProvidersQuery, plan.spec.provider),
    [kebabIsOpen, clusterProvidersQuery, plan.spec.provider]
  );
  const isPlanStarted = !!plan.status?.migration?.started;
  return (
    <>
      <Dropdown
        aria-label="Actions"
        toggle={<KebabToggle onToggle={() => setKebabIsOpen(!kebabIsOpen)} />}
        isOpen={kebabIsOpen}
        isPlain
        dropdownItems={[
          <ConditionalTooltip
            key="edit"
            isTooltipEnabled={isPlanStarted || !areProvidersReady}
            content={
              isPlanStarted
                ? 'This plan cannot be edited because it has been started'
                : !areProvidersReady
                ? 'This plan cannot be edited because the inventory data for its associated providers is not ready'
                : ''
            }
          >
            <DropdownItem
              isDisabled={isPlanStarted || !areProvidersReady}
              onClick={() => {
                setKebabIsOpen(false);
                history.push(`/plans/${plan.metadata.name}/edit`);
              }}
            >
              Edit
            </DropdownItem>
          </ConditionalTooltip>,
          <ConditionalTooltip
            key="Delete"
            isTooltipEnabled={
              hasCondition(conditions, PlanStatusType.Executing) || deletePlanResult.isLoading
            }
            content={
              hasCondition(conditions, PlanStatusType.Executing)
                ? 'This plan cannot be deleted because it is running'
                : deletePlanResult.isLoading
                ? 'This plan cannot be deleted because it is deleting'
                : ''
            }
          >
            <DropdownItem
              isDisabled={
                hasCondition(conditions, PlanStatusType.Executing) || deletePlanResult.isLoading
              }
              onClick={() => {
                setKebabIsOpen(false);
                toggleDeleteModal();
              }}
            >
              Delete
            </DropdownItem>
          </ConditionalTooltip>,
          <DropdownItem
            key="Details"
            onClick={() => {
              setKebabIsOpen(false);
              toggleDetailsModal();
            }}
          >
            View details
          </DropdownItem>,
        ]}
        position={DropdownPosition.right}
      />
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        toggleOpen={toggleDeleteModal}
        mutateFn={() => deletePlan(plan)}
        mutateResult={deletePlanResult}
        title="Delete migration plan"
        confirmButtonText="Delete"
        body={
          <>
            Are you sure you want to delete the migration plan &quot;
            <strong>{plan.metadata.name}</strong>&quot;?
          </>
        }
        errorText="Error deleting plan"
      />
      <Modal
        variant="medium"
        title="Plans details"
        isOpen={isDetailsModalOpen}
        onClose={toggleDetailsModal}
        actions={[
          <Button key="close" variant="primary" onClick={toggleDetailsModal}>
            Close
          </Button>,
        ]}
      >
        <PlanDetails plan={plan} />
      </Modal>
    </>
  );
};

export default PlansActionsDropdown;
