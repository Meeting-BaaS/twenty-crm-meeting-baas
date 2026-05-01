import styled from '@emotion/styled';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useRecordId } from 'twenty-sdk/front-component';

export const RECORDING_DETAIL_FRONT_COMPONENT_ID =
  'e7b3c5d9-2a4f-4e6b-8c1d-3f5a7b9c1d2e';

// -- API helpers ----------------------------------------------------------

const getApiUrl = () => process.env.TWENTY_API_URL ?? '';
const getToken = () => process.env.TWENTY_APP_ACCESS_TOKEN ?? '';
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json',
});

// -- Types ----------------------------------------------------------------

type Recording = {
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

type TranscriptEntry = { speaker: string; text: string };
type LinkedTask = { id: string; title: string; status: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type GeneratedItem = {
  title: string;
  assignee: string | null;
  saved?: boolean;
  taskId?: string;
};

// -- Helpers --------------------------------------------------------------

const parseTranscript = (raw: string): TranscriptEntry[] => {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const idx = line.indexOf(':');
      if (idx > 0 && idx < 50) {
        return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() };
      }
      return { speaker: '', text: line.trim() };
    });
};

const fetchRecording = async (id: string): Promise<Recording | null> => {
  const res = await fetch(`${getApiUrl()}/rest/recordings/${id}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const rec = json?.data?.recording ?? json?.data;
  if (!rec) return null;
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

const fetchLinkedTasks = async (recordingId: string): Promise<LinkedTask[]> => {
  try {
    const filter = encodeURIComponent(`recordingId[eq]:"${recordingId}"`);
    const res = await fetch(
      `${getApiUrl()}/rest/taskTargets?filter=${filter}&limit=50`,
      { headers: authHeaders() },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const targets: Array<{ taskId?: string; task?: { id: string; title: string; status: string } }> =
      json?.data?.taskTargets ?? json?.data ?? [];

    // If task data is embedded, use it directly
    const embedded = targets.filter((t) => t.task).map((t) => t.task!);
    if (embedded.length > 0) return embedded;

    // Otherwise fetch tasks by ID
    const taskIds = targets.map((t) => t.taskId).filter(Boolean) as string[];
    if (taskIds.length === 0) return [];
    const tasks: LinkedTask[] = [];
    for (const tid of taskIds) {
      const tRes = await fetch(`${getApiUrl()}/rest/tasks/${tid}`, {
        headers: authHeaders(),
      });
      if (tRes.ok) {
        const tJson = await tRes.json();
        const t = tJson?.data?.task ?? tJson?.data;
        if (t) tasks.push({ id: t.id, title: t.title ?? '', status: t.status ?? 'TODO' });
      }
    }
    return tasks;
  } catch {
    return [];
  }
};

const createTask = async (
  title: string,
  recordingId: string,
): Promise<{ taskId: string } | null> => {
  const taskRes = await fetch(`${getApiUrl()}/rest/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, status: 'TODO' }),
  });
  if (!taskRes.ok) return null;
  const taskJson = await taskRes.json();
  const taskId = taskJson?.data?.task?.id ?? taskJson?.data?.id;
  if (!taskId) return null;

  await fetch(`${getApiUrl()}/rest/taskTargets`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ taskId, recordingId }),
  });
  return { taskId };
};

