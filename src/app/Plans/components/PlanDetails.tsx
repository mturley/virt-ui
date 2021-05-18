import * as React from 'react';
import { Grid, GridItem, Popover, Button, List, Text } from '@patternfly/react-core';
import spacing from '@patternfly/react-styles/css/utilities/Spacing/spacing';

import MappingDetailView from '@app/Mappings/components/MappingDetailView';
import { IPlan, MappingType, POD_NETWORK } from '@app/queries/types';
import { useMappingsQuery } from '@app/queries';
import { usePausedPollingEffect } from '@app/common/context';
import MappingStatus from '@app/Mappings/components/MappingStatus';

interface IPlanDetailsProps {
  plan: IPlan;
}

const PlanDetails: React.FunctionComponent<IPlanDetailsProps> = ({ plan }: IPlanDetailsProps) => {
  usePausedPollingEffect();

  const networkMappings = useMappingsQuery(MappingType.Network);

  const networkMapping =
    networkMappings.data?.items.find(
      (mapping) => mapping.metadata.name === plan.spec.map.network.name
    ) || null;

  const storageMappings = useMappingsQuery(MappingType.Storage);

  const storageMapping =
    storageMappings.data?.items.find(
      (mapping) => mapping.metadata.name === plan.spec.map.storage.name
    ) || null;

  console.log(plan);
  console.log(storageMapping);
  return (
    <Grid hasGutter className={`${spacing.mtSm} ${spacing.mbMd}`}>
      <GridItem md={12}></GridItem>
      <GridItem md={3}>Plan name</GridItem>
      <GridItem md={9} id="review-plan-name">
        {plan.metadata.name}
      </GridItem>
      {plan.spec.description ? (
        <>
          <GridItem md={3} id="plan-description-label">
            Plan description
          </GridItem>
          <GridItem md={9} id="review-plan-description" aria-labelledby="plan-description-label">
            {plan.spec.description}
          </GridItem>
        </>
      ) : null}
      <GridItem md={3} id="source-provider-label">
        Source provider
      </GridItem>
      <GridItem md={9} id="review-source-provider" aria-labelledby="source-provider-label">
        {plan.spec.provider.source.name}
      </GridItem>
      <GridItem md={3} id="target-provider-label">
        Target provider
      </GridItem>
      <GridItem md={9} id="review-target-provider" aria-labelledby="target-provider-label">
        {plan.spec.provider.destination.name}
      </GridItem>
      <GridItem md={3} id="target-namespace-label">
        Target namespace
      </GridItem>
      <GridItem md={9}>
        <span id="review-target-namespace" aria-labelledby="target-namespace-label">
          {plan.spec.targetNamespace}
        </span>
      </GridItem>
      <GridItem md={3} id="transfer-network-label">
        Migration transfer network
      </GridItem>
      <GridItem md={9} id="review-transfer-network" aria-labelledby="transfer-network-label">
        {plan.spec.transferNetwork || POD_NETWORK.name}
      </GridItem>
      <GridItem md={3}>Selected VMs</GridItem>
      <GridItem md={9}>
        <Popover
          headerContent={<div>Selected VMs</div>}
          bodyContent={
            <List id="review-selected-vms-list">
              {plan.spec.vms.map((vm, index) => (
                <li key={index}>{vm.id}</li>
              ))}
            </List>
          }
        >
          <Button variant="link" isInline id="review-selected-vms-count">
            {plan.spec.vms.length}
          </Button>
        </Popover>
      </GridItem>
      <GridItem md={3} id="network-mapping-label">
        Network mapping{' '}
        {networkMapping ? (
          <MappingStatus
            mappingType={MappingType.Network}
            mapping={networkMapping}
            isLabel={false}
          />
        ) : null}
      </GridItem>
      <GridItem md={9} id="review-network-mapping" aria-labelledby="network-mapping-label">
        <MappingDetailView mappingType={MappingType.Network} mapping={networkMapping} />
      </GridItem>
      <GridItem md={3} id="storage-mapping-label">
        Storage mapping{' '}
        {storageMapping ? (
          <MappingStatus
            mappingType={MappingType.Storage}
            mapping={storageMapping}
            isLabel={false}
          />
        ) : null}
      </GridItem>
      <GridItem md={9} id="review-storage-mapping" aria-labelledby="storage-mapping-label">
        <MappingDetailView mappingType={MappingType.Storage} mapping={storageMapping} />
      </GridItem>
      <GridItem md={3} id="migration-type-label">
        Migration type
      </GridItem>
      <GridItem md={9} id="review-migration-type" aria-labelledby="migration-type-label">
        {plan.spec.warm ? 'warm' : 'cold'}
      </GridItem>
    </Grid>
  );
};

export default PlanDetails;
