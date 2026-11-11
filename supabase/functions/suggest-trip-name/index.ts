import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, key, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply({ error: "Please sign in first." }, 401);

  const { destination, country, days, travelers, title, tagline } = await req.json().catch(() => ({}));
  if (!destination) return reply({ error: "Destination is required." }, 400);

  const trip = [
    `Destination: ${String(destination).slice(0, 80)}${country ? ", " + String(country).slice(0, 80) : ""}`,
    days ? `Length: ${Number(days)} days` : "",
    travelers ? `Travelers: ${Number(travelers)}` : "",
    title ? `Trip name: ${String(title).slice(0, 80)}` : "",
    tagline ? `Vibe: ${String(tagline).slice(0, 120)}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You name trips for a travel planning app.
Suggest 3 short, catchy trip names (2 to 5 words each) and a one-line tagline (max 8 words) for each.
If a trip name is given, keep it and write 3 different taglines that fit it.
${trip}
Reply only with JSON in this format: [{"name": "...", "tagline": "..."}]`;

  const models = [Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"];
  let res: Response | null = null;
  for (const model of models) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")!, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 1 },
      }),
    });
    if (res.ok || ![404, 429, 500, 503].includes(res.status)) break;
    console.warn(`${model} unavailable (${res.status}), trying the next model`);
  }

  if (!res!.ok) {
    const detail = (await res!.json().catch(() => ({}))).error?.message ?? "";
    console.error("Gemini error", res!.status, detail);
    return reply({ error: `Gemini error ${res!.status}: ${detail}` }, 502);
  }

  const data = await res!.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

  try {
    const suggestions = JSON.parse(text)
      .filter((s: { name?: unknown }) => typeof s?.name === "string")
      .slice(0, 3)
      .map((s: { name: string; tagline?: string }) => ({ name: s.name.slice(0, 80), tagline: (s.tagline ?? "").slice(0, 120) }));
    return reply({ suggestions });
  } catch {
    console.error("Could not read the AI reply:", text);
    return reply({ error: "Could not read the AI reply." }, 502);
  }
});