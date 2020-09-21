import { MappingType, Mapping } from '../types/mappings.types';

// TODO: This is a temporary function designed for testing the mappings table. Remove when we wire up Redux & api
export const updateMockStorage = (generatedMapping: Mapping): void => {
  const { name: mappingName, provider, type: mappingType, items } = generatedMapping;
  const mappingsKey =
    mappingType === MappingType.Network ? 'networkMappingsObject' : 'storageMappingsObject';
  const mappingsStorageItem = localStorage.getItem(mappingsKey);
  const currentMappings = mappingsKey !== null ? JSON.parse(mappingsStorageItem || '{}') : {};
  const mockMappings = {
    mappings: [
      {
        name: mappingName ? mappingName : 'name1',
        provider: {
          source: {
            name: provider.source.name,
          },
          target: {
            name: provider.source.name,
          },
        },
        items,
      },
      ...(currentMappings?.mappings ? currentMappings.mappings : []),
    ],
  };
  localStorage.setItem(mappingsKey, JSON.stringify(mockMappings));
};

export const fetchMockStorage = (mappingType: string): Mapping[] => {
  const mappingsKey =
    mappingType === MappingType.Network ? 'networkMappingsObject' : 'storageMappingsObject';
  const mappingsItem = localStorage.getItem(mappingsKey);
  const returnVal = JSON.parse(mappingsItem || '{}').mappings;
  return returnVal;
};