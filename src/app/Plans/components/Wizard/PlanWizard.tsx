import * as React from 'react';
import * as yup from 'yup';
import {
  Breadcrumb,
  BreadcrumbItem,
  Level,
  LevelItem,
  PageSection,
  Title,
  Wizard,
  WizardStep,
  WizardStepFunctionType,
} from '@patternfly/react-core';
import { Link, Prompt, Redirect, useHistory, useRouteMatch } from 'react-router-dom';
import { UseQueryResult } from 'react-query';
import spacing from '@patternfly/react-styles/css/utilities/Spacing/spacing';
import { useFormField, useFormState } from '@konveyor/lib-ui';

import WizardStepContainer from './WizardStepContainer';
import GeneralForm from './GeneralForm';
import FilterVMsForm from './FilterVMsForm';
import SelectVMsForm from './SelectVMsForm';
import MappingForm from './MappingForm';
import TypeForm from './TypeForm';
import HooksForm from './HooksForm';
import Review from './Review';
import {
  IOpenShiftProvider,
  IPlan,
  Mapping,
  MappingType,
  PlanType,
  SourceInventoryProvider,
  InventoryTree,
  InventoryTreeType,
} from '@app/queries/types';
import {
  IMappingBuilderItem,
  mappingBuilderItemsSchema,
} from '@app/Mappings/components/MappingBuilder';
import { generateMappings, useEditingPlanPrefillEffect } from './helpers';
import {
  getMappingNameSchema,
  useMappingsQuery,
  getPlanNameSchema,
  useCreatePlanMutation,
  usePatchPlanMutation,
  usePlansQuery,
  useCreateMappingMutations,
  useSourceVMsQuery,
} from '@app/queries';
import { getAggregateQueryStatus } from '@app/queries/helpers';
import { dnsLabelNameSchema } from '@app/common/constants';
import { IKubeList } from '@app/client/types';
import LoadingEmptyState from '@app/common/components/LoadingEmptyState';
import { ResolvedQueries } from '@app/common/components/ResolvedQuery';
import { PlanHookInstance } from './PlanAddEditHookModal';

import './PlanWizard.css';
import { LONG_LOADING_MESSAGE } from '@app/queries/constants';

const useMappingFormState = (mappingsQuery: UseQueryResult<IKubeList<Mapping>>) => {
  const isSaveNewMapping = useFormField(false, yup.boolean().required());
  const newMappingNameSchema = getMappingNameSchema(mappingsQuery, null).label('Name');
  return useFormState({
    isCreateMappingSelected: useFormField(false, yup.boolean().required()),
    selectedExistingMapping: useFormField<Mapping | null>(null, yup.mixed<Mapping | null>()),
    builderItems: useFormField<IMappingBuilderItem[]>([], mappingBuilderItemsSchema),
    isSaveNewMapping,
    newMappingName: useFormField(
      '',
      isSaveNewMapping.value ? newMappingNameSchema.required() : yup.string()
    ),
    isPrefilled: useFormField(false, yup.boolean()),
  });
};

