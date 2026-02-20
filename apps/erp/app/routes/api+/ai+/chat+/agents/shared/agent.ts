import { openai } from "@ai-sdk/openai";
import type { AgentConfig } from "@ai-sdk-tools/agents";
import { Agent } from "@ai-sdk-tools/agents";
import { UpstashProvider } from "@ai-sdk-tools/memory/upstash";
import { UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from "@carbon/auth";
import { Redis } from "@upstash/redis";
import type { ChatContext } from "./context";
import { PROFILE_PROMPT, SUGGESTION_PROMPT, TITLE_PROMPT } from "./prompts";

export const memoryProvider = new UpstashProvider(
  new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN
  })
);

export const createAgent = (config: AgentConfig<ChatContext>) => {
  return new Agent({
    modelSettings: {
      parallel_tool_calls: true
    },
    ...config,
    memory: {
      provider: memoryProvider,
      history: {
        enabled: true,
        limit: 10
      },
      workingMemory: {
        enabled: false, // Disabled to prevent multiple system messages in multi-agent handoffs
        template: PROFILE_PROMPT,
        scope: "user"
      },
      chats: {
        enabled: true,
        generateTitle: {
          model: openai("gpt-4.1-nano"),
          instructions: TITLE_PROMPT
        },
        generateSuggestions: {
          enabled: true,
          model: openai("gpt-4.1-nano"),
          limit: 5,
          instructions: SUGGESTION_PROMPT
        }
      }
    }
  });
};
