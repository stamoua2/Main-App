// Génération IA (marketing) via l'API Gemini de Google.
// Texte : gemini-flash-latest. Image : gemini-2.5-flash-image.
// La clé (GEMINI_API_KEY) est au palier gratuit : en cas de quota atteint
// (HTTP 429), on renvoie un message clair plutôt qu'une erreur opaque.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-flash-latest";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

let fetchImpl: typeof fetch = (...args) => fetch(...args);

/** Tests : remplace fetch par une implémentation simulée. */
export function setGeminiFetchForTests(impl: typeof fetch | null): void {
  fetchImpl = impl ?? ((...args) => fetch(...args));
}

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  error?: { code?: number; message?: string };
}

async function geminiFetch(model: string, body: unknown): Promise<GeminiResponse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError(
      "Clé API Gemini manquante : configurez GEMINI_API_KEY dans les variables d'environnement.",
      503,
    );
  }
  const res = await fetchImpl(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    if (res.status === 429) {
      throw new GeminiError(
        "Quota Gemini atteint (palier gratuit). Réessayez dans quelques minutes ou demain — le quota d'images est plus limité que celui du texte.",
        429,
      );
    }
    throw new GeminiError(
      `Erreur Gemini : ${data.error?.message?.slice(0, 300) ?? `HTTP ${res.status}`}`,
      res.status,
    );
  }
  return data;
}

function partsOf(data: GeminiResponse): GeminiPart[] {
  return data.candidates?.[0]?.content?.parts ?? [];
}

/** Génère le texte d'une annonce. Retourne le texte brut (markdown léger). */
export async function generateAdText(prompt: string): Promise<string> {
  const data = await geminiFetch(TEXT_MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
  });
  const text = partsOf(data)
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new GeminiError("Gemini n'a retourné aucun texte.", 502);
  return text;
}

/** Génère une image publicitaire. Retourne une data URL (base64). */
export async function generateAdImage(prompt: string): Promise<string> {
  const data = await geminiFetch(IMAGE_MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
  });
  for (const part of partsOf(data)) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline) {
      const mime = (inline as { mimeType?: string; mime_type?: string }).mimeType ??
        (inline as { mime_type?: string }).mime_type ?? "image/png";
      return `data:${mime};base64,${inline.data}`;
    }
  }
  throw new GeminiError("Gemini n'a retourné aucune image.", 502);
}