const usePlanWizardFormState = (
  plansQuery: UseQueryResult<IKubeList<IPlan>>,
  networkMappingsQuery: UseQueryResult<IKubeList<Mapping>>,
  storageMappingsQuery: UseQueryResult<IKubeList<Mapping>>,
  planBeingEdited: IPlan | null
) => {
  const forms = {
    general: useFormState({
      planName: useFormField(
        '',
        getPlanNameSchema(plansQuery, planBeingEdited).label('Plan name').required()
      ),
      planDescription: useFormField('', yup.string().label('Plan description').defined()),
      sourceProvider: useFormField<SourceInventoryProvider | null>(
        null,
        yup.mixed<SourceInventoryProvider>().label('Source provider').required()
      ),
      targetProvider: useFormField<IOpenShiftProvider | null>(
        null,
        yup.mixed<IOpenShiftProvider>().label('Target provider').required()
      ),
      targetNamespace: useFormField('', dnsLabelNameSchema.label('Target namespace').required()),
      migrationNetwork: useFormField<string | null>(
        null,
        yup.mixed<string>().label('Migration network')
      ),
    }),
    filterVMs: useFormState({
      treeType: useFormField<InventoryTreeType>(
        InventoryTreeType.Cluster,
        yup.mixed<InventoryTreeType>()
      ),
      selectedTreeNodes: useFormField<InventoryTree[]>(
        [],
        yup.array<InventoryTree>().required().min(1)
      ),
      isPrefilled: useFormField(false, yup.boolean()),
    }),
    selectVMs: useFormState({
      selectedVMIds: useFormField<string[]>(
        [],
        yup.array(yup.string().default('')).required().min(1)
      ),
    }),
    networkMapping: useMappingFormState(networkMappingsQuery),
    storageMapping: useMappingFormState(storageMappingsQuery),
    type: useFormState({
      type: useFormField<PlanType>('Cold', yup.mixed().oneOf(['Cold', 'Warm']).required()),
    }),
    hooks: useFormState({
      instances: useFormField<PlanHookInstance[]>([], yup.array<PlanHookInstance>()),
    }),
  };

  return {
    ...forms,
    isSomeFormDirty: (Object.keys(forms) as (keyof typeof forms)[]).some(
      (key) => forms[key].isDirty
    ),
  };
};

export type PlanWizardFormState = ReturnType<typeof usePlanWizardFormState>; // ✨ Magic

