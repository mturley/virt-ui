import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { StatusCategoryType, PlanStatusType, StepType } from '@app/common/constants';
import { IStatusCondition, IStep, IVMStatus } from '@app/queries/types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

export const hasCondition = (conditions: IStatusCondition[], type: string): boolean => {
  return !!conditions.find((condition) => condition.type === type);
};

export const findConditionByCategory = (
  conditions: IStatusCondition[],
  category: string
): IStatusCondition | undefined => {
  return conditions.find((condition) => condition.category === category);
};

export const getMostSeriousCondition = (conditions: IStatusCondition[]): string => {
  if (findConditionByCategory(conditions, StatusCategoryType.Critical)) {
    return StatusCategoryType.Critical;
  }
  if (findConditionByCategory(conditions, StatusCategoryType.Error)) {
    return StatusCategoryType.Error;
  }
  if (hasCondition(conditions, PlanStatusType.Failed)) {
    return PlanStatusType.Failed;
  }
  if (
    findConditionByCategory(conditions, StatusCategoryType.Warn) &&
    !hasCondition(conditions, PlanStatusType.Ready)
  ) {
    return StatusCategoryType.Warn;
  }
  const requiredCondition = findConditionByCategory(conditions, StatusCategoryType.Required);
  if (
    requiredCondition &&
    requiredCondition.status !== 'True' &&
    !hasCondition(conditions, PlanStatusType.Ready)
  ) {
    return StatusCategoryType.Required;
  }
  if (
    findConditionByCategory(conditions, StatusCategoryType.Advisory) &&
    !hasCondition(conditions, PlanStatusType.Ready)
  ) {
    return StatusCategoryType.Advisory;
  }
  if (hasCondition(conditions, PlanStatusType.Ready)) {
    return PlanStatusType.Ready;
  }
  return 'Unknown';
};

export const findCurrentStep = (
  pipeline: IStep[]
): { currentStep: IStep | undefined; currentStepIndex: number } => {
  if (pipeline.length === 0) return { currentStep: undefined, currentStepIndex: 0 };
  const currentStep =
    pipeline
      .slice(0)
      .reverse()
      .find((step) => !!step.error || (!!step.started && !step.completed)) ||
    pipeline[pipeline.length - 1];
  const currentStepIndex = currentStep ? pipeline.indexOf(currentStep) : 0;
  return { currentStep, currentStepIndex };
};

export const formatTimestamp = (timestamp?: string): string =>
  timestamp ? dayjs(timestamp).format('DD MMM YYYY, HH:mm:ss z') : '';

const padNum = (num: number) => (num < 10 ? `0${num}` : `${num}`);

export const formatDuration = (
  start?: string | dayjs.Dayjs,
  end?: string | dayjs.Dayjs
): string => {
  if (!start) return '00:00:00';
  let seconds = (end ? dayjs(end) : dayjs()).diff(dayjs(start), 'second');
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${padNum(hours)}:${padNum(minutes)}:${padNum(seconds)}`;
};

export const getStepType = (status: IVMStatus, index: number): StepType => {
  const { currentStepIndex } = findCurrentStep(status.pipeline);
  const step = status.pipeline[index];
  if (status.completed || step?.completed || index < currentStepIndex) return StepType.Full;
  if (status.started && index === currentStepIndex) {
    if (status.error) return StepType.Full;
    return StepType.Half;
  }
  return StepType.Empty;
};

export const isStepOnError = (status: IVMStatus, index: number): boolean => {
  const step = status.pipeline[index];
  if (step.error) return true;
  return false;
};

export const numStr = (num: number | undefined): string => {
  if (num === undefined) return '';
  return String(num);
};
