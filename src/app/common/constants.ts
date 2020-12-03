import * as yup from 'yup';

import { IMetaVars } from './types';

export const APP_TITLE = 'Migration Toolkit for Virtualization';

export const CLUSTER_API_VERSION = 'forklift.konveyor.io/v1alpha1';

export const CLOUD_MA_LINK = {
  href: 'https://cloud.redhat.com/migrations/migration-analytics',
  label: 'cloud.redhat.com',
};

export const PRODUCT_DOCO_LINK = {
  href: 'https://access.redhat.com/documentation/en-us/migration_toolkit_for_virtualization/',
  label: 'product documentation',
};

export enum ProviderType {
  vsphere = 'vsphere',
  openshift = 'openshift',
}

export enum StatusCategoryType {
  Required = 'Required',
  Critical = 'Critical',
  Error = 'Error',
  Advisory = 'Advisory',
  Warn = 'Warn',
}

export enum PlanStatusAPIType {
  Ready = 'Ready',
  Executing = 'Executing',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
}

export enum PlanStatusDisplayType {
  Ready = 'Ready',
  Executing = 'Running',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
  Pending = 'Pending',
}

export enum StepType {
  Full = 'Full',
  Half = 'Half',
  Empty = 'Empty',
}

export const PROVIDER_TYPE_NAMES = {
  [ProviderType.vsphere]: 'VMware',
  [ProviderType.openshift]: 'OpenShift Virtualization',
};

export const SOURCE_PROVIDER_TYPES = [ProviderType.vsphere];
export const TARGET_PROVIDER_TYPES = [ProviderType.openshift];

export const META: IMetaVars =
  process.env.DATA_SOURCE !== 'mock'
    ? window['_meta']
    : {
        clusterApi: '/mock/api',
        devServerPort: 'mock-port',
        oauth: {
          clientId: 'mock-client-id',
          redirectUri: '/mock/redirect/uri',
          userScope: '/mock/user-scope',
          clientSecret: 'mock-client-secret',
        },
        namespace: 'mock-namespace',
        configNamespace: 'mock-namespace',
        inventoryApi: '/mock/api',
        inventoryPayloadApi: '/mock/api',
      };

export const dnsLabelNameSchema = yup
  .string()
  .max(63)
  .matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: ({ label }) =>
      `${label} can only contain lowercase alphanumeric characters and dashes (-), and must start and end with an alphanumeric character`,
    excludeEmptyString: true,
  });

export const urlSchema = yup.string().test('is-valid-url', 'Must be a valid URL', (value) => {
  try {
    new URL(value as string);
  } catch (_) {
    return false;
  }
  return true;
});

// https://www.regexpal.com/?fam=104038
const ipAddressRegex = /((^\s*((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))\s*$)|(^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$))/;
// https://www.regextester.com/103452
const subdomainRegex = /(?=^.{4,253}$)(^((?!-)[a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\.)+[a-zA-Z]{2,63}$)/;

export const vmwareHostnameSchema = yup
  .string()
  .label('Hostname or IP address')
  .max(253)
  .required()
  .test(
    'valid-ip-or-hostname',
    ({ label }) => `${label} must be a valid IPv4 or IPv6 address or a valid DNS subdomain`,
    (value: string | null | undefined) => {
      if (!value) return false;
      const isValidIp = !!value.match(ipAddressRegex);
      const isValidSubdomain = !!value.match(subdomainRegex);
      return isValidIp || isValidSubdomain;
    }
  );

export const vmwareFingerprintSchema = yup
  .string()
  .label('Certificate SHA1 Fingerprint')
  .matches(/^[a-fA-F0-9]{2}((:[a-fA-F0-9]{2}){19}|(:[a-fA-F0-9]{2}){15})$/, {
    message:
      'Fingerprint must consist of 16 or 20 pairs of hexadecimal characters separated by colons, e.g. XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX',
    excludeEmptyString: true,
  });

export const vmwareUsernameSchema = yup
  .string()
  .max(320)
  .label('Username')
  .matches(/^\S*$/, {
    message: ({ label }) => `${label} must not contain spaces`,
    excludeEmptyString: true,
  });
