import { GroqProvider } from '../src/modules/ai/providers/groqProvider';
import { NullProvider } from '../src/modules/ai/providers/nullProvider';
import { getAIProvider, resetAIProviderCache } from '../src/modules/ai/providers/aiProviderFactory';

describe('AIProvider interface contract', () => {
  it('GroqProvider and NullProvider both implement generateCompletion', () => {
    const groq = new GroqProvider();
    const none = new NullProvider();

    expect(typeof groq.generateCompletion).toBe('function');
    expect(typeof none.generateCompletion).toBe('function');
  });
});

describe('GroqProvider', () => {
  it('can be constructed without making any request', () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const provider = new GroqProvider();
    expect(provider).toBeInstanceOf(GroqProvider);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('NullProvider', () => {
  it('returns an empty string and makes no external request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const provider = new NullProvider();

    const result = await provider.generateCompletion([{ role: 'user', content: 'anything' }], { max_tokens: 100 });

    expect(result).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('aiProviderFactory', () => {
  afterEach(() => {
    resetAIProviderCache();
  });

  it('selects a fallback provider by default (AI_PROVIDER unset)', () => {
    const original = process.env.AI_PROVIDER;
    delete process.env.AI_PROVIDER;
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getAIProvider: freshGetAIProvider } = require('../src/modules/ai/providers/aiProviderFactory');

      const provider = freshGetAIProvider();

      expect(provider).toBeDefined();
      expect(typeof provider.generateCompletion).toBe('function');
      expect(provider).not.toBeInstanceOf(GroqProvider);
      expect(provider).not.toBeInstanceOf(NullProvider);
    } finally {
      if (original !== undefined) {
        process.env.AI_PROVIDER = original;
      } else {
        delete process.env.AI_PROVIDER;
      }
      jest.resetModules();
    }
  });

  it('selects a fallback provider when AI_PROVIDER=groq', () => {
    const original = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'groq';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getAIProvider: freshGetAIProvider } = require('../src/modules/ai/providers/aiProviderFactory');

      const provider = freshGetAIProvider();

      expect(provider).toBeDefined();
      expect(typeof provider.generateCompletion).toBe('function');
      expect(provider).not.toBeInstanceOf(GroqProvider);
      expect(provider).not.toBeInstanceOf(NullProvider);
    } finally {
      if (original !== undefined) {
        process.env.AI_PROVIDER = original;
      } else {
        delete process.env.AI_PROVIDER;
      }
      jest.resetModules();
    }
  });

  it('selects NullProvider when AI_PROVIDER=none', () => {
    const original = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'none';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getAIProvider: freshGetAIProvider } = require('../src/modules/ai/providers/aiProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NullProvider: FreshNullProvider } = require('../src/modules/ai/providers/nullProvider');

      expect(freshGetAIProvider()).toBeInstanceOf(FreshNullProvider);
    } finally {
      process.env.AI_PROVIDER = original;
      jest.resetModules();
    }
  });

  it('caches the selected provider across repeated calls until reset', () => {
    const first = getAIProvider();
    const second = getAIProvider();
    expect(first).toBe(second);

    resetAIProviderCache();
    const third = getAIProvider();
    expect(third).not.toBe(first);
  });
});
