import axios from 'axios';
import { getApiToken, getApiUrl, getRestApiUrl, restHeaders } from '../utils';

export type RecordingDetail = {
  id: string;
  name: string;
  botId: string;
  transcript: string;
  summary: string;
  mp4Url: { primaryLinkUrl?: string } | null;
  videoFile?: Array<{ url?: string; extension?: string }>;
  participantNames?: string;
  duration?: number;
  status?: string;
};

export type LinkedTask = {
  id: string;
  title: string;
  status: string;
};

type TaskTargetRow = {
  taskId?: string;
  recordingId?: string;
  task?: LinkedTask;
};

const AI_MAX_PROMPT_CHARS = 20000;

const trimPrompt = (text: string): string => text.trim().slice(0, AI_MAX_PROMPT_CHARS);

export const parseJsonBody = <T>(body: unknown): T | null => {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as T;
    } catch {
      return null;
    }
  }
  return body as T;
};

export const fetchRecordingDetail = async (
  recordingId: string,
): Promise<RecordingDetail | null> => {
  const response = await axios.get(`${getRestApiUrl()}/recordings/${recordingId}`, {
    headers: restHeaders(),
  });
  const body = response.data?.data ?? response.data;
  const rec = body?.recording ?? body;
  if (!rec?.id) return null;

  return {
    id: rec.id,
    name: rec.name ?? '',
    botId: rec.botId ?? '',
    transcript: rec.transcript ?? '',
    summary: rec.summary ?? '',
    mp4Url: rec.mp4Url ?? null,
    videoFile: rec.videoFile ?? [],
    participantNames: rec.participantNames ?? '',
    duration: rec.duration ?? 0,
    status: rec.status ?? '',
  };
};

export const fetchLinkedTasksForRecording = async (
  recordingId: string,
): Promise<LinkedTask[]> => {
  try {
    const response = await axios.get(`${getRestApiUrl()}/taskTargets`, {
      headers: restHeaders(),
      params: {
        filter: `recordingId[eq]:"${recordingId}"`,
        limit: 50,
      },
    });
    const targets: TaskTargetRow[] = response.data?.data?.taskTargets ?? response.data?.data ?? [];

    const embedded = targets.flatMap((target) => (target.task ? [target.task] : []));
    if (embedded.length > 0) return embedded;

    const taskIds = [...new Set(targets.flatMap((target) => (target.taskId ? [target.taskId] : [])))];
    const tasks = await Promise.all(
      taskIds.map(async (taskId) => {
        const taskResponse = await axios.get(`${getRestApiUrl()}/tasks/${taskId}`, {
          headers: restHeaders(),
        });
        const taskBody = taskResponse.data?.data ?? taskResponse.data;
        const task = taskBody?.task ?? taskBody;
        return task?.id
          ? { id: task.id as string, title: (task.title as string) ?? '', status: (task.status as string) ?? 'TODO' }
          : null;
      }),
    );

    return tasks.filter((task): task is LinkedTask => task !== null);
  } catch {
    return [];
  }
};

export const createTaskForRecording = async (
  title: string,
  recordingId: string,
): Promise<LinkedTask | null> => {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return null;

  const taskResponse = await axios.post(
    `${getRestApiUrl()}/tasks`,
    { title: normalizedTitle, status: 'TODO' },
    { headers: restHeaders() },
  );
  const taskBody = taskResponse.data?.data ?? taskResponse.data;
  const task = taskBody?.task ?? taskBody;
  const taskId = task?.id as string | undefined;

  if (!taskId) {
    return null;
  }

  await axios.post(
    `${getRestApiUrl()}/taskTargets`,
    { taskId, recordingId },
    { headers: restHeaders() },
  );

  return {
    id: taskId,
    title: (task.title as string) ?? normalizedTitle,
    status: (task.status as string) ?? 'TODO',
  };
};

export const ensureTaskBelongsToRecording = async (
  taskId: string,
  recordingId: string,
): Promise<boolean> => {
  const response = await axios.get(`${getRestApiUrl()}/taskTargets`, {
    headers: restHeaders(),
    params: {
      filter: `taskId[eq]:"${taskId}",recordingId[eq]:"${recordingId}"`,
      limit: 1,
    },
  });
  const rows: Array<{ id?: string }> = response.data?.data?.taskTargets ?? [];
  return rows.length > 0;
};

export const updateTaskStatus = async (
  taskId: string,
  done: boolean,
): Promise<void> => {
  await axios.patch(
    `${getRestApiUrl()}/tasks/${taskId}`,
    { status: done ? 'DONE' : 'TODO' },
    { headers: restHeaders() },
  );
};

export const generateAiTextServerSide = async (
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> => {
  const token = getApiToken();
  const normalizedPrompt = trimPrompt(userPrompt);

  if (!token || !normalizedPrompt) return null;

  const response = await axios.post(
    `${getApiUrl()}/rest/ai/generate-text`,
    {
      systemPrompt,
      userPrompt: normalizedPrompt,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const text = response.data?.text;
  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
};

export const extractActionsFromAnswer = (content: string): string[] =>
  content
    .split('\n')
    .filter((line) => line.trim().startsWith('ACTION:'))
    .map((line) => line.replace(/^ACTION:\s*/, '').trim())
    .filter(Boolean);
