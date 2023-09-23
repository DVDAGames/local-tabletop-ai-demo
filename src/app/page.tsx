"use client";

import { useChat } from "ai/react";

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, stop, isLoading } = useChat({
    sendExtraMessageFields: true,
    onFinish: (message) => {
      console.log("onFinish:", message);
    },
    onResponse: (response) => {
      console.log("onResponse:", response);
    },
    onError: (error) => {
      console.log(error);
    },
  });

  return (
    <div className="mx-auto w-full h-full flex flex-col stretch items-center relative">
      <div className="relative flex flex-col justify-start align-start overflow-y-scroll p-5 h-[90%] w-full border border-gray-300">
        {messages.map((m) => (
          <div key={m.id} className="mb-2">
            <strong>{m.role === "user" ? "DM: " : "Gygax: "}</strong>
            {m.content}
          </div>
        ))}
      </div>

      <form className="flex flex-row items-center absolute bottom-5" onSubmit={handleSubmit}>
        <label htmlFor="prompt">
          Chat:
          <input
            id="prompt"
            name="prompt"
            className="border border-gray-300 rounded p-2 mx-5 text-black"
            value={input}
            onChange={handleInputChange}
            disabled={isLoading}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </label>
        <button className="border border-gray-300 p-2" type="submit" disabled={isLoading}>
          Send
        </button>
        {isLoading ? (
          <button
            className="border border-gray-300 p-2 ml-5"
            type="button"
            onClick={() => {
              stop();
            }}
          >
            Stop
          </button>
        ) : (
          <></>
        )}
      </form>
    </div>
  );
}
