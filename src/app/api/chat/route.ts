import { NextRequest } from "next/server";

import { ChatOllama } from "langchain/chat_models/ollama";
import { CallbackManager } from "langchain/callbacks";
import { BytesOutputParser } from "langchain/schema/output_parser";
import { RunnableSequence } from "langchain/schema/runnable";
import { StreamingTextResponse, LangChainStream } from "ai";

const callbacks = new CallbackManager();

const model = new ChatOllama({
  baseUrl: "http://localhost:11434",
  model: "gygax",
});

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const request = await req.json();

  const { messages } = request;

  const chain = RunnableSequence.from([model, new BytesOutputParser()]);

  // we'll deal with proper request/response types later
  // @ts-expect-error
  const stream = await chain.stream(messages.map(({ content, role }) => [role, content]));

  return new StreamingTextResponse(stream);
}
