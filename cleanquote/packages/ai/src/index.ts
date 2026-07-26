export * from './provider';
export { MockAiProvider } from './mock-provider';
export { AnthropicProvider } from './anthropic-provider';
export * from './question-priority';

import { AnthropicProvider } from './anthropic-provider';
import { MockAiProvider } from './mock-provider';
import type { AiProvider } from './provider';

/**
 * Chooses a provider from configuration.
 *
 * Defaults to the mock provider. An absent API key is a normal state, not a
 * failure: the whole AI flow stays usable, and the interface says which provider
 * produced a suggestion rather than implying a model that was never called.
 */
export function createAiProvider(config: {
  provider: string;
  apiKey?: string | undefined;
  model: string;
}): AiProvider {
  if (config.provider === 'anthropic' && config.apiKey) {
    return new AnthropicProvider({ apiKey: config.apiKey, model: config.model });
  }
  return new MockAiProvider();
}
