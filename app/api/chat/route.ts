import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const { question, context, apiKey } = await req.json();

  if (!apiKey) {
    return NextResponse.json({ error: "No API key provided." }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant that answers questions based only on the provided documentation.
If the answer isn't in the context, say so. Don't make things up.

Here is the relevant documentation:

${context}`,
      },
      {
        role: "user",
        content: question,
      },
    ],
  });

  const answer = completion.choices[0].message.content;
  return NextResponse.json({ answer });
}