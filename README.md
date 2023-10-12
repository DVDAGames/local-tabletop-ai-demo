# Gygax AI

This is a very limited, very basic, and very incomplete implementation of a simple AI bot for Fifth Edition and other tabletop games.

It was built to support the **Rapid Prototyping with AI** talk I am presenting at [Prompt Engineering Conference 2023](https://promptengineering.rocks/).

We'll load in the SRD in Markdown from [https://github.com/OldManUmby/DND.SRD.Wiki.git](https://github.com/OldManUmby/DND.SRD.Wiki.git) and then load a few documents into a local Chroma database to power the retrieval augmented generation (RAG) for our bot.

https://github.com/DVDAGames/local-tabletop-ai-demo/assets/1667415/2da80419-5443-41c7-9b43-02682435bbd6

### Getting Started

Requirements: Docker, ollama

1. `git clone`
2. `npm install`
3. `ollama create gygax -f Modelfile`
4. `npm run chroma:start`
5. `npm run srd` (to load up some SRD docs)
6. `npm run dev`
7. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
8. `CTRL+C` to stop the server
9. `npm run chroma:stop` to stop the ChromaDB container

ChromaDB is cloned for installation in a `postinstall` hook after you run `npm install`

ChromaDB's Docker container will be started and stopped using pre and post npm hooks.


### Session Abstract

Here's the abstract for the **Rapid Prototyping with AI** session:

> ChatGPT can help you brainstorm. GitHub's Copilot can be a great rubber duck for your codebase. But, what if you want to build something new?
> 
> In this talk we'll explore how to leverage current tooling to explore open source models, quickly spin up a model with a persona and instructions, and even build out an MVP with the help of a bot empowered with the ability to write and execute code.
> 
> You'll learn about some exciting new tools as well as some tips and tricks for prototyping your next idea using language models.
> 
