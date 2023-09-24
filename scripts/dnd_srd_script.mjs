import fs from "fs/promises";
import fSync from "fs";
import path from "path";
import git from "simple-git";
import { MarkdownTextSplitter } from "langchain/text_splitter";
import { OllamaEmbeddings } from "langchain/embeddings/ollama";
import { Chroma } from "langchain/vectorstores/chroma";
import { ChromaClient } from "chromadb";

// import langchain from "langchain";
// import path from "path";
// import util from "util";
// import chromadb from "chromadb";

export const repoUrl = "https://github.com/OldManUmby/DND.SRD.Wiki.git";
export const localPath = "./.data/DND.SRD.Wiki";
export const collectionName = "dnd5e_srd";

const chroma = new ChromaClient();

const embeddingFunction = new OllamaEmbeddings({
  baseUrl: "http://localhost:11434",
  model: "gygax",
  embedding_only: true,
});

let collection;

try {
  collection = await chroma.getCollection({ name: collectionName, embeddingFunction });

  console.log(await collection.peek());
} catch (e) {
  collection = await chroma.createCollection({ name: collectionName, embeddingFunction });
}

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
  const splitter = new MarkdownTextSplitter({ chunkSize: 500, chunkOverlap: 20 });

  const parsedContent = await splitter.createDocuments(content);

  return parsedContent;
};

const directories = await fs.readdir(localPath);

const filteredDirectories = directories.filter(
  (directory) =>
    !directory.startsWith(".git") && !directory.endsWith("(Alt)") && fSync.statSync(path.join(localPath, directory)).isDirectory()
);

const files = filteredDirectories.reduce((fileArray, directory) => {
  const directoryFiles = fSync.readdirSync(path.join(localPath, directory), { recursive: true });

  const newFileArray = fileArray.concat(directoryFiles.map((file) => path.join(directory, file)));

  return newFileArray;
}, []);

const fileContents = files.map((filePath) => fSync.readFileSync(path.join(localPath, filePath), "utf8"));

const documents = await splitMarkdownFiles(fileContents);

const formattedDocuments = documents.map((document, index) => {
  return {
    id: files[index],
    file: files[index],
    document,
  };
});

const preparedDocs = formattedDocuments.reduce(
  (docObject, doc) => {
    docObject.ids.push(doc.id);
    docObject.metadatas.push({ ...doc.document.metadata, file: doc.id });
    docObject.documents.push(doc.document.pageContent);

    return docObject;
  },
  {
    ids: [],
    metadatas: [],
    documents: [],
  }
);

preparedDocs.embeddings = await embeddingFunction.embedDocuments(preparedDocs.documents);

// const testDocs = {
//   ids: [formattedDocuments[0].id],
//   embeddings: await embeddingFunction.embedDocuments([formattedDocuments[0].document.pageContent]),
//   metadatas: [{ ...formattedDocuments[0].document.metadata, file: formattedDocuments[0].file }],
//   documents: [formattedDocuments[0].document.pageContent],
// };

await collection.add(preparedDocs);

const test = await collection.peek();

console.log(test);
