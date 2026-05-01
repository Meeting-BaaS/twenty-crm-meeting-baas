import axios from 'axios';
import { getApiUrl } from './utils';

const CHUNK_SYSTEM_PROMPT = [
  'You are summarizing a section of a meeting transcript.',
  'Produce a concise summary covering:',
  '- Key topics discussed',
  '- Decisions made',
  '- Action items with owners (if mentioned)',
  'Keep it brief — no more than a few paragraphs.',
].join('\n');

const MERGE_SYSTEM_PROMPT = [
  'You are merging partial meeting summaries into one cohesive summary.',
  'Produce a single concise summary covering:',
  '- Key topics discussed',
  '- Decisions made',
  '- Action items with owners (if mentioned)',
  'Deduplicate overlapping points. Keep it brief — no more than a few paragraphs.',
].join('\n');

// Twenty's AI endpoint rejects prompts beyond ~20K chars (400 error).
// Split transcripts into chunks that fit, summarize each, then merge.
const CHUNK_SIZE = 18_000;

const callAi = async (
  token: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> => {
  const response = await axios({
    method: 'POST',
    url: `${getApiUrl()}/rest/ai/generate-text`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: { systemPrompt, userPrompt },
  });

  const text = response.data?.text;
  return typeof text === 'string' && text.trim().length > 0
    ? text.trim()
    : null;
};

// Split transcript into chunks at line boundaries so we don't cut mid-sentence.
const chunkTranscript = (transcript: string): string[] => {
  if (transcript.length <= CHUNK_SIZE) return [transcript];

  const chunks: string[] = [];
  let remaining = transcript;

  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }

    // Find the last newline within the chunk boundary
    let splitAt = remaining.lastIndexOf('\n', CHUNK_SIZE);
    if (splitAt <= 0) splitAt = CHUNK_SIZE;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
};

export const generateSummary = async (
  transcript: string,
): Promise<string | null> => {
  const token = process.env.TWENTY_APP_ACCESS_TOKEN ?? '';
  if (!token) return null;

  const trimmed = transcript?.trim();
  if (!trimmed) return null;

  try {
    const chunks = chunkTranscript(trimmed);

    if (chunks.length === 1) {
      return await callAi(token, CHUNK_SYSTEM_PROMPT, chunks[0]);
    }

    // Summarize each chunk independently
    console.error(`[generate-summary] transcript ${trimmed.length} chars → ${chunks.length} chunks`);
    const partialSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const partial = await callAi(
        token,
        CHUNK_SYSTEM_PROMPT,
        `[Part ${i + 1} of ${chunks.length}]\n\n${chunks[i]}`,
      );
      if (partial) partialSummaries.push(partial);
    }

    if (partialSummaries.length === 0) return null;
    if (partialSummaries.length === 1) return partialSummaries[0];

    // Merge partial summaries into one
    const mergeInput = partialSummaries
      .map((s, i) => `--- Part ${i + 1} ---\n${s}`)
      .join('\n\n');

    return await callAi(token, MERGE_SYSTEM_PROMPT, mergeInput);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[generate-summary] failed: ${msg}`);
    return null;
  }
};
