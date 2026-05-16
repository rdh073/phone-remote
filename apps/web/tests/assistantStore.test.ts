import { beforeEach, describe, expect, it } from 'vitest';

import { useAssistantStore } from '../src/stores/assistant';

beforeEach(() => {
  useAssistantStore.setState({
    messages: [],
    draft: '',
  });
});

describe('useAssistantStore conversation state', () => {
  it('stores chat messages outside the Assistant component', () => {
    useAssistantStore.getState().setMessages([
      {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    ]);

    expect(useAssistantStore.getState().messages).toHaveLength(1);
    expect(useAssistantStore.getState().messages[0]?.parts[0]).toMatchObject({ type: 'text', text: 'hello' });
  });

  it('stores composer draft outside the Assistant component', () => {
    useAssistantStore.getState().setDraft('inspect @device-1');

    expect(useAssistantStore.getState().draft).toBe('inspect @device-1');
  });
});