const generateAiText = async (
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> => {
  const res = await fetch(`${getApiUrl()}/rest/ai/generate-text`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.text ?? null;
};

const toggleTaskStatus = async (taskId: string, done: boolean): Promise<void> => {
  await fetch(`${getApiUrl()}/rest/tasks/${taskId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: done ? 'DONE' : 'TODO' }),
  });
};

const getVideoProxyUrl = (botId: string): string =>
  `${getApiUrl()}/s/recording-video?botId=${encodeURIComponent(botId)}`;

// -- Styled components ----------------------------------------------------

const StyledGrid = styled.div`
  display: grid;
  grid-template-columns: 55% 45%;
  gap: 24px;
  width: 100%;
  min-height: 0;
  font-family: 'Inter', sans-serif;
`;

const StyledColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
`;

const StyledSection = styled.div`
  background: var(--t-background-primary);
  border: 1px solid var(--t-border-color-medium);
  border-radius: var(--t-border-radius-md);
  overflow: hidden;
`;

const StyledSectionHeader = styled.div`
  border-bottom: 1px solid var(--t-border-color-medium);
  color: var(--t-font-color-primary);
  font-size: 14px;
  font-weight: 600;
  padding: 12px 16px;
`;

const StyledSectionBody = styled.div`
  padding: 16px;
`;

const StyledVideoWrapper = styled.div`
  background: #000;
  border-radius: 8px;
  overflow: hidden;
`;

const StyledVideo = styled.video`
  display: block;
  width: 100%;
`;

const StyledTranscriptList = styled.div`
  max-height: 400px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 3px;
  }
`;

const StyledTranscriptEntry = styled.div`
  padding: 6px 0;

  & + & {
    border-top: 1px solid var(--t-border-color-light, rgba(0, 0, 0, 0.06));
  }
`;

const StyledSpeaker = styled.span`
  color: var(--t-accent-primary);
  font-size: 13px;
  font-weight: 600;
  margin-right: 8px;
`;

const StyledTranscriptText = styled.span`
  color: var(--t-font-color-primary);
  font-size: 13px;
  line-height: 1.5;
`;

const StyledMarkdownContent = styled.div`
  color: var(--t-font-color-primary);
  font-size: 13.5px;
  line-height: 1.7;
  max-height: 400px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 3px;
  }

  h1, h2, h3, h4, h5, h6 {
    margin-top: 1.2em;
    margin-bottom: 0.5em;
    font-weight: 600;
    &:first-child { margin-top: 0; }
  }
  p { margin: 0.6em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
  code {
    background: rgba(0, 0, 0, 0.04);
    border-radius: 4px;
    font-size: 0.88em;
    padding: 2px 6px;
  }
  blockquote {
    border-left: 3px solid var(--t-border-color-medium);
    color: var(--t-font-color-secondary);
    margin: 0.6em 0;
    padding-left: 1em;
  }
`;

const StyledTaskRow = styled.label`
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: 10px;
  padding: 6px 0;

  & + & {
    border-top: 1px solid var(--t-border-color-light, rgba(0, 0, 0, 0.06));
  }
`;

const StyledCheckbox = styled.input`
  accent-color: var(--t-accent-primary);
  cursor: pointer;
  height: 16px;
  width: 16px;
`;

const StyledTaskTitle = styled.span<{ done: boolean }>`
  color: var(--t-font-color-primary);
  font-size: 13px;
  text-decoration: ${({ done }) => (done ? 'line-through' : 'none')};
  opacity: ${({ done }) => (done ? 0.6 : 1)};
`;

const StyledButton = styled.button<{ variant?: 'primary' | 'secondary' }>`
  align-items: center;
  background: ${({ variant }) =>
    variant === 'secondary' ? 'var(--t-background-primary)' : 'var(--t-accent-primary)'};
  border: 1px solid ${({ variant }) =>
    variant === 'secondary' ? 'var(--t-border-color-medium)' : 'var(--t-accent-primary)'};
  border-radius: var(--t-border-radius-md);
  color: ${({ variant }) =>
    variant === 'secondary' ? 'var(--t-font-color-primary)' : 'var(--t-font-color-inverted)'};
  cursor: pointer;
  display: inline-flex;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  height: 32px;
  justify-content: center;
  padding: 0 14px;
  transition: opacity 0.15s ease;
  white-space: nowrap;

  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { cursor: not-allowed; opacity: 0.5; }
`;

const StyledGeneratedItem = styled.div`
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  padding: 6px 0;

  & + & {
    border-top: 1px solid var(--t-border-color-light, rgba(0, 0, 0, 0.06));
  }
`;

const StyledGeneratedTitle = styled.span`
  color: var(--t-font-color-primary);
  flex: 1;
  font-size: 13px;
  min-width: 0;
`;

const StyledChatMessages = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
  padding-bottom: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 3px;
  }
`;

const StyledChatBubble = styled.div<{ role: 'user' | 'assistant' }>`
  align-self: ${({ role }) => (role === 'user' ? 'flex-end' : 'flex-start')};
  background: ${({ role }) =>
    role === 'user' ? 'var(--t-accent-primary)' : 'var(--t-background-secondary, #f5f5f5)'};
  border-radius: 12px;
  color: ${({ role }) =>
    role === 'user' ? 'var(--t-font-color-inverted)' : 'var(--t-font-color-primary)'};
  font-size: 13px;
  line-height: 1.5;
  max-width: 85%;
  padding: 8px 14px;
`;

const StyledChatInputRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

const StyledInput = styled.input`
  background: var(--t-background-primary);
  border: 1px solid var(--t-border-color-medium);
  border-radius: var(--t-border-radius-md);
  color: var(--t-font-color-primary);
  flex: 1;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  height: 32px;
  outline: none;
  padding: 0 12px;

  &:focus {
    border-color: var(--t-accent-primary);
  }
`;

const StyledEmpty = styled.div`
  color: var(--t-font-color-tertiary);
  font-size: 13px;
  padding: 12px 0;
  text-align: center;
`;

const StyledLoading = styled.div`
  color: var(--t-font-color-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  padding: 40px 20px;
  text-align: center;
`;

// -- AI prompts -----------------------------------------------------------

const ACTION_ITEMS_SYSTEM_PROMPT = [
  'You extract action items from a meeting transcript.',
  'Return a JSON array: [{ "title": "...", "assignee": "..." | null }].',
  'Only concrete, actionable items. No discussion points. Valid JSON only.',
].join('\n');

const CHAT_SYSTEM_PROMPT = [
  'You are analyzing a meeting recording. Answer questions about the content.',
  'When suggesting action items, prefix each with "ACTION:" on its own line.',
  'Use markdown for formatting.',
].join('\n');

// -- Component ------------------------------------------------------------

const RecordingDetail = () => {
  const recordId = useRecordId();

  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([]);
  const [generatedItems, setGeneratedItems] = useState<GeneratedItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch recording data
  useEffect(() => {
    if (!recordId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const rec = await fetchRecording(recordId);
      if (cancelled) return;
      setRecording(rec);
      setLoading(false);
      if (rec) {
        const tasks = await fetchLinkedTasks(rec.id);
        if (!cancelled) setLinkedTasks(tasks);

        // Resolve video URL: prefer locally stored file, otherwise use proxy endpoint
        const localUrl = rec.videoFile?.[0]?.url;
        if (localUrl) {
          if (!cancelled) setVideoUrl(localUrl);
        } else if (rec.botId) {
          if (!cancelled) setVideoUrl(getVideoProxyUrl(rec.botId));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [recordId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  if (loading) {
    return <StyledLoading>Loading recording...</StyledLoading>;
  }

  if (!recording) {
    return <StyledLoading>Recording not found</StyledLoading>;
  }

  const transcriptEntries = parseTranscript(recording.transcript);

  // -- Handlers -----------------------------------------------------------

  const handleToggleTask = async (task: LinkedTask) => {
    const newDone = task.status !== 'DONE';
    setLinkedTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: newDone ? 'DONE' : 'TODO' } : t,
      ),
    );
    await toggleTaskStatus(task.id, newDone);
  };

  const handleGenerateActionItems = async () => {
    if (isGenerating || !recording.transcript) return;
    setIsGenerating(true);
    try {
      const result = await generateAiText(
        ACTION_ITEMS_SYSTEM_PROMPT,
        recording.transcript,
      );
      if (result) {
        const parsed: Array<{ title: string; assignee?: string | null }> =
          JSON.parse(result);
        setGeneratedItems(
          parsed.map((item) => ({
            title: item.title,
            assignee: item.assignee ?? null,
          })),
        );
      }
    } catch {
      // Parse error — show nothing
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveItem = async (index: number) => {
    const item = generatedItems[index];
    if (!item || item.saved) return;
    const result = await createTask(item.title, recording.id);
    if (result) {
      setGeneratedItems((prev) =>
        prev.map((g, i) =>
          i === index ? { ...g, saved: true, taskId: result.taskId } : g,
        ),
      );
      setLinkedTasks((prev) => [
        ...prev,
        { id: result.taskId, title: item.title, status: 'TODO' },
      ]);
    }
  };

  const handleSendChat = async () => {
    const question = chatInput.trim();
    if (!question || isChatting) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: question }]);
    setIsChatting(true);
    try {
      const context = recording.transcript
        ? `Meeting transcript:\n${recording.transcript}\n\nUser question: ${question}`
        : question;
      const reply = await generateAiText(CHAT_SYSTEM_PROMPT, context);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply ?? 'Sorry, I could not generate a response.' },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'An error occurred. Please try again.' },
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleCreateTaskFromChat = async (text: string) => {
    const result = await createTask(text, recording.id);
    if (result) {
      setLinkedTasks((prev) => [
        ...prev,
        { id: result.taskId, title: text, status: 'TODO' },
      ]);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  // Extract ACTION: lines from assistant messages
  const extractActions = (content: string): string[] =>
    content
      .split('\n')
      .filter((l) => l.trim().startsWith('ACTION:'))
      .map((l) => l.replace(/^ACTION:\s*/, '').trim());

  // -- Render -------------------------------------------------------------

  return (
    <StyledGrid>
      {/* LEFT COLUMN */}
      <StyledColumn>
        {/* Video Player */}
        {videoUrl && (
          <StyledSection>
            <StyledSectionHeader>Video</StyledSectionHeader>
            <StyledVideoWrapper>
              <StyledVideo controls>
                <source src={videoUrl} type="video/mp4" />
              </StyledVideo>
            </StyledVideoWrapper>
          </StyledSection>
        )}

        {/* Transcript */}
        <StyledSection>
          <StyledSectionHeader>Transcript</StyledSectionHeader>
          <StyledSectionBody>
            {transcriptEntries.length === 0 ? (
              <StyledEmpty>No transcript available</StyledEmpty>
            ) : (
              <StyledTranscriptList>
                {transcriptEntries.map((entry, i) => (
                  <StyledTranscriptEntry key={i}>
                    {entry.speaker && <StyledSpeaker>{entry.speaker}:</StyledSpeaker>}
                    <StyledTranscriptText>{entry.text}</StyledTranscriptText>
                  </StyledTranscriptEntry>
                ))}
              </StyledTranscriptList>
            )}
          </StyledSectionBody>
        </StyledSection>
      </StyledColumn>

      {/* RIGHT COLUMN */}
      <StyledColumn>
        {/* AI Summary */}
        {recording.summary && (
          <StyledSection>
            <StyledSectionHeader>AI Summary</StyledSectionHeader>
            <StyledSectionBody>
              <StyledMarkdownContent>
                <Markdown>{recording.summary}</Markdown>
              </StyledMarkdownContent>
            </StyledSectionBody>
          </StyledSection>
        )}

        {/* Action Items */}
        <StyledSection>
          <StyledSectionHeader>Action Items</StyledSectionHeader>
          <StyledSectionBody>
            {/* Existing linked tasks */}
            {linkedTasks.length > 0 &&
              linkedTasks.map((task) => (
                <StyledTaskRow key={task.id}>
                  <StyledCheckbox
                    type="checkbox"
                    checked={task.status === 'DONE'}
                    onChange={() => handleToggleTask(task)}
                  />
                  <StyledTaskTitle done={task.status === 'DONE'}>
                    {task.title}
                  </StyledTaskTitle>
                </StyledTaskRow>
              ))}

            {/* Generated items */}
            {generatedItems.length > 0 &&
              generatedItems.map((item, i) => (
                <StyledGeneratedItem key={i}>
                  <StyledGeneratedTitle>
                    {item.title}
                    {item.assignee && (
                      <span style={{ color: 'var(--t-font-color-tertiary)', marginLeft: 6 }}>
                        ({item.assignee})
                      </span>
                    )}
                  </StyledGeneratedTitle>
                  <StyledButton
                    variant="secondary"
                    disabled={item.saved}
                    onClick={() => handleSaveItem(i)}
                  >
                    {item.saved ? 'Saved' : 'Save'}
                  </StyledButton>
                </StyledGeneratedItem>
              ))}

            {linkedTasks.length === 0 && generatedItems.length === 0 && (
              <StyledEmpty>No action items yet</StyledEmpty>
            )}

            <div style={{ marginTop: 12 }}>
              <StyledButton
                onClick={handleGenerateActionItems}
                disabled={isGenerating || !recording.transcript}
              >
                {isGenerating ? 'Generating...' : 'Generate Action Items'}
              </StyledButton>
            </div>
          </StyledSectionBody>
        </StyledSection>

        {/* AI Chat */}
        <StyledSection>
          <StyledSectionHeader>AI Chat</StyledSectionHeader>
          <StyledSectionBody>
            {chatMessages.length > 0 && (
              <StyledChatMessages>
                {chatMessages.map((msg, i) => (
                  <div key={i}>
                    <StyledChatBubble role={msg.role}>
                      {msg.role === 'assistant' ? (
                        <StyledMarkdownContent>
                          <Markdown>{msg.content}</Markdown>
                        </StyledMarkdownContent>
                      ) : (
                        msg.content
                      )}
                    </StyledChatBubble>
                    {msg.role === 'assistant' &&
                      extractActions(msg.content).map((action, ai) => (
                        <div key={ai} style={{ marginTop: 4, marginLeft: 8 }}>
                          <StyledButton
                            variant="secondary"
                            onClick={() => handleCreateTaskFromChat(action)}
                          >
                            Create Task: {action.slice(0, 40)}
                            {action.length > 40 ? '...' : ''}
                          </StyledButton>
                        </div>
                      ))}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </StyledChatMessages>
            )}

            {chatMessages.length === 0 && (
              <StyledEmpty>Ask questions about this meeting</StyledEmpty>
            )}

            <StyledChatInputRow>
              <StyledInput
                placeholder="Ask about this meeting..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                disabled={isChatting}
              />
              <StyledButton onClick={handleSendChat} disabled={isChatting || !chatInput.trim()}>
                {isChatting ? '...' : 'Send'}
              </StyledButton>
            </StyledChatInputRow>
          </StyledSectionBody>
        </StyledSection>
      </StyledColumn>
    </StyledGrid>
  );
};

export default defineFrontComponent({
  universalIdentifier: RECORDING_DETAIL_FRONT_COMPONENT_ID,
  name: 'recording-detail',
  description:
    'Recording detail page with video player, transcript, AI summary, action items, and chat',
  component: RecordingDetail,
});
