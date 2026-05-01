import { defineNavigationMenuItem, NavigationMenuItemType } from 'twenty-sdk/define';
import { RECORDING_UNIVERSAL_IDENTIFIER } from '../objects/recording';

export default defineNavigationMenuItem({
  universalIdentifier: 'a569ca64-99b6-4334-a51e-d5fc59e8da57',
  position: 0,
  type: NavigationMenuItemType.OBJECT,
  targetObjectUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
});
