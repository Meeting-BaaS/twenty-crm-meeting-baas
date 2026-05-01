import { definePreInstallLogicFunction } from 'twenty-sdk/define';

const VIEW_NAMES = ['All Recordings', 'Completed Recordings'];

const handler = async (): Promise<void> => {
  console.log('[pre-install] Cleaning up conflicting viewField records…');

  const apiUrl = process.env.TWENTY_API_URL ?? '';
  const apiKey = process.env.TWENTY_API_KEY ?? '';
  const metadataUrl = `${apiUrl}/metadata`;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const gql = async (query: string, variables?: Record<string, unknown>) => {
    const res = await fetch(metadataUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();

    if (json.errors?.length) {
      console.error(
        '[pre-install] GraphQL error:',
        JSON.stringify(json.errors),
      );
    }

    return json;
  };

  // Fetch all views with nested viewFields via getViews query
  const { data } = await gql(`{
    getViews {
      id
      name
      viewFields { id }
    }
  }`);

  const views: Array<{
    id: string;
    name: string;
    viewFields: Array<{ id: string }>;
  }> = data?.getViews ?? [];

  let deleted = 0;

  for (const view of views) {
    if (!VIEW_NAMES.includes(view.name)) continue;

    console.log(
      `[pre-install] Deleting ${view.viewFields.length} viewFields from "${view.name}"`,
    );

    for (const vf of view.viewFields) {
      const result = await gql(
        `mutation ($input: DestroyViewFieldInput!) {
          destroyViewField(input: $input) { id }
        }`,
        { input: { id: vf.id } },
      );

      // Label identifier fields can't be deleted — that's OK, they
      // already have the correct universalIdentifier from the initial install
      if (result.data?.destroyViewField) {
        deleted++;
      }
    }
  }

  console.log(`[pre-install] Deleted ${deleted} viewField records`);
};

export default definePreInstallLogicFunction({
  universalIdentifier: 'e8a23dc3-e788-4c3f-9296-2c872ff996e9',
  name: 'pre-install',
  description:
    'Cleans up auto-created viewField records before sync to avoid uniqueness conflicts on update installs.',
  timeoutSeconds: 60,
  handler,
});
