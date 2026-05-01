import styled from '@emotion/styled';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useRecordId } from 'twenty-sdk/front-component';

export const RECORDING_DETAIL_FRONT_COMPONENT_ID =
  'e7b3c5d9-2a4f-4e6b-8c1d-3f5a7b9c1d2e';

// -- API helpers ----------------------------------------------------------

const getApiUrl = () => process.env.TWENTY_API_URL ?? '';
const postAppRoute = async <TResponse,>(
  path: string,
  body: Record<string, unknown>,
): Promise<TResponse> => {
  const response = await fetch(`${getApiUrl()}/s/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as {
    statusCode?: number;
    error?: string;
  } & TResponse;

  if (!response.ok || (typeof json.statusCode === 'number' && json.statusCode >= 400)) {
    throw new Error(json.error || `Request failed: ${response.status}`);
  }

  return json;
};

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

type RecordingDetailDataResponse = {
  recording: Recording;
  linkedTasks: LinkedTask[];
};

type CreateTaskResponse = {
  task: LinkedTask;
};

type GenerateActionItemsResponse = {
  items: Array<{ title: string; assignee: string | null }>;
};

type RecordingChatResponse = {
  answer: string;
  actions: string[];
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

const createTask = async (
  title: string,
  recordingId: string,
): Promise<LinkedTask | null> => {
  const json = await postAppRoute<CreateTaskResponse>('recording-create-task', {
    title,
    recordingId,
  });
  return json.task ?? null;
};

const toggleTaskStatus = async (
  taskId: string,
  recordingId: string,
  done: boolean,
): Promise<void> => {
  await postAppRoute('recording-toggle-task', {
    taskId,
    recordingId,
    done,
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
      try {
        const data = await postAppRoute<RecordingDetailDataResponse>('recording-detail-data', {
          recordingId: recordId,
        });
        if (cancelled) return;

        setRecording(data.recording);
        setLinkedTasks(data.linkedTasks);
        setLoading(false);

        const localUrl = data.recording.videoFile?.[0]?.url;
        if (localUrl) {
          if (!cancelled) setVideoUrl(localUrl);
        } else if (data.recording.botId) {
          if (!cancelled) setVideoUrl(getVideoProxyUrl(data.recording.botId));
        }
      } catch {
        if (!cancelled) {
          setRecording(null);
          setLinkedTasks([]);
          setLoading(false);
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
    await toggleTaskStatus(task.id, recording.id, newDone);
  };

  const handleGenerateActionItems = async () => {
    if (isGenerating || !recording.transcript) return;
    setIsGenerating(true);
    try {
      const data = await postAppRoute<GenerateActionItemsResponse>('recording-generate-action-items', {
        recordingId: recording.id,
      });
      setGeneratedItems(
        data.items.map((item) => ({
          title: item.title,
          assignee: item.assignee ?? null,
        })),
      );
    } catch {
      setGeneratedItems([]);
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
          i === index ? { ...g, saved: true, taskId: result.id } : g,
        ),
      );
      setLinkedTasks((prev) => [
        ...prev,
        result,
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
      const data = await postAppRoute<RecordingChatResponse>('recording-chat', {
        recordingId: recording.id,
        question,
      });
      const actionLines = data.actions.map((action) => `ACTION: ${action}`);
      const reply = [data.answer, ...actionLines].filter(Boolean).join('\n');
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply || 'Sorry, I could not generate a response.' },
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
        result,
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
