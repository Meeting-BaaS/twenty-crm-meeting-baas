import { defineView } from 'twenty-sdk/define';
import { ViewType } from 'twenty-shared/types';
import {
  RECORDING_UNIVERSAL_IDENTIFIER,
  PLATFORM_FIELD_ID,
} from '../objects/recording';

export default defineView({
  universalIdentifier: '9d3114e6-3ba9-4e31-8197-45e510b69c4c',
  name: 'By Platform',
  objectUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  type: ViewType.KANBAN,
  icon: 'IconLayoutKanban',
  position: 2,
  mainGroupByFieldMetadataUniversalIdentifier: PLATFORM_FIELD_ID,
  groups: [
    { universalIdentifier: '7a0144b1-6d0e-453d-8cda-cf1fa63d3b77', fieldValue: 'GOOGLE_MEET', isVisible: true, position: 0 },
    { universalIdentifier: '8ed53363-962d-4136-b34c-fae2eae7d3f9', fieldValue: 'ZOOM', isVisible: true, position: 1 },
    { universalIdentifier: '7ab9b893-6f97-4973-a4a9-2295f69f5d6d', fieldValue: 'MICROSOFT_TEAMS', isVisible: true, position: 2 },
    { universalIdentifier: '3e82c80b-66db-4be2-8043-552ee309d26c', fieldValue: 'UNKNOWN', isVisible: true, position: 3 },
  ],
  fields: [
    { universalIdentifier: 'a578e600-97ec-4cd3-84fe-b254c3f89130', fieldMetadataUniversalIdentifier: PLATFORM_FIELD_ID, position: 0, isVisible: true, size: 150 },
  ],
});
