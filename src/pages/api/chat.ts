import { NextApiRequest, NextApiResponse, NextApiHandler } from "next";

import { ChatOllama } from "langchain/chat_models/ollama";
import { BytesOutputParser } from "langchain/schema/output_parser";
import { StreamingTextResponse } from "ai";
import { OllamaEmbeddings } from "langchain/embeddings/ollama";
import { RetrievalQAChain } from "langchain/chains";
import { RunnableSequence } from "langchain/schema/runnable";

import { Chroma } from "langchain/vectorstores/chroma";

import toJson from "../../utils/toJson";

export const runtime = "edge";

export default async function handler(req: NextApiRequest, res: NextApiResponse<unknown>) {
  const jsonData = await toJson(req.body);

  const { messages } = jsonData;

  const model = new ChatOllama({
    baseUrl: "http://localhost:11434",
    model: "gygax",
  });

  if (messages[messages.length - 1].content.startsWith("%srd:")) {
    const embeddings = new OllamaEmbeddings({
      baseUrl: "http://localhost:11434",
      model: "gygax",
    });

    const vectorStore = await Chroma.fromExistingCollection(embeddings, {
      collectionName: "dnd5e_srd",
    });

    const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever(), {
      returnSourceDocuments: true,
    });

    // we'll deal with proper request/response types later
    const results = await chain.call({ query: messages[messages.length - 1].content.slice(5) });

    console.log(results);

    return new Response(
      `${results.text}\n${
        typeof results?.sourceDocuments !== "undefined"
          ? `According to the SRD, ${results?.sourceDocuments?.map((doc: any) => doc?.metadata?.file).join(", ")}`
          : ""
      }`
    );
  } else {
    const chain = RunnableSequence.from([model, new BytesOutputParser()]);

    // we'll deal with proper request/response types later
    // @ts-expect-error
    const stream = await chain.stream(messages.map(({ content, role }) => [role, content]));

    return new StreamingTextResponse(stream);
  }
}
