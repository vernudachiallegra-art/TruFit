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
*/

const { PRODUCTS } = require("../../products.js");
const { SYSTEM_PROMPT } = require("./system-prompt.js");

// The cheapest current Claude Haiku model — fast and low-cost, which is what a
// chat function that runs on every message needs.
const MODEL = "claude-haiku-4-5-20251001";

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
    // If it ever slips up and sends plain text instead, fall back gracefully
    // rather than showing the shopper a broken page.
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      parsed = { reply: rawText, products: [], overBudget: [] };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: parsed.reply || rawText,
        products: parsed.products || [],
        overBudget: parsed.overBudget || [],
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
