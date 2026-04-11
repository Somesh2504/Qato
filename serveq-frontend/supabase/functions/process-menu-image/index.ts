declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MenuItem = {
  name: string;
  price: number;
  is_veg: boolean;
};

type MenuCategory = {
  name: string;
  items: MenuItem[];
};

function stripDataUrlPrefix(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { mimeType: 'image/jpeg', base64: dataUrl };
}

function extractJsonBlock(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  return text.trim();
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toBooleanVeg(value: unknown, name: string) {
  if (typeof value === 'boolean') return value;
  const text = `${name} ${typeof value === 'string' ? value : ''}`.toLowerCase();
  if (/\b(non[-\s]?veg|egg|chicken|mutton|fish|meat)\b/.test(text)) return false;
  return true;
}

function normalizeCategories(payload: unknown): MenuCategory[] {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { categories?: unknown[] })?.categories)
      ? (payload as { categories: unknown[] }).categories
      : [];

  return source
    .map((category) => {
      const categoryObject = category as Record<string, unknown>;
      const categoryName = String(categoryObject.name || categoryObject.category || categoryObject.title || '').trim();
      const rawItems = Array.isArray(categoryObject.items)
        ? categoryObject.items
        : Array.isArray(categoryObject.dishes)
          ? categoryObject.dishes
          : [];

      const items = rawItems
        .map((item) => {
          const itemObject = item as Record<string, unknown>;
          const name = String(itemObject.name || itemObject.item_name || itemObject.title || '').trim();
          if (!name) return null;

          return {
            name,
            price: toNumber(itemObject.price || itemObject.amount || itemObject.cost),
            is_veg: toBooleanVeg(itemObject.is_veg ?? itemObject.veg, name),
          } satisfies MenuItem;
        })
        .filter(Boolean) as MenuItem[];

      if (!categoryName && items.length === 0) return null;
      return {
        name: categoryName || 'Menu',
        items,
      } satisfies MenuCategory;
    })
    .filter(Boolean) as MenuCategory[];
}

function buildPrompt(restaurantName: string) {
  return `You are extracting a restaurant menu from an image for QRAVE onboarding.

Restaurant name: ${restaurantName || 'Unknown'}

Return ONLY valid JSON with this exact shape:
{
  "categories": [
    {
      "name": "Category name",
      "items": [
        {
          "name": "Item name",
          "price": 120,
          "is_veg": true
        }
      ]
    }
  ]
}

Rules:
- Capture every visible food category.
- Capture every visible menu item with its primary price.
- If a menu has half/full or multiple prices, use the main or full price as the primary price.
- Guess is_veg from keywords and item names.
- Keep names concise and clean.
- If uncertain, include the best likely value rather than omitting it.
- Do not include markdown, explanations, or extra keys.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const image = body?.image as string | undefined;
    const restaurantName = String(body?.restaurantName || '');

    if (!image) {
      return new Response(JSON.stringify({ error: 'image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { mimeType, base64 } = stripDataUrlPrefix(image);
    const prompt = buildPrompt(restaurantName);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const text = await geminiResponse.text();
      return new Response(JSON.stringify({ error: 'Gemini request failed', details: text }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonText = extractJsonBlock(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return new Response(JSON.stringify({ error: 'Model returned invalid JSON', rawText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const categories = normalizeCategories(parsed);
    const itemCount = categories.reduce((sum, category) => sum + category.items.length, 0);

    return new Response(
      JSON.stringify({
        categories,
        summary: {
          categoryCount: categories.length,
          itemCount,
        },
        rawText,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to process menu image' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
