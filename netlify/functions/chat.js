/*
  netlify/functions/chat.js

  This file runs on Netlify's SERVERS, not in the shopper's browser — that's the whole
  point of a "serverless function". It's the only place allowed to know the secret
  Anthropic API key, because anything sitting inside app.js would be visible to
  literally anyone who opens the browser's dev tools on the live site.

  HOW THE KEY REACHES THIS FILE:
  It doesn't. This file just asks the computer for a variable called ANTHROPIC_API_KEY
  (via process.env.ANTHROPIC_API_KEY). The actual secret value is typed ONCE into
  Netlify's dashboard: Site settings → Environment variables → add ANTHROPIC_API_KEY.
  It is never written in this file, never committed to GitHub, and never sent to the browser.

  SESSION 10 FIX:
  The AI was asked (in system-prompt.js) to do budget maths itself — multiply the
  shopper's budget by 1.2 and never show anything priced above that. AIs don't always
  follow maths instructions perfectly, and real testing showed it slipping up (a £65
  trainer got shown for a £35 budget with no warning label).
  So this file no longer trusts the AI's maths. It works out the shopper's real budget
  itself using plain JavaScript, then double-checks every product the AI picked against
  the real price in the catalogue — deleting anything over budget and correcting the
  "over budget" labels itself. The AI can still get it right or wrong; it no longer matters,
  because JavaScript has the final say.
*/

const { PRODUCTS } = require("../../products.js");
const { SYSTEM_PROMPT } = require("./system-prompt.js");

// The cheapest current Claude Haiku model — fast and low-cost, which is what a
// chat function that runs on every message needs.
const MODEL = "claude-haiku-4-5-20251001";

// Rule 4's allowance — kept as one named constant so it only ever needs changing in one place.
const OVER_BUDGET_ALLOWANCE = 0.2; // 20%

// Looks through the shopper's messages (most recent first) for a stated budget,
// e.g. "under £35", "£35", "budget £35". Same pattern app.js's old parseQuery used,
// so the two stay consistent. Returns a number, or null if no budget has been mentioned yet.
function extractBudget(messages) {
  let budget = null;
  for (const m of messages) {
    if (m.role !== "user") continue;
    const text = typeof m.content === "string" ? m.content : "";
    const lower = text.toLowerCase();
    const match =
      lower.match(/under\s*[£$]?\s*(\d{1,4})/) ||
      lower.match(/[£$]\s*(\d{1,4})/) ||
      lower.match(/budget\s*[£$]?\s*(\d{1,4})/);
    if (match) {
      // Keep overwriting as we go through in order, so the LATEST stated budget wins
      // (e.g. if the shopper changes their mind partway through the chat).
      budget = parseInt(match[1], 10);
    }
  }
  return budget;
}

// The real safety net. Takes what the AI decided to show and the shopper's real budget,
// and enforces the golden rule in code — the AI's opinion no longer matters here.
function enforceBudget(productNames, aiOverBudgetNames, budget) {
  if (budget === null || budget <= 0) {
    // We don't know the budget yet (shopper hasn't stated one), so there's nothing
    // to check against — pass everything through unchanged.
    return { products: productNames, overBudget: aiOverBudgetNames };
  }

  const maxAllowed = budget * (1 + OVER_BUDGET_ALLOWANCE);
  const keptProducts = [];
  const correctedOverBudget = [];

  for (const name of productNames) {
    const product = PRODUCTS.find((p) => p.name === name);
    if (!product) continue; // not a real catalogue item — skip it

    if (product.price > maxAllowed) {
      // Breaks the golden rule outright — never shown, no matter what the AI said.
      continue;
    }
    keptProducts.push(name);
    if (product.price > budget) {
      // Between budget and the 20% top-up line — always label it, even if the AI forgot to.
      correctedOverBudget.push(name);
    }
  }

  return { products: keptProducts, overBudget: correctedOverBudget };
}

exports.handler = async function (event) {
  // Only accept POST requests (that's what app.js will send).
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // app.js sends { messages: [...] } — the whole conversation so far.
    const { messages } = JSON.parse(event.body);

    if (!Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "No messages provided." }) };
    }

    // Glue Allegra's rules together with the real product catalogue, so the AI always
    // recommends real items with real links instead of making things up.
    const fullSystemPrompt =
      SYSTEM_PROMPT +
      "\n\nHere is the full TruFit product catalogue as JSON. Only ever recommend items " +
      "from this list, using their exact name, price and link — never invent a product, " +
      "price or link that isn't in here:\n" +
      JSON.stringify(PRODUCTS) +
      // This bit isn't one of Allegra's rules — it's a technical formatting instruction so
      // app.js can turn the AI's answer back into real clickable product cards.
      "\n\nIMPORTANT — reply format: respond with ONLY valid JSON, no other text and no " +
      "markdown code fences, in exactly this shape:\n" +
      '{"reply": "your conversational message here", "products": ["Exact Product Name From Catalogue"], "overBudget": ["Exact Product Name From Catalogue, only if it is priced above what the shopper asked for"]}\n' +
      'Use the EXACT product name spelling from the catalogue above. If you have no products to suggest, use "products": [].';

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: fullSystemPrompt,
        messages: messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", data);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "The AI request failed." }),
      };
    }

    // The API returns an array of content blocks — join up the text ones.
    const rawText = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // The AI was told to reply in JSON so app.js can rebuild real product cards.
    // Sometimes it wraps the JSON in ```json fences even when told not to — strip
    // those out before trying to parse, rather than relying on it to be perfect.
    const cleanedText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      parsed = { reply: rawText, products: [], overBudget: [] };
    }

    // SESSION 10 FIX: don't trust the AI's budget maths — check it ourselves in code.
    const shopperBudget = extractBudget(messages);
    const { products: safeProducts, overBudget: safeOverBudget } = enforceBudget(
      parsed.products || [],
      parsed.overBudget || [],
      shopperBudget
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: parsed.reply || rawText,
        products: safeProducts,
        overBudget: safeOverBudget,
      }),
    };
  } catch (err) {
    console.error("TruFit chat function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Something went wrong on the server." }),
    };
  }
};
