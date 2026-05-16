import { beforeEach, describe, expect, it } from 'vitest';

import {
  dirtyKeysByCategory,
  dirtyKeysForDraft,
  useServerSettingsStore,
} from '../src/stores/serverSettings';

const server = {
  categories: [
    { id: 'providers' as const, label: 'Providers', hint: 'Provider settings' },
    { id: 'video' as const, label: 'Video', hint: 'Video settings' },
  ],
  keys: [
    {
      key: 'OPENAI_BASE_URL',
      label: 'OpenAI base URL',
      description: 'Base URL',
      category: 'providers' as const,
      type: 'text' as const,
    },
    {
      key: 'SCRCPY_MAIN_MAX_SIZE',
      label: 'Main size',
      description: 'Main size',
      category: 'video' as const,
      type: 'number' as const,
    },
  ],
  values: [
    {
      key: 'OPENAI_BASE_URL',
      value: 'https://api.openai.com/v1',
      defined: true,
      secret: false,
    },
    {
      key: 'SCRCPY_MAIN_MAX_SIZE',
      value: '1280',
      defined: true,
      secret: false,
    },
  ],
};

beforeEach(() => {
  useServerSettingsStore.setState({
    active: 'client',
    server,
    loading: false,
    error: null,
    draft: {},
    saving: false,
    saveError: null,
  });
});

describe('useServerSettingsStore', () => {
  it('tracks server-setting draft values and dirty categories', () => {
    useServerSettingsStore.getState().setDraftValue('OPENAI_BASE_URL', 'https://example.test/v1');
    useServerSettingsStore.getState().setDraftValue('SCRCPY_MAIN_MAX_SIZE', '1920');

    const draft = useServerSettingsStore.getState().draft;
    const dirtyKeys = dirtyKeysForDraft(draft);
    expect(dirtyKeys.sort()).toEqual(['OPENAI_BASE_URL', 'SCRCPY_MAIN_MAX_SIZE']);
    expect(dirtyKeysByCategory(dirtyKeys, server)).toEqual({ providers: 1, video: 1 });
  });

  it('removes a non-secret draft when it matches the stored value', () => {
    const store = useServerSettingsStore.getState();
    store.setDraftValue('OPENAI_BASE_URL', 'https://example.test/v1');
    store.setDraftValue('OPENAI_BASE_URL', 'https://api.openai.com/v1');

    expect(useServerSettingsStore.getState().draft).toEqual({});
  });

  it('clears draft and save error on discard', () => {
    useServerSettingsStore.setState({
      draft: { OPENAI_BASE_URL: 'https://example.test/v1' },
      saveError: 'failed',
    });

    useServerSettingsStore.getState().discard();

    expect(useServerSettingsStore.getState().draft).toEqual({});
    expect(useServerSettingsStore.getState().saveError).toBeNull();
  });
});
