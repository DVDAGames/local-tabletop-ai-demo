# Gygax AI

> **Note**: This is a limited, basic, and incomplete implementation of a simple DM helper AI bot for Fifth Edition.

It was built to support the **Rapid Prototyping with AI** talk I am presenting at [Prompt Engineering Conference 2023](https://promptengineering.rocks/).

We'll load in the [Fifth Edition Systems Reference Document](https://dnd.wizards.com/resources/systems-reference-document) (SRD) in Markdown from [OldManUmby/DND.SRD.Wiki](https://github.com/OldManUmby/DND.SRD.Wiki) and then load a few documents into a local [Chroma vector database](https://docs.trychroma.com/) to power the [retrieval augmented generation](https://www.promptingguide.ai/techniques/rag) (RAG) for our bot.

## Basic Demo

https://github.com/DVDAGames/local-tabletop-ai-demo/assets/1667415/2da80419-5443-41c7-9b43-02682435bbd6

**Note**: Apologies for the low-quality, but part of the talk was focused on working with low-powered hardware and my 2012 Macbook Pro was struggling to keep up with recording, running the LLM and ChromaDB Docker Container, and the NextJS development server.

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/)
- [Ollama](https://ollama.ai/)
  - [`orca-mini:7b-v3`](https://ollama.ai/library/orca-mini:7b-v3)

### Quick Start

1. Clone the repo: `git clone git@github.com:DVDAGames/local-tabletop-ai-demo.git` or `gh repo clone DVDAGames/local-tabletop-ai-demo`
2. Move into the project's directory: `cd local-tabletop-ai-demo`
3. Install the dependencies: `npm install`
   **Note**: There is a `postinstall` hook that will clone the `chroma-core/chroma` repo into `.data/chroma` so that you can run it as a Docker container. This method was what was available at the time this project was started - there may be other ways to run ChromaDB in a container now.
4. Create the `gygax` model: `ollama create gygax -f Modelfile`
5. Start the Vector DB: `npm run chroma:start`
6. Embed the SRD content into the DB: `npm run srd`
   **Note**: Depending on your hardware, this could take a while. You can adjust which documents are embedded via the `scripts/dnd_srd.mjs` file.
7. Start the development server: `npm run dev`
8. Chat with Gygax AI: [http://localhost:3000](http://localhost:3000)

**Note**: Local models, especially small, quantized ones like `orca-mini:7b-v3` can be weird. I've tried to reduce that with some adjustment to the bot's settings and some prompt engineering, but your experience may vary and `gygax` might still go off the rails a little bit.

### Cleaning Up

After you stop the server with a `SIGINT` or `SIGTERM` (e.g. `CTRL+C`), you can run `npm run chroma:stop` to stop the ChromaDB container.

## Session Abstract

Here's the abstract for the **Rapid Prototyping with AI** session:

> ChatGPT can help you brainstorm. GitHub's Copilot can be a great rubber duck for your codebase. But, what if you want to build something new?
> 
> In this talk we'll explore how to leverage current tooling to explore open source models, quickly spin up a model with a persona and instructions, and even build out an MVP with the help of a bot empowered with the ability to write and execute code.
> 
> You'll learn about some exciting new tools as well as some tips and tricks for prototyping your next idea using language models.
