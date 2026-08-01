// Embeddings for the corpus. See docs/search-architecture.md §4.2.
//
// Voyage rather than anything else, for two reasons: `voyage-3` is 1024-dimensional, which is what
// the Atlas vector index in docs/atlas-indexes.json is declared for, and Anthropic doesn't offer an
// embeddings API at all — so this is the one place the architecture needs a second vendor.
//
// WHAT GETS EMBEDDED is the interesting decision. Not the raw post: `problemStatement + body`.
// The raw post is in the author's idiosyncratic voice; the problem statement is in the same neutral
// register the query planner writes in. Embedding them together deliberately collapses the
// vocabulary gap between how people complain and how founders describe their product, which is why
// naive semantic search over raw posts underperforms.

export const EMBED_MODEL = "voyage-3";
export const EMBED_DIMS = 1024;
const API = "https://api.voyageai.com/v1/embeddings";

// Voyage accepts up to 128 inputs per request. Batching is most of the cost saving.
export const EMBED_BATCH_SIZE = 96;

export function hasEmbeddingProvider(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

/** The text actually embedded for a document. Exported so retrieval can mirror it exactly. */
export function embeddingInput(doc: { problemStatement?: string; title?: string; body: string }): string {
  const statement = (doc.problemStatement ?? "").trim();
  const body = `${doc.title ? `${doc.title}\n` : ""}${doc.body}`.slice(0, 2000);
  return statement ? `${statement}\n\n${body}` : body;
}

/**
 * Embeds a batch. `inputType` matters: Voyage encodes documents and queries differently, and using
 * the wrong one measurably degrades recall — a mistake that produces plausible-but-worse results
 * rather than an error, so it is worth being explicit at every call site.
 */
export async function embed(opts: {
  texts: string[];
  inputType: "document" | "query";
  timeoutMs?: number;
}): Promise<number[][]> {
  const { texts, inputType, timeoutMs = 30_000 } = opts;
  if (texts.length === 0) return [];
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set — embeddings are unavailable.");

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts.map((t) => t.slice(0, 8000)),
      input_type: inputType,
      output_dimension: EMBED_DIMS,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const out: number[][] = new Array(texts.length);
  for (const row of json.data ?? []) out[row.index] = row.embedding;
  // A missing row would silently shift every subsequent embedding onto the wrong document, so this
  // fails loudly rather than storing a mismatched vector.
  if (out.some((v) => !v)) throw new Error("Voyage returned fewer embeddings than inputs.");
  return out;
}
