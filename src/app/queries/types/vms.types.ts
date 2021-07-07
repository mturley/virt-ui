import { IVMwareObjRef } from './common.types';

export interface ISourceVMConcern {
  label: string;
  category: 'Warning' | 'Critical' | 'Information' | 'Advisory';
  assessment: string;
}

interface IBaseSourceVM {
  id: string;
  revision: number;
  name: string;
  selfLink: string;
  concerns: ISourceVMConcern[];
  revisionValidated: number;
  [key: string]: any;
}

export interface IVMwareVMDisk {
  datastore: IVMwareObjRef;
  [key: string]: any;
}

export interface IVMwareVM extends IBaseSourceVM {
  networks: IVMwareObjRef[];
  disks: IVMwareVMDisk[];
  isTemplate: boolean;
}

export interface IRHVNIC {
  profile: {
    network: string;
  };
}

export interface IRHVDiskAttachment {
  disk: {
    storageDomain: string;
  };
}

export interface IRHVVM extends IBaseSourceVM {
  nics: IRHVNIC[];
  diskAttachments: IRHVDiskAttachment[];
}

export type SourceVM = IVMwareVM | IRHVVM;
