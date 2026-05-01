import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';
import { RECORDING_DETAIL_FRONT_COMPONENT_ID } from '../front-components/recording-detail.front-component';
import { RECORDING_UNIVERSAL_IDENTIFIER } from '../objects/recording';

export default definePageLayout({
  universalIdentifier: 'f8a2d4e6-1b3c-4d5e-9f0a-2b4c6d8e0f1a',
  name: 'Recording Record Page',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: RECORDING_UNIVERSAL_IDENTIFIER,
  tabs: [
    {
      universalIdentifier: 'c1a2b3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      title: 'Overview',
      position: 50,
      icon: 'IconVideo',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'd2b3c4e5-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
          title: 'Recording Detail',
          type: 'FRONT_COMPONENT',
          configuration: {
            configurationType: 'FRONT_COMPONENT',
            frontComponentUniversalIdentifier:
              RECORDING_DETAIL_FRONT_COMPONENT_ID,
          },
        },
      ],
    },
    {
      universalIdentifier: '4776aab8-20f3-4286-9c31-e0a6b5fbb6d8',
      title: 'Timeline',
      position: 100,
      icon: 'IconTimelineEvent',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '68a6a17e-c8d7-4648-88ae-51bb4fc849bf',
          title: 'Timeline',
          type: 'TIMELINE',
          configuration: {
            configurationType: 'TIMELINE',
          },
        },
      ],
    },
    {
      universalIdentifier: '016c9db2-4afa-4593-884d-0eb4749ee984',
      title: 'Tasks',
      position: 200,
      icon: 'IconCheckbox',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '7e34b83c-f31a-454d-a02f-5f46af5a86ff',
          title: 'Tasks',
          type: 'TASKS',
          configuration: {
            configurationType: 'TASKS',
          },
        },
      ],
    },
    {
      universalIdentifier: '62f80850-fc64-479d-b9f8-7f6260fef580',
      title: 'Notes',
      position: 300,
      icon: 'IconNotes',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: '51c7b0af-6517-45c4-b447-39ed80eb0c6c',
          title: 'Notes',
          type: 'NOTES',
          configuration: {
            configurationType: 'NOTES',
          },
        },
      ],
    },
    {
      universalIdentifier: '1b80abdc-f992-419c-9178-62eabdfe40b4',
      title: 'Files',
      position: 400,
      icon: 'IconPaperclip',
      layoutMode: PageLayoutTabLayoutMode.CANVAS,
      widgets: [
        {
          universalIdentifier: 'f3b015a2-f991-4265-a6bd-6e06a9dc2dd1',
          title: 'Files',
          type: 'FILES',
          configuration: {
            configurationType: 'FILES',
          },
        },
      ],
    },
  ],
});
