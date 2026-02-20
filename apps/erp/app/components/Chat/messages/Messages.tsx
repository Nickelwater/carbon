import { useChatMessages, useChatStatus } from "@ai-sdk-tools/store";
import { TextShimmer } from "@carbon/react";
import { Fragment } from "react";
import { Message, MessageAvatar, MessageContent } from "~/components/Message";
import { useUser } from "~/hooks";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton
} from "../Conversation";
import { Markdown } from "../Markdown/Markdown";
import type { SupportedToolName } from "../ToolCallIndicator";
import { ToolCallIndicator } from "../ToolCallIndicator";
import { WebSearchSources } from "../WebSearch";
import { MessageActions } from "./MessageActions";

export const ThinkingMessage = () => {
  return (
    <TextShimmer className="text-sm" duration={1}>
      Thinking...
    </TextShimmer>
  );
};

type ActiveToolCallProps = {
  toolName: string;
};

export const ActiveToolCall = ({ toolName }: ActiveToolCallProps) => {
  // Type assertion to ensure compatibility with our supported tool names
  const supportedToolName = toolName as SupportedToolName;

  return <ToolCallIndicator toolName={supportedToolName} />;
};

export function Messages() {
  const messages = useChatMessages();
  const status = useChatStatus();
  const user = useUser();

  return (
    <div className="w-full mx-auto relative size-full h-[calc(100vh-86px)] pb-28">
      <div className="flex flex-col h-full w-full">
        <Conversation className="h-full w-full">
          <ConversationContent className="px-6 mx-auto mb-40 max-w-[770px]">
            {messages.map((message) => (
              <div key={message.id}>
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "data-canvas":
                      return null; // Canvas content is rendered in sidebar

                    case "text":
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              <Markdown limitedMarkdown>{part.text}</Markdown>
                            </MessageContent>

                            {message.role === "user" && user && (
                              <MessageAvatar
                                src={user.avatarUrl!}
                                name={`${user.firstName!} ${user.lastName!}`}
                              />
                            )}
                          </Message>

                          {message.role === "assistant" &&
                            message.parts.filter(
                              (part) => part.type === "source-url"
                            ).length > 0 && (
                              <WebSearchSources
                                sources={message.parts.filter(
                                  (part) => part.type === "source-url"
                                )}
                              />
                            )}

                          {message.role === "assistant" &&
                            status !== "streaming" && (
                              <MessageActions
                                messageContent={part.text}
                                messageId={message.id}
                              />
                            )}
                        </Fragment>
                      );

                    default: {
                      if (part.type.startsWith("tool-")) {
                        return (
                          <Fragment key={`${message.id}-${i}`}>
                            <Message from={message.role}>
                              <MessageContent>
                                <Markdown>
                                  {(part as any)?.output?.text}
                                </Markdown>
                              </MessageContent>
                            </Message>
                          </Fragment>
                        );
                      }

                      return null;
                    }
                  }
                })}
              </div>
            ))}

            {status === "submitted" && <ThinkingMessage />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>
    </div>
  );
}
