import fs from "fs/promises";
import fSync from "fs";
import path from "path";
import git from "simple-git";
import { MarkdownTextSplitter } from "langchain/text_splitter";
import { OllamaEmbeddings } from "langchain/embeddings/ollama";
import { ChromaClient } from "chromadb";

export const repoUrl = "https://github.com/OldManUmby/DND.SRD.Wiki.git";
export const localPath = "./.data/DND.SRD.Wiki";
export const collectionName = "dnd5e_srd_demo";

const start = Date.now();

try {
  // we'll ignore some of these directories because this is just a demo
  // and it takes long enough to generate embeddings as it is
  const SYNC_DIRS = [
    // "Characterizations",
    "Spells",
    "Gameplay",
    // "Equipment",
    "Monsters",
    // "Gamemastering",
    "Classes",
    // "Treasure",
    "Races",
    // "Equipment",
  ];

  // we're prototyping here so we're only going to load up a few SRD docs for demo purposes
  const SYNC_FILES = ["Alignment", "Goblin", "Fireball", "Wizard", "Combat"];

  const chroma = new ChromaClient({
    anonymizedTelemetry: false,
  });

  console.log(`Connecting to ChromaDBv${await chroma.version()}...`);

  const embeddingServer = new OllamaEmbeddings({
    baseUrl: "http://localhost:11434",
    model: "gygax",
    embeddingOnly: true,
    ropeFrequencyBase: 1000000,
  });

  const embeddingFunction = {
    generate: async (documents) => {
      const embeddings = await embeddingServer.embedDocuments(documents);

      return embeddings;
    },
  };

  const collection = await chroma.getOrCreateCollection({ name: collectionName, embeddingFunction });

  const getMarkdownFiles = async () => {
    try {
      await fs.access(localPath, fs.constants.W_OK);

      try {
        await git(localPath).status();

        console.log("Pulling latest changes...");

        git(localPath)
          .pull()
          .then(() => console.log("Latest changes pulled."));
      } catch (e) {
        console.log("Cloning repository...");

        await git().clone(repoUrl, localPath);
      }
    } catch (e) {
      if (e.code === "ENOENT") {
        try {
          await fs.mkdir(localPath, { recursive: true });

          getMarkdownFiles();
        } catch (e) {
          console.error(e);
        }
      } else {
        console.error(e);
      }
    }
  };

  const splitMarkdownFiles = async (content) => {
    // in a real production app we'd want to find a more ideal
    // chunking procedure that gives us optimal results
    // but for a prototype this is fine
    const splitter = new MarkdownTextSplitter({ chunkSize: 500, chunkOverlap: 20 });

    const parsedContent = await splitter.createDocuments(content);

    return parsedContent;
  };

  console.log("Getting markdown file list...");

  const directories = await fs.readdir(localPath);

  const filteredDirectories = directories.filter(
    (directory) => SYNC_DIRS.includes(directory) && fSync.statSync(path.join(localPath, directory)).isDirectory()
  );

  const files = filteredDirectories
    .reduce((fileArray, directory) => {
      const directoryFiles = fSync.readdirSync(path.join(localPath, directory), { recursive: true });

      const newFileArray = fileArray.concat(directoryFiles.map((file) => path.join(directory, file)));

      return newFileArray;
    }, [])
    .filter((file) => {
      const [directory, fileName] = file?.split("/") ?? [];

      const [documentTitle, extension] = fileName?.split(".") ?? [];

      return extension === "md" && SYNC_FILES.includes(documentTitle);
    });

  console.log("Prepping markdown files for embedding...");

  const fileContents = files.map((filePath) => fSync.readFileSync(path.join(localPath, filePath), "utf8"));

  let fileCount = 0;
  const embedableDocuments = [];

  for (let fileContent of fileContents) {
    const documents = await splitMarkdownFiles([fileContent]);

    const fileNameWithPath = files[fileCount];

    const [directory, fileName] = fileNameWithPath?.split("/") ?? [];

    const [documentTitle] = fileName?.split(".") ?? [];

    let docCount = 0;

    for (const doc of documents) {
      const id = `${fileName}-${docCount}-${doc.metadata.loc.lines.from}-${doc.metadata.loc.lines.to}`;

      const metadata = {
        locationStart: doc.metadata.loc.lines.from,
        loacationEnd: doc.metadata.loc.lines.to,
        type: directory,
        filePath: fileNameWithPath,
        file: fileName,
        title: documentTitle,
      };

      embedableDocuments.push({
        document: doc,
        metadata,
        id,
      });

      docCount++;
    }

    fileCount++;
  }

  console.log(`Generating embeddings...`);

  const docsToEmbed = embedableDocuments.map((doc) => doc.document.pageContent);

  const preparedDocuments = embedableDocuments.reduce(
    (docObject, doc) => {
      docObject.ids.push(doc.id);
      docObject.metadatas.push(doc.metadata);
      docObject.documents.push(doc.document.pageContent);

      return docObject;
    },
    {
      ids: [],
      metadatas: [],
      documents: [],
    }
  );

  const embeddings = await embeddingFunction.generate(docsToEmbed);

  preparedDocuments.embeddings = embeddings;

  await collection.add(preparedDocuments);

  const test = await collection.peek();

  console.log("Showing sample of collection...");
  console.log(test);
} catch (e) {
  console.error(e);
}

const end = Date.now();

console.log(`Script took ${(end - start) / 1000}s to run.`);

process.exit();
