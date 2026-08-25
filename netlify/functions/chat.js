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

  SESSION 10 FIXES:
  Two things kept breaking because they only lived as WORDING in system-prompt.js, and
  AIs don't always follow wording perfectly:
    1. Budget (max AND now min) — a £65 trainer got shown for a £35 budget once.
    2. "Three picks" — five items came back once instead of three.
  Both are now checked in plain JavaScript after the AI replies, so the AI's opinion no
  longer matters — the code has the final say, every single time.
*/

const { PRODUCTS } = require("../../products.js");
const { SYSTEM_PROMPT } = require("./system-prompt.js");

// The cheapest current Claude Haiku model — fast and low-cost, which is what a
// chat function that runs on every message needs.
const MODEL = "claude-haiku-4-5-20251001";

// Rule 4's allowance — kept as one named constant so it only ever needs changing in one place.
const OVER_BUDGET_ALLOWANCE = 0.2; // 20%

// The most products ever shown at once, per "The answer format" rule in system-prompt.js.
const MAX_PICKS = 3;

// Looks through the shopper's messages for a stated budget and returns { min, max }.
// Either can be null if the shopper hasn't mentioned that side of it.
// Catches:
//   "between £20 and £40" / "20-40" / "20 to 40"   -> both min and max
//   "over £20" / "above £20" / "at least £20"      -> min only
//   "under £40" / "£40" / "budget £40"              -> max only
// NOTE: this is a simple pattern, not full language understanding — e.g. "between size 8
// and 10" could be misread as a min/max budget if it's not near a £ sign or the word
// "budget"/"price". Keep an eye on this in testing and we can tighten it if it misfires.
function extractBudgetRange(messages) {
  let min = null;
  let max = null;

  for (const m of messages) {
    if (m.role !== "user") continue;
    const text = typeof m.content === "string" ? m.content : "";
    const lower = text.toLowerCase();

    // Both numbers in one go, e.g. "between £20 and £40", "20-40", "20 to 40".
    const rangeMatch = lower.match(/[£$]?\s*(\d{1,4})\s*(?:-|to|and)\s*[£$]?\s*(\d{1,4})/);
    if (rangeMatch) {
      min = parseInt(rangeMatch[1], 10);
      max = parseInt(rangeMatch[2], 10);
      continue; // this message already gave us both — move to the next message
    }

    // Minimum only.
    const minMatch = lower.match(/(?:over|above|at least|minimum|min)\s*[£$]?\s*(\d{1,4})/);
    if (minMatch) {
      min = parseInt(minMatch[1], 10);
    }

    // Maximum only.
    const maxMatch =
      lower.match(/under\s*[£$]?\s*(\d{1,4})/) ||
      lower.match(/[£$]\s*(\d{1,4})/) ||
      lower.match(/budget\s*[£$]?\s*(\d{1,4})/);
    if (maxMatch) {
      // Keep overwriting as we go through in order, so the LATEST stated amount wins
      // (e.g. if the shopper changes their mind partway through the chat).
      max = parseInt(maxMatch[1], 10);
    }
  }

  return { min, max };
}

// The real safety net. Takes what the AI decided to show and the shopper's real budget
// range, and enforces the golden rule (plus the new minimum-budget rule) in code.
function enforceBudgetRange(productNames, aiOverBudgetNames, budgetRange) {
  const { min, max } = budgetRange;

  if (min === null && max === null) {
    // We don't know the budget yet, so there's nothing to check against.
    return { products: productNames, overBudget: aiOverBudgetNames };
  }

  const maxAllowed = max !== null ? max * (1 + OVER_BUDGET_ALLOWANCE) : null;
  const keptProducts = [];
  const correctedOverBudget = [];

  for (const name of productNames) {
    const product = PRODUCTS.find((p) => p.name === name);
    if (!product) continue; // not a real catalogue item — skip it

    // Minimum budget: a hard cut, straight from "only show products above that budget".
    if (min !== null && product.price < min) continue;

    // Maximum budget: never above the 20% top-up line, no matter what the AI said.
    if (maxAllowed !== null && product.price > maxAllowed) continue;

    keptProducts.push(name);
    if (max !== null && product.price > max) {
      // Between budget and the 20% top-up line — always label it, even if the AI forgot to.
      correctedOverBudget.push(name);
    }
  }

  return { products: keptProducts, overBudget: correctedOverBudget };
}

// SESSION 10: turns the shopper's style-quiz answers into an extra bit of system
// prompt — clearly labelled as ranking guidance ONLY. It's added after the golden
// rule and format instructions, and its wording makes clear it can never override
// them. Even if the AI ignored that wording completely, it wouldn't matter: budget
// and item count are already double-checked in code further down, regardless of
// what the AI decides here.
function buildPreferencesPrompt(preferences){
  if(!preferences) return "";
  const { styles, shops, colours } = preferences;
  const hasAnything =
    (styles && styles.length>0) || (shops && shops.length>0) || (colours && colours.length>0);
  if(!hasAnything) return "";

  return (
    "\n\nShopper style profile (from a quick optional quiz before the chat started). " +
    "Use this ONLY as a tiebreaker to help choose and order between items that already " +
    "pass the size and budget rules — for example, prefer an item in one of their " +
    "colours, or from one of their shops, over an equally valid alternative that isn't. " +
    "This profile must NEVER be used to justify showing an item that is the wrong size " +
    "or breaks the budget rule — those rules always come first, no matter what the " +
    "shopper's style profile says:\n" +
    JSON.stringify({
      favouriteStyles: styles || [],
      usualShops: shops || [],
      preferredColours: colours || []
    })
  );
}

exports.handler = async function (event) {
  // Only accept POST requests (that's what app.js will send).
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // app.js sends { messages: [...], preferences: {...} } — the whole conversation
    // so far, plus the shopper's style-quiz answers (if they didn't skip it).
    const { messages, preferences } = JSON.parse(event.body);

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
      buildPreferencesPrompt(preferences) +
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

    // SESSION 10 FIX 1: don't trust the AI's budget maths — check min AND max ourselves.
    const shopperBudget = extractBudgetRange(messages);
    const { products: safeProducts, overBudget: safeOverBudget } = enforceBudgetRange(
      parsed.products || [],
      parsed.overBudget || [],
      shopperBudget
    );

    // SESSION 10 FIX 2: don't trust the AI's "three picks" — cap it here, keeping the
    // AI's own order (it already ranks by best match, per Rule 5).
    const finalProducts = safeProducts.slice(0, MAX_PICKS);
    const finalOverBudget = safeOverBudget.filter((name) => finalProducts.includes(name));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: parsed.reply || rawText,
        products: finalProducts,
        overBudget: finalOverBudget,
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
