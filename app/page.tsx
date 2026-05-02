"use client";

import { useState } from "react";

type DocumentChunk = {
  text: string;
  embedding: number[];
  source: string;
};

function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

function findRelevantChunks(
  store: DocumentChunk[],
  queryEmbedding: number[],
  topK = 3
): DocumentChunk[] {
  return store
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.chunk);
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [apiKeySubmitted, setApiKeySubmitted] = useState(false);
  const [docText, setDocText] = useState("");
  const [vectorStore, setVectorStore] = useState<DocumentChunk[]>([]);
  const [ingested, setIngested] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Embed all chunks from the pasted doc content and store in React state
  async function handleIngest() {
    if (!docText.trim()) return;
    setLoading(true);

    const chunks = chunkText(docText);
    const embedded: DocumentChunk[] = [];

    for (const chunk of chunks) {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: chunk }),
      });
      const data = await res.json();
      embedded.push({ text: chunk, embedding: data.data[0].embedding, source: "doc" });
    }

    setVectorStore(embedded);
    setIngested(true);
    setMessages([{ role: "system", text: `✅ Ingested ${embedded.length} chunks. Ask away!` }]);
    setLoading(false);
  }

  // Embed the question client-side, find relevant chunks, send to our chat route
  async function handleAsk() {
    if (!question.trim()) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setQuestion("");
    setLoading(true);

    // Embed the question directly from the browser
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: question }),
    });
    const embData = await embRes.json();
    const queryEmbedding = embData.data[0].embedding;

    // Find the most relevant chunks in client-side state
    const relevantChunks = findRelevantChunks(vectorStore, queryEmbedding, 3);
    const context = relevantChunks
      .map((c) => `[Source: ${c.source}]\n${c.text}`)
      .join("\n\n---\n\n");

    // Send question + context to our chat route
    const chatRes = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context, apiKey }),
    });
    const chatData = await chatRes.json();

    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: chatData.answer ?? chatData.error },
    ]);
    setLoading(false);
  }

  // Step 1: API key screen
  if (!apiKeySubmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <main className="mx-auto my-16 max-w-120 p-8 space-y-4">
          <h1 className="text-2xl font-semibold">📄 Ask Your Docs</h1>
          <p>
            Enter your OpenAI API key to get started. It&apos;s held in memory for
            this session only and never stored anywhere.
          </p>
          <input
            type="password"
            className="mb-2 w-full p-2 border border-gray-400 rounded-md"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apiKey.trim() && setApiKeySubmitted(true)}
          />
          <button className="border border-gray-400 rounded-md p-2 cursor-pointer" onClick={() => setApiKeySubmitted(true)} disabled={!apiKey.trim()}>
            Continue
          </button>
        </main>
      </div>
    );
  }

  // Step 2: Paste docs
  if (!ingested) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <main className="mx-auto my-8 max-w-180 p-8 space-y-4">
          <h1 className="text-2xl font-semibold">📄 Ask Your Docs</h1>
          <p>Paste your document content below, then click Load.</p>
          <textarea
            className="mb-2 h-75 w-full p-2 border border-gray-400 rounded-md"
            placeholder="Paste your markdown, plain text, or any doc content here..."
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
          />
          <button className="border border-gray-400 rounded-md p-2 cursor-pointer" onClick={handleIngest} disabled={loading || !docText.trim()}>
            {loading ? "Ingesting..." : "Load Docs"}
          </button>
        </main>
      </div>
    );
  }

  // Step 3: Chat
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <main className="mx-auto my-8 max-w-180 p-8 space-y-4">
        <h1 className="text-2xl font-semibold">📄 Ask Your Docs</h1>

        <div className="my-4 min-h-75">
          {messages.map((m, i) => (
            <div key={i} className="mb-4">
              <strong>
                {m.role === "user" ? "You" : m.role === "assistant" ? "Assistant" : ""}:
              </strong>
              <p>{m.text}</p>
            </div>
          ))}
          {loading && <p>Thinking...</p>}
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 p-2 border border-gray-400 rounded-md"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Ask a question about your docs..."
          />
          <button className="border border-gray-400 rounded-md p-2 cursor-pointer" onClick={handleAsk} disabled={loading}>
            Ask
          </button>
        </div>
      </main>
    </div>
  );
}
