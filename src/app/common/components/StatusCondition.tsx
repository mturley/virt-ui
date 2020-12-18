import * as React from 'react';
import { StatusIcon, StatusType } from '@konveyor/lib-ui';
import { getMostSeriousCondition } from '@app/common/helpers';
import { StatusCategoryType, PlanStatusType } from '@app/common/constants';
import { IStatusCondition } from '@app/queries/types';
import { Button, Popover } from '@patternfly/react-core';

interface IStatusConditionProps {
  status?: { conditions?: IStatusCondition[] };
  unknownFallback?: React.ReactNode;
  labelOnly?: boolean;
  replaceLabel?: string | null;
}

const StatusCondition: React.FunctionComponent<IStatusConditionProps> = ({
  status = {},
  unknownFallback = null,
  labelOnly = false,
  replaceLabel = null,
}: IStatusConditionProps) => {
  const getStatusType = (severity: string) => {
    if (status) {
      if (severity === PlanStatusType.Ready) {
        return StatusType.Ok;
      }
      if (severity === StatusCategoryType.Advisory) {
        return StatusType.Info;
      }
      if (severity === StatusCategoryType.Critical || severity === StatusCategoryType.Error) {
        return StatusType.Error;
      }
      if (severity === StatusCategoryType.Warn) {
        return StatusType.Warning;
      }
    }
    return StatusType.Info;
  };

  if (status) {
    const conditions = status?.conditions || [];
    const mostSeriousCondition = getMostSeriousCondition(conditions);

    if (mostSeriousCondition === 'Unknown' && unknownFallback !== null) {
      return <>{unknownFallback}</>;
    }

    let label = mostSeriousCondition;
    if (replaceLabel) {
      label = replaceLabel;
    } else if (mostSeriousCondition === StatusCategoryType.Required) {
      label = 'Not ready';
    }

    const summary = labelOnly ? (
      <>{label}</>
    ) : (
      <StatusIcon status={getStatusType(mostSeriousCondition)} label={label} />
    );

    if (conditions.length === 0) return summary;

    return (
      <Popover
        hasAutoWidth
        bodyContent={
          <>
            {conditions.map((condition) => {
              const severity = getMostSeriousCondition([condition]);
              console.log(condition.message, { severity });
              return (
                <StatusIcon
                  key={condition.message}
                  status={getStatusType(severity)}
                  label={condition.message}
                />
              );
            })}
          </>
        }
      >
        <Button variant="link" isInline>
          {summary}
        </Button>
      </Popover>
    );
  }
  return null;
};

export default StatusCondition;