const PlanWizard: React.FunctionComponent = () => {
  const history = useHistory();
  const plansQuery = usePlansQuery();
  const networkMappingsQuery = useMappingsQuery(MappingType.Network);
  const storageMappingsQuery = useMappingsQuery(MappingType.Storage);

  const editRouteMatch = useRouteMatch<{ planName: string }>({
    path: '/plans/:planName/edit',
    strict: true,
    sensitive: true,
  });
  const planBeingEdited =
    plansQuery.data?.items.find((plan) => plan.metadata.name === editRouteMatch?.params.planName) ||
    null;

  const forms = usePlanWizardFormState(
    plansQuery,
    networkMappingsQuery,
    storageMappingsQuery,
    planBeingEdited
  );

  const vmsQuery = useSourceVMsQuery(forms.general.values.sourceProvider);

  const { isDonePrefilling, prefillQueries, prefillErrorTitles } = useEditingPlanPrefillEffect(
    forms,
    planBeingEdited,
    !!editRouteMatch
  );

  enum StepId {
    General = 0,
    FilterVMs,
    SelectVMs,
    NetworkMapping,
    StorageMapping,
    Type,
    Hooks,
    Review,
  }

  const stepForms = [
    forms.general,
    forms.filterVMs,
    forms.selectVMs,
    forms.networkMapping,
    forms.storageMapping,
    forms.type,
    forms.hooks,
  ];
  const firstInvalidFormIndex = stepForms.findIndex((form) => !form.isValid);
  const stepIdReached: StepId =
    firstInvalidFormIndex === -1 ? StepId.Review : firstInvalidFormIndex;

  const isFirstRender = React.useRef(true);

  // When providers change, clear all forms containing provider-specific options
  React.useEffect(() => {
    if (!isFirstRender.current && isDonePrefilling) {
      forms.filterVMs.clear();
      forms.selectVMs.clear();
      forms.networkMapping.clear();
      forms.storageMapping.clear();
    }
    isFirstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forms.general.values.sourceProvider, forms.general.values.targetProvider]);

  const onClose = () => history.push('/plans');

  const createPlanMutation = useCreatePlanMutation();
  const patchPlanMutation = usePatchPlanMutation();

  const { network: createSharedNetworkMapMutation, storage: createSharedStorageMapMutation } =
    useCreateMappingMutations();

  const createSharedMappings = async () => {
    const { networkMapping, storageMapping } = generateMappings({ forms });
    if (networkMapping && forms.networkMapping.values.isSaveNewMapping) {
      createSharedNetworkMapMutation.mutate(networkMapping);
    }
    if (storageMapping && forms.storageMapping.values.isSaveNewMapping) {
      createSharedStorageMapMutation.mutate(storageMapping);
    }
  };

  const onSave = () => {
    if (!planBeingEdited) {
      createPlanMutation.mutate(forms);
    } else {
      patchPlanMutation.mutate({ planBeingEdited, forms });
    }
    createSharedMappings();
  };

  const allMutationResults = [
    !editRouteMatch ? createPlanMutation : patchPlanMutation,
    ...(forms.networkMapping.values.isSaveNewMapping ? [createSharedNetworkMapMutation] : []),
    ...(forms.storageMapping.values.isSaveNewMapping ? [createSharedStorageMapMutation] : []),
  ];
  const allMutationErrorTitles = [
    !editRouteMatch ? 'Error creating migration plan' : 'Error saving migration plan',
    ...(forms.networkMapping.values.isSaveNewMapping ? ['Error creating network mapping'] : []),
    ...(forms.storageMapping.values.isSaveNewMapping ? ['Error creating storage mapping'] : []),
  ];
  const mutationStatus = getAggregateQueryStatus(allMutationResults);

  React.useEffect(() => {
    if (mutationStatus === 'success') onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutationStatus]);

  const selectedVMs =
    vmsQuery.indexedData?.findVMsByIds(forms.selectVMs.values.selectedVMIds) || [];

  const steps: WizardStep[] = [
    {
      id: StepId.General,
      name: 'General',
      component: (
        <WizardStepContainer title="General settings">
          <GeneralForm form={forms.general} planBeingEdited={planBeingEdited} />
        </WizardStepContainer>
      ),
      enableNext: forms.general.isValid,
    },
    {
      name: 'VM selection',
      steps: [
        {
          id: StepId.FilterVMs,
          name: 'Filter',
          component: (
            <WizardStepContainer title="Filter by VM location">
              <FilterVMsForm
                form={forms.filterVMs}
                sourceProvider={forms.general.values.sourceProvider}
                planBeingEdited={planBeingEdited}
              />
            </WizardStepContainer>
          ),
          enableNext: forms.filterVMs.isValid,
          canJumpTo: stepIdReached >= StepId.FilterVMs,
        },
        {
          id: StepId.SelectVMs,
          name: 'Select VMs',
          component: (
            <WizardStepContainer title="Select VMs">
              <SelectVMsForm
                form={forms.selectVMs}
                treeType={forms.filterVMs.values.treeType}
                selectedTreeNodes={forms.filterVMs.values.selectedTreeNodes}
                sourceProvider={forms.general.values.sourceProvider}
                selectedVMs={selectedVMs}
              />
            </WizardStepContainer>
          ),
          enableNext: forms.selectVMs.isValid,
          canJumpTo: stepIdReached >= StepId.SelectVMs,
        },
      ],
    },
    {
      id: StepId.NetworkMapping,
      name: 'Network mapping',
      component: (
        <WizardStepContainer title="Network mapping">
          <MappingForm
            key="mapping-form-network"
            form={forms.networkMapping}
            sourceProvider={forms.general.values.sourceProvider}
            targetProvider={forms.general.values.targetProvider}
            mappingType={MappingType.Network}
            selectedVMs={selectedVMs}
            planBeingEdited={planBeingEdited}
          />
        </WizardStepContainer>
      ),
      enableNext: forms.networkMapping.isValid,
      canJumpTo: stepIdReached >= StepId.NetworkMapping,
    },
    {
      id: StepId.StorageMapping,
      name: 'Storage mapping',
      component: (
        <WizardStepContainer title="Storage mapping">
          <MappingForm
            key="mapping-form-storage"
            form={forms.storageMapping}
            sourceProvider={forms.general.values.sourceProvider}
            targetProvider={forms.general.values.targetProvider}
            mappingType={MappingType.Storage}
            selectedVMs={selectedVMs}
            planBeingEdited={planBeingEdited}
          />
        </WizardStepContainer>
      ),
      enableNext: forms.storageMapping.isValid,
      canJumpTo: stepIdReached >= StepId.StorageMapping,
    },
    {
      id: StepId.Type,
      name: 'Type',
      component: (
        <WizardStepContainer title="Migration type">
          <TypeForm
            form={forms.type}
            selectedVMs={selectedVMs}
            sourceProvider={forms.general.values.sourceProvider}
          />
        </WizardStepContainer>
      ),
      enableNext: forms.type.isValid,
      canJumpTo: stepIdReached >= StepId.Type,
    },
    {
      id: StepId.Hooks,
      name: 'Hooks',
      component: (
        <WizardStepContainer title="Add hooks to the plan (optional)">
          <HooksForm form={forms.hooks} isWarmMigration={forms.type.values.type === 'Warm'} />
        </WizardStepContainer>
      ),
      enableNext: forms.hooks.isValid,
      canJumpTo: stepIdReached >= StepId.Hooks,
    },
    {
      id: StepId.Review,
      name: 'Review',
      component: (
        <WizardStepContainer title="Review the migration plan">
          <Review
            forms={forms}
            allMutationResults={allMutationResults}
            allMutationErrorTitles={allMutationErrorTitles}
            planBeingEdited={planBeingEdited}
            selectedVMs={selectedVMs}
          />
        </WizardStepContainer>
      ),
      enableNext: mutationStatus === 'idle',
      nextButtonText: 'Finish',
      canJumpTo: stepIdReached >= StepId.Review,
    },
  ];

  const resetResultsOnNav: WizardStepFunctionType = (_newStep, prevStep) => {
    if (prevStep.prevId === StepId.Review) {
      allMutationResults.forEach((result) => result.reset());
    }
  };

  return (
    <ResolvedQueries
      results={[plansQuery, networkMappingsQuery, storageMappingsQuery, ...prefillQueries]}
      errorTitles={[
        'Error loading plans',
        'Error loading network mappings',
        'Error loading storage mappings',
        ...prefillErrorTitles,
      ]}
      errorsInline={false}
      className={spacing.mMd}
      emptyStateBody={LONG_LOADING_MESSAGE}
    >
      {!isDonePrefilling ? (
        <LoadingEmptyState />
      ) : editRouteMatch && (!planBeingEdited || planBeingEdited?.status?.migration?.started) ? (
        <Redirect to="/plans" />
      ) : (
        <>
          <Prompt
            when={forms.isSomeFormDirty && mutationStatus === 'idle'}
            message="You have unsaved changes, are you sure you want to leave this page?"
          />
          <PageSection
            title={`${!planBeingEdited ? 'Create' : 'Edit'} Migration Plan`}
            variant="light"
          >
            <Breadcrumb className={`${spacing.mbLg} ${spacing.prLg}`}>
              <BreadcrumbItem>
                <Link to={`/plans`}>Migration plans</Link>
              </BreadcrumbItem>
              {planBeingEdited ? (
                <BreadcrumbItem>{planBeingEdited.metadata.name}</BreadcrumbItem>
              ) : null}
              <BreadcrumbItem>{!planBeingEdited ? 'Create' : 'Edit'}</BreadcrumbItem>
            </Breadcrumb>
            <Level>
              <LevelItem>
                <Title headingLevel="h1">
                  {!planBeingEdited ? 'Create' : 'Edit'} migration plan
                </Title>
              </LevelItem>
            </Level>
          </PageSection>
          <PageSection variant="light" type="wizard">
            <Wizard
              steps={steps}
              onSubmit={(event) => event.preventDefault()}
              onSave={onSave}
              onClose={onClose}
              onBack={resetResultsOnNav}
              onGoToStep={resetResultsOnNav}
            />
          </PageSection>
        </>
      )}
    </ResolvedQueries>
  );
};

export default PlanWizard;
