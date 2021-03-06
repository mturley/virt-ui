import { META } from '@app/common/constants';
import { INetworkContext, useNetworkContext } from '@app/common/context/NetworkContext';
import { QueryFunction, MutateFunction } from 'react-query/types/core/types';
import { useHistory } from 'react-router-dom';
import { History, LocationState } from 'history';
import { useClientInstance } from '@app/client/helpers';
import { KubeResource } from '@konveyor/lib-ui';
import { IKubeResponse, IKubeStatus } from '@app/client/types';

interface IFetchContext {
  history: History<LocationState>;
  checkExpiry: INetworkContext['checkExpiry'];
}

export const useFetchContext = (): IFetchContext => ({
  history: useHistory(),
  checkExpiry: useNetworkContext().checkExpiry,
});

export const authorizedFetch = async <T>(
  url: string,
  fetchContext: IFetchContext,
  extraHeaders: RequestInit['headers'] = {}
): Promise<T> => {
  const { history, checkExpiry } = fetchContext;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${META.oauth.clientSecret}`,
        ...extraHeaders,
      },
    });
    if (response.ok && response.json) {
      return response.json();
    } else {
      throw response;
    }
  } catch (error) {
    checkExpiry(error, history);
    throw error;
  }
};

export const useAuthorizedFetch = <T>(url: string): QueryFunction<T> => {
  const fetchContext = useFetchContext();
  return () => authorizedFetch(url, fetchContext);
};

export const authorizedPost = async <T, TData>(
  url: string,
  fetchContext: IFetchContext,
  data?: TData
): Promise<T> => authorizedFetch(url, fetchContext, { body: JSON.stringify(data) });

export const useAuthorizedPost = <T, TData>(url: string, data: TData): MutateFunction<T, TData> => {
  const fetchContext = useFetchContext();
  return () => authorizedPost(url, fetchContext, data);
};

export const authorizedK8sRequest = async <T>(
  fetchContext: IFetchContext,
  requestFn: () => Promise<IKubeResponse<T>>
): Promise<IKubeResponse<T>> => {
  const { history, checkExpiry } = fetchContext;

  try {
    const response = await requestFn();
    if (response && response.data) {
      return response;
    } else {
      throw response;
    }
  } catch (error) {
    checkExpiry(error, history);
    throw error;
  }
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const useAuthorizedK8sClient = () => {
  const fetchContext = useFetchContext();
  const client = useClientInstance();
  /* eslint-disable @typescript-eslint/ban-types */
  return {
    get: <T>(resource: KubeResource, name: string, params?: object) =>
      authorizedK8sRequest<T>(fetchContext, () => client.get(resource, name, params)),
    list: <T>(resource: KubeResource, params?: object) =>
      authorizedK8sRequest<T>(fetchContext, () => client.list(resource, params)),
    create: <T>(resource: KubeResource, newObject: object, params?: object) =>
      authorizedK8sRequest<T>(fetchContext, () => client.create(resource, newObject, params)),
    delete: <T = IKubeStatus>(resource: KubeResource, name: string, params?: object) =>
      authorizedK8sRequest<T>(fetchContext, () => client.delete(resource, name, params)),
    patch: <T>(resource: KubeResource, name: string, patch: object, params?: object) =>
      authorizedK8sRequest<T>(fetchContext, () => client.patch(resource, name, patch, params)),
    put: <T>(resource: KubeResource, name: string, object: object, params?: object) =>
      authorizedK8sRequest<T>(fetchContext, () => client.put(resource, name, object, params)),
  };
  /* eslint-enable @typescript-eslint/ban-types */
};

export type AuthorizedClusterClient = ReturnType<typeof useAuthorizedK8sClient>;
