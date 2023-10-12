import { NextApiRequest, NextApiResponse, NextApiHandler } from "next";

import { ChatOllama } from "langchain/chat_models/ollama";
import { BytesOutputParser } from "langchain/schema/output_parser";
import { StreamingTextResponse } from "ai";
import { OllamaEmbeddings } from "langchain/embeddings/ollama";
import { RunnableSequence } from "langchain/schema/runnable";

import { ChromaClient } from "chromadb";

import pluralize from "pluralize";
// @ts-expect-error
import isStopWord from "is-stop-words";

import Roller from "@dvdagames/js-die-roller";

import toJson from "../../utils/toJson";
import { IncludeEnum, WhereDocument, Where } from "chromadb/dist/main/types";

export const runtime = "edge";

export default async function handler(req: NextApiRequest, res: NextApiResponse<unknown>) {
  const collectionName = "dnd5e_srd_demo";

  const jsonData = await toJson(req.body);

  // we'll deal with proper request/response types later
  const messages: Array<Record<string, any>> = jsonData.messages ?? [];

  const lastPrompt: string = messages[messages.length - 1].content ?? "";

  if (lastPrompt.toLowerCase().startsWith("roll ")) {
    const roller = new Roller(lastPrompt.slice(5).trim());

    console.log(roller);

    // stolen from: https://vercel.com/docs/functions/edge-functions/streaming
    const encoder = new TextEncoder();

    const customReadable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify(roller.result?.total)));

        controller.close();
      },
    });

    return new Response(customReadable, {
      headers: { "Content-Type": "text; charset=utf-8" },
    });
  } else {
    const chroma = new ChromaClient({});

    const embeddingServer = new OllamaEmbeddings({
      baseUrl: "http://localhost:11434",
      model: "gygax",
      // @ts-expect-error
      embeddingOnly: true,
      ropeFrequencyBase: 1000000,
    });

    const embeddingFunction = {
      generate: async (documents: string[]) => {
        const embeddings = await embeddingServer.embedDocuments(documents);

        return embeddings;
      },
    };

    const collection = await chroma.getOrCreateCollection({ name: collectionName, embeddingFunction });

    let model = new ChatOllama({
      model: "gygax",
      baseUrl: "http://localhost:11434",
      ropeFrequencyBase: 1000000,
    });

    // HACK: When the query is really short and the embedded documents might have
    // significant overlap you're not going to get good results with just a cosine
    // similarity search. So we're going to do some ~~hackery~~ magic to search
    // for keywords in the user's prompt and generate some appropriate filters
    // for the metadata and document content.

    const classes = [
      "barbarian",
      "bard",
      "cleric",
      "druid",
      "fighter",
      "monk",
      "paladin",
      "ranger",
      "rogue",
      "sorcerer",
      "warlock",
      "wizard",
    ];

    const mentionedClasses: string[] = [];

    const asksAboutRules = lastPrompt.toLowerCase().includes("rules");
    const asksAcoutSrd = lastPrompt.toLowerCase().includes("srd");
    const asksAboutHandbook = lastPrompt.toLowerCase().includes("handbook");
    const asksAboutMonsters = lastPrompt.toLowerCase().includes("monster");
    const asksAboutClasses = lastPrompt.toLowerCase().includes("class");

    const asksAboutArmorClass = lastPrompt.toLowerCase().includes("armor class") || lastPrompt.includes(" AC ");

    const asksAboutSpells =
      lastPrompt.toLowerCase().includes("spell") ||
      lastPrompt.toLowerCase().includes("damage") ||
      lastPrompt.toLowerCase().includes("work");

    const asksAboutHitPoints =
      lastPrompt.toLowerCase().includes("hit points") ||
      lastPrompt.toLowerCase().includes("hitpoints") ||
      lastPrompt.includes(" HP ");

    const asksAboutClass = classes.some((c) => {
      const mentionsClass = lastPrompt.toLowerCase().includes(c);

      if (mentionsClass) {
        mentionedClasses.push(c);
      }

      return mentionsClass;
    });

    // We only want to bother with a vector search if the user asked about stuff that
    // we're likely to have an SRD document for.
    if (
      asksAboutRules ||
      asksAcoutSrd ||
      asksAboutHandbook ||
      asksAboutSpells ||
      asksAboutClasses ||
      asksAboutMonsters ||
      asksAboutHitPoints ||
      asksAboutArmorClass ||
      asksAboutClass
    ) {
      await collection.modify({
        metadata: {
          "hnsw:space": "cosine",
        },
      });

      const filters = [];
      const metaDataFilters: Array<Record<string, any>> = [];

      if (asksAboutMonsters) {
        metaDataFilters.push({
          type: {
            $eq: "Monsters",
          },
        });
      }

      if (asksAboutClasses || asksAboutClass) {
        metaDataFilters.push({
          type: {
            $eq: "Classes",
          },
        });

        if (mentionedClasses.length > 0) {
          mentionedClasses.forEach((c) => {
            metaDataFilters.push({
              title: {
                $eq: c.charAt(0).toUpperCase() + c.slice(1).toLowerCase(),
              },
            });
          });
        }
      }

      if (asksAboutSpells) {
        metaDataFilters.push({
          type: {
            $eq: "Spells",
          },
        });
      }

      if (asksAboutHitPoints) {
        metaDataFilters.push({
          type: {
            $eq: "Monsters",
          },
        });
      }

      if (asksAboutArmorClass) {
        metaDataFilters.push({
          type: {
            $eq: "Monsters",
          },
        });

        metaDataFilters.push({
          type: {
            $eq: "Classes",
          },
        });

        metaDataFilters.push({
          type: {
            $eq: "Equipment",
          },
        });

        filters.push({
          $contains: "Armor Class",
        });

        filters.push({
          $contains: "AC",
        });
      }

      let whereDocument: WhereDocument | undefined = {};
      let where: Where | undefined = {};

      // HACK: Sometimes you just need to make sure that things are included in the search results.
      // So we're going to try to reduce the user's prompt to its keywords and then make sure that
      // we check for those keywords in singular, plural, upper case, lower case, and title case.
      // This helps us avoid a situation where the user asks about "goblins" but the Goblin statblock
      // isn't included because it's called `Goblin` of "goblins". It's not perfect, but it works
      // for this prototype.
      lastPrompt
        .replace(/[?.,:;]/, "")
        .split(" ")
        .map((word) =>
          word
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .forEach((word) => {
          if (word.length > 3 && !isStopWord(word)) {
            filters.push({
              $contains: word,
            });

            if (word !== word.toLowerCase()) {
              filters.push({
                $contains: word.toLowerCase(),
              });
            }

            if (word !== word.toUpperCase()) {
              filters.push({
                $contains: word.toUpperCase(),
              });
            }
            if (word !== word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) {
              filters.push({
                $contains: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
              });
            }

            if (asksAboutSpells) {
              metaDataFilters.push({
                title: {
                  $eq: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
                },
              });
            }

            if (asksAboutMonsters || asksAboutHitPoints) {
              metaDataFilters.push({
                title: {
                  $eq: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
                },
              });
            }

            if (asksAboutClasses || asksAboutClass) {
              metaDataFilters.push({
                title: {
                  $eq: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
                },
              });
            }

            if (pluralize.isPlural(word)) {
              const singularWord = pluralize.singular(word);

              filters.push({
                $contains: singularWord,
              });

              if (singularWord !== singularWord.toLowerCase()) {
                filters.push({
                  $contains: singularWord.toLowerCase(),
                });
              }

              if (singularWord !== singularWord.toUpperCase()) {
                filters.push({
                  $contains: singularWord.toUpperCase(),
                });
              }

              if (singularWord !== singularWord.charAt(0).toUpperCase() + singularWord.slice(1).toLowerCase()) {
                filters.push({
                  $contains: singularWord.charAt(0).toUpperCase() + singularWord.slice(1).toLowerCase(),
                });
              }

              if (asksAboutSpells) {
                metaDataFilters.push({
                  title: {
                    $eq: singularWord.charAt(0).toUpperCase() + singularWord.slice(1).toLowerCase(),
                  },
                });
              }

              if (asksAboutMonsters || asksAboutHitPoints) {
                metaDataFilters.push({
                  title: {
                    $eq: singularWord.charAt(0).toUpperCase() + singularWord.slice(1).toLowerCase(),
                  },
                });
              }

              if (asksAboutClasses || asksAboutClass) {
                metaDataFilters.push({
                  title: {
                    $eq: singularWord.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
                  },
                });
              }
            } else {
              const pluralWord = pluralize.plural(word);

              filters.push({
                $contains: pluralWord,
              });

              if (pluralWord !== pluralWord.toLowerCase()) {
                filters.push({
                  $contains: pluralWord.toLowerCase(),
                });
              }

              if (pluralWord !== pluralWord.toUpperCase()) {
                filters.push({
                  $contains: pluralWord.toUpperCase(),
                });
              }

              if (pluralWord !== pluralWord.charAt(0).toUpperCase() + pluralWord.slice(1).toLowerCase()) {
                filters.push({
                  $contains: pluralWord.charAt(0).toUpperCase() + pluralWord.slice(1).toLowerCase(),
                });
              }

              if (asksAboutSpells) {
                metaDataFilters.push({
                  title: {
                    $eq: pluralWord.charAt(0).toUpperCase() + pluralWord.slice(1).toLowerCase(),
                  },
                });
              }

              if (asksAboutMonsters || asksAboutHitPoints) {
                metaDataFilters.push({
                  title: {
                    $eq: pluralWord.charAt(0).toUpperCase() + pluralWord.slice(1).toLowerCase(),
                  },
                });
              }

              if (asksAboutClasses || asksAboutClass) {
                metaDataFilters.push({
                  title: {
                    $eq: pluralWord.charAt(0).toUpperCase() + pluralWord.slice(1).toLowerCase(),
                  },
                });
              }
            }
          }
        });

      if (filters.length > 1) {
        whereDocument["$or"] = filters;
      } else if (filters.length === 1) {
        whereDocument = filters[0];
      }

      if (metaDataFilters.length > 1) {
        where["$or"] = metaDataFilters;
      } else if (metaDataFilters.length === 1) {
        where = metaDataFilters[0];
      }

      const promptEmbeddings = await embeddingServer.embedDocuments([lastPrompt]);

      console.log(where, whereDocument);

      const srdInfo = await collection.query({
        queryEmbeddings: promptEmbeddings,
        queryTexts: [lastPrompt],
        nResults: 5,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
        whereDocument,
        where,
      });

      const srdPrompt = srdInfo.ids[0].reduce((ragPrompts: string[], id, index) => {
        const docPrompt = `
        According to ${srdInfo.metadatas[0]?.[index]?.type}/${srdInfo.metadatas[0]?.[index]?.title}.md:

        ${srdInfo.documents[0][index]}
        `.trim();

        ragPrompts.push(docPrompt);

        return ragPrompts;
      }, []);

      // we'll inejct the SRD documents we found into a system message just before the user's prompt
      // so that the bot can refer to them in it's response. We aren't keeping all of the previous
      // document references bedcause they're not relevant to the current prompt and the local LLMs
      // are prone to confusion with too much complicated context.
      messages.splice(
        messages.length - 1,
        0,
        {
          role: "system",
          content: `
          You have access to information from the D&D 5th Edition Systems Reference Document (SRD) as a series of Markdown files.

          Some relevant documents based on the user's query have been provided below to help you fact check your answer. If the documents don't help answer the user's question, DISREGARD THEM.

          Quote directly from the documents you are provided when possible and always INCLUDE THE LOCATION AND NAME OF THE DOCUMENT you are referencing, like "According to Monsters/Beholder.md:"

          DO NOT MAKE UP REFERENCES TO DOCUMENTS THAT ARE NOT INCLUDED HERE.
          `.trim(),
        },
        { role: "system", content: srdPrompt.join("\n\n") }
      );

      // When we're looking at the SRD docs, we want to adjust the LLMs temperature
      // and topK and topP settings to make things a little more consistent and
      // conservative rather than creative.
      model.temperature = 0.25;
      model.topK = 1;
      model.topP = 0.6;
    }

    const chain = RunnableSequence.from([model, new BytesOutputParser()]);

    // NOTE: There's probably a better way to make these more Ollama-friendly,
    // but this works for a quick Proof of Concept.
    const streamMessages: Array<[string, string]> = messages.map(({ content, role }) => [role, content]);

    const stream = await chain.stream(streamMessages);

    return new StreamingTextResponse(stream);
  }
}
