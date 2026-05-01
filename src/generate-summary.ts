import axios from 'axios';
import { getApiUrl } from './utils';

const SYSTEM_PROMPT = [
  'You are summarizing a meeting transcript.',
  'Produce a concise summary covering:',
  '- Key topics discussed',
  '- Decisions made',
  '- Action items with owners (if mentioned)',
  'Keep it brief — no more than a few paragraphs.',
].join('\n');

export const generateSummary = async (
  transcript: string,
): Promise<string | null> => {
  const token = process.env.TWENTY_APP_ACCESS_TOKEN ?? '';
  if (!token) return null;

  if (!transcript || transcript.trim().length === 0) return null;

  try {
    const response = await axios({
      method: 'POST',
      url: `${getApiUrl()}/rest/ai/generate-text`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        userPrompt: transcript,
        systemPrompt: SYSTEM_PROMPT,
      },
    });

    const text = response.data?.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim();
    }

    return null;
  } catch (error) {
    // Non-fatal — recording still saves without a summary
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[generate-summary] failed: ${msg}`);
    return null;
  }
};
