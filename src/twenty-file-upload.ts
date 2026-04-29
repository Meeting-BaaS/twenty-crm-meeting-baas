import { createLogger } from './logger';
import { getApiUrl, restHeaders } from './utils';
import { VIDEO_FILE_FIELD_ID } from './objects/recording';

const logger = createLogger('file-upload');

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

const getGraphQLUrl = (): string => `${getApiUrl()}/graphql`;

/**
 * Upload a file buffer to Twenty's file storage via GraphQL multipart upload.
 * Returns the file ID for use in a FILES field.
 */
const uploadFileToTwenty = async (
  buffer: ArrayBuffer,
  fileName: string,
  mimeType: string,
  fieldUniversalIdentifier: string,
): Promise<string> => {
  const graphqlUrl = getGraphQLUrl();
  const apiKey = process.env.TWENTY_API_KEY ?? '';

  const operations = JSON.stringify({
    query: `
      mutation UploadFile($file: Upload!, $fieldMetadataUniversalIdentifier: String!) {
        uploadFilesFieldFileByUniversalIdentifier(
          file: $file
          fieldMetadataUniversalIdentifier: $fieldMetadataUniversalIdentifier
        ) {
          id
          url
        }
      }
    `,
    variables: {
      file: null,
      fieldMetadataUniversalIdentifier: fieldUniversalIdentifier,
    },
  });

  const map = JSON.stringify({ '0': ['variables.file'] });

  const formData = new FormData();
  formData.append('operations', operations);
  formData.append('map', map);
  formData.append('0', new Blob([buffer], { type: mimeType }), fileName);

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`GraphQL upload failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data?: { uploadFilesFieldFileByUniversalIdentifier?: { id?: string } };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
  }

  const fileId = json.data?.uploadFilesFieldFileByUniversalIdentifier?.id;
  if (!fileId) {
    throw new Error('Upload succeeded but no file ID returned');
  }

  return fileId;
};

/**
 * Link an uploaded file to a Recording's videoFile field via REST API.
 */
const linkFileToRecording = async (
  recordingId: string,
  fileId: string,
  label: string,
): Promise<void> => {
  const url = `${getApiUrl()}/rest/recordings/${recordingId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: restHeaders(),
    body: JSON.stringify({
      videoFile: [{ fileId, label }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to link file to recording: ${response.status} ${text}`);
  }
};

/**
 * Download the MP4 from Meeting BaaS, upload it to Twenty's file storage,
 * and link it to the recording. Non-fatal — logs errors but doesn't throw.
 */
export const downloadAndStoreRecording = async (
  mp4Url: string,
  recordingId: string,
): Promise<void> => {
  if (!mp4Url) {
    logger.debug('no mp4Url provided, skipping file storage');
    return;
  }

  try {
    // Download the MP4
    logger.debug(`downloading MP4 from ${mp4Url}`);
    const downloadResponse = await fetch(mp4Url);
    if (!downloadResponse.ok) {
      throw new Error(`Download failed: ${downloadResponse.status}`);
    }

    const contentLength = downloadResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
      logger.warn(`MP4 too large (${contentLength} bytes), skipping file storage`);
      return;
    }

    const buffer = await downloadResponse.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      logger.warn(`MP4 too large (${buffer.byteLength} bytes), skipping file storage`);
      return;
    }

    logger.debug(`downloaded ${buffer.byteLength} bytes, uploading to Twenty`);

    // Upload to Twenty's file storage
    const fileName = `recording-${recordingId}.mp4`;
    const fileId = await uploadFileToTwenty(
      buffer,
      fileName,
      'video/mp4',
      VIDEO_FILE_FIELD_ID,
    );

    logger.debug(`uploaded file id=${fileId}, linking to recording`);

    // Link the file to the recording
    await linkFileToRecording(recordingId, fileId, 'Meeting Recording');

    logger.debug(`recording ${recordingId} video file stored successfully`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`failed to store recording video: ${msg}`);
    // Non-fatal — the external mp4Url link still works
  }
};
