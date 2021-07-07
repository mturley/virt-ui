import { UseQueryResult } from 'react-query';
import { usePollingContext } from '@app/common/context';
import { useAuthorizedFetch } from './fetchHelpers';
import { useMockableQuery, getInventoryApiUrl, sortByName } from './helpers';
import { MOCK_RHV_VMS, MOCK_VMWARE_VMS } from './mocks/vms.mock';
import { SourceInventoryProvider } from './types';
import { SourceVM, IVMwareVM } from './types/vms.types';
import { useAsyncMemo } from 'use-async-memo';

type SourceVMsRecord = Record<string, SourceVM | undefined>;

export interface IndexedSourceVMs {
  vms: SourceVM[];
  vmsById: SourceVMsRecord;
  vmsBySelfLink: SourceVMsRecord;
  findVMsByIds: (ids: string[]) => SourceVM[];
  findVMsBySelfLinks: (selfLinks: string[]) => SourceVM[];
}

const findVMsInRecord = (record: SourceVMsRecord, keys: string[]) =>
  keys.flatMap((key) => (record[key] ? [record[key]] : [])) as SourceVM[];

const indexVMs = (vms: SourceVM[]): IndexedSourceVMs => {
  const sortedVMs = sortByName(vms.filter((vm) => !(vm as IVMwareVM).isTemplate));
  const vmsById: SourceVMsRecord = {};
  const vmsBySelfLink: SourceVMsRecord = {};
  sortedVMs.forEach((vm) => {
    vmsById[vm.id] = vm;
    vmsBySelfLink[vm.selfLink] = vm;
  });
  return {
    vms,
    vmsById,
    vmsBySelfLink,
    findVMsByIds: (ids) => findVMsInRecord(vmsById, ids),
    findVMsBySelfLinks: (selfLinks) => findVMsInRecord(vmsBySelfLink, selfLinks),
  };
};

export const useSourceVMsQuery = (
  provider: SourceInventoryProvider | null
): { result: UseQueryResult<SourceVM[]>; indexedData: IndexedSourceVMs | undefined } => {
  let mockVMs: SourceVM[] = [];
  if (provider?.type === 'vsphere') mockVMs = MOCK_VMWARE_VMS;
  if (provider?.type === 'ovirt') mockVMs = MOCK_RHV_VMS;
  const result = useMockableQuery<SourceVM[]>(
    {
      queryKey: ['vms', provider?.name],
      queryFn: useAuthorizedFetch(getInventoryApiUrl(`${provider?.selfLink || ''}/vms?detail=1`)),
      enabled: !!provider,
      refetchInterval: usePollingContext().refetchInterval,
    },
    mockVMs
  );

  return {
    result,
    indexedData: useAsyncMemo(async () => result.data && indexVMs(result.data), [result.data]),
  };
};
