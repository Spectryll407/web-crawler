import OpenAI from "openai";
import { config } from "./config";
import { PermanentError } from "./errors";

// Prompt from the spec, unchanged.
const PROMPT =
  "Descrivi layout, gerarchia visiva, palette, tipografia, pattern UI, densità contenuti. " +
  "Evita contenuti testuali del sito; concentrati su design e UX.";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.openaiApiKey) throw new PermanentError("openai_error: OPENAI_API_KEY is not set");
  // maxRetries 0: the queue already retries the whole job, two retry layers would blow the timing.
  client ??= new OpenAI({ apiKey: config.openaiApiKey, timeout: config.openaiTimeoutMs, maxRetries: 0 });
  return client;
}

export async function describeScreenshot(image: Buffer): Promise<string> {
  const openai = getClient();

  try {
    const res = await openai.chat.completions.create({
      model: config.openaiModel,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content:
            "You are a senior UI/UX designer. Start directly with the analysis, no preamble. " +
            "Write plain text, not Markdown: one short title per section on its own line, then a few sentences.",
        },
        {
          role: "user",
          content: [
            // The prompt is in Italian; without this the answer language flips between runs.
            { type: "text", text: `${PROMPT}\n\nWrite the answer in English.` },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}` } },
          ],
        },
      ],
    });

    const text = res.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("openai_error: empty response");
    return text;
  } catch (err) {
    if (err instanceof OpenAI.APIError && err.status) {
      // Wrong key, bad request, no access to the model: retrying won't help.
      if ([400, 401, 403, 404].includes(err.status)) {
        throw new PermanentError(`openai_error: ${err.message}`);
      }
      // 429 and 5xx are worth another try.
      throw new Error(`openai_error: ${err.message}`);
    }
    throw err;
  }
}
