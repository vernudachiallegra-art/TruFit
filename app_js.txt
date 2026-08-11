/* ---------------- STATE ---------------- */

let state = {
  stage: "start",       // "start" | "awaiting_size" | "awaiting_shoe_type"
  lastQuery: {},
  lastResults: [],
  refineTarget: null
};

let faves = [];

/* ---------------- DOM HELPERS ---------------- */

const chatLog = document.getElementById("chatLog");
const quickReplies = document.getElementById("quickReplies");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const favesList = document.getElementById("favesList");

function addMsg(text, sender="bot"){
  const div = document.createElement("div");
  div.className = "msg " + sender;
  div.innerHTML = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setQuickReplies(options){
  quickReplies.innerHTML = "";
  options.forEach(opt=>{
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = opt.label;
    chip.onclick = ()=> opt.action();
    quickReplies.appendChild(chip);
  });
}

function clearQuickReplies(){
  quickReplies.innerHTML = "";
}

/* ---------------- SHOP LINKS ---------------- */

const SHOP_NAMES = {
  "adidas.com":"Adidas",
  "isabelmarant.com":"Isabel Marant",
  "dickssportinggoods.com":"Dick's Sporting Goods",
  "bohobeachhut.com":"Boho Beach Hut",
  "ohpolly.com":"Oh Polly",
  "revolve.com":"Revolve",
  "greenwichsocialclub.com":"Greenwich Social Club",
  "mauijim.com":"Maui Jim",
  "withjean.com":"With Jean",
  "thereformation.com":"Reformation",
  "kookai.us":"Kookai",
  "revicedenim.com":"Revice Denim",
  "net-a-porter.com":"Net-a-Porter",
  "urbanoutfitters.com":"Urban Outfitters",
  "newlook.com":"New Look",
  "lululemon.co.uk":"Lululemon",
  "roman.co.uk":"Roman",
  "asos.com":"ASOS",
  "birkenstock.com":"Birkenstock",
  "ugg.com":"UGG",
  "toms.com":"TOMS",
  "vans.com":"Vans"
};

function getShopName(url){
  try{
    const host = new URL(url).hostname.replace("www.","");
    for(const key in SHOP_NAMES){
      if(host.includes(key)) return SHOP_NAMES[key];
    }
    const parts = host.split(".");
    const name = parts.length>2 ? parts[1] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch(e){
    return "Shop";
  }
}

/* ---------------- PARSING ---------------- */

// Category synonyms (Session 7 robustness fix — was breaking on "trainers", "jeans", etc.)
// Shoes are now split into six specific categories (Session 7).
// Add more slang here any time testing turns up a word that doesn't match.
const CATEGORY_SYNONYMS = {
  trainers: ["trainers","trainer","sneakers","sneaker","kicks"],
  heels: ["heels","heel","pumps","stilettos","stiletto"],
  boots: ["boots","boot","booties","bootie"],
  sandals: ["sandals","sandal","flip flops","flip-flops","slides"],
  flats: ["flats","flat shoes","ballet flats","loafers","loafer","oxfords","oxford"],
  wedges: ["wedges","wedge"],
  dresses: ["dresses","dress"],
  sunglasses: ["sunglasses","shades","sunnies"],
  tops: ["tops","top","tee","t-shirt","tshirt","shirt"],
  shorts: ["shorts","short"],
  trousers: ["trousers","trouser","pants","jeans"]
};

// Generic words that mean "some kind of shoe" but don't say which kind —
// these trigger the "what kind of shoe?" question instead of a direct match (Session 7).
const GENERIC_SHOE_WORDS = ["shoe","shoes","footwear"];

// Categories that only ever come in one size — skip the "what size?" ask for these.
const ONE_SIZE_CATEGORIES = ["sunglasses"];

// Word-to-number size recognition (e.g. "size seven" -> 7).
// Official rule (Session 7, Rule 2) after last week's live bug fix.
const NUMBER_WORDS = {
  "three":3, "four":4, "five":5, "six":6, "seven":7, "eight":8, "nine":9, "ten":10,
  "eleven":11, "twelve":12, "thirteen":13, "fourteen":14, "fifteen":15,
  "sixteen":16, "seventeen":17, "eighteen":18
};

function wordToSize(lower){
  for(const word in NUMBER_WORDS){
    const re = new RegExp("\\b" + word + "\\b");
    if(re.test(lower)) return NUMBER_WORDS[word];
  }
  return null;
}

// Shared size-extraction logic, used both for full queries and for the
// "what size are you after?" follow-up reply.
function extractSizeFromText(lower){
  let sizeMatch = lower.match(/size\s*(\d{1,2})/);
  let sizeWordMatch = lower.match(/size\s+([a-z]+)/);
  if(sizeMatch){
    return parseInt(sizeMatch[1]);
  }
  if(sizeWordMatch && NUMBER_WORDS[sizeWordMatch[1]]!==undefined){
    return NUMBER_WORDS[sizeWordMatch[1]];
  }
  let numMatch = lower.match(/\b(\d{1,2})\b/);
  if(numMatch && !lower.includes("£")){
    let n = parseInt(numMatch[1]);
    if(n>=3 && n<=18) return n;
  }
  let wordSize = wordToSize(lower);
  if(wordSize!==null) return wordSize;
  return null;
}

function parseQuery(text){
  const lower = text.toLowerCase();
  const result = { category:null, size:null, budget:null, styles:[], genericShoe:false };

  for(const c of CATEGORIES){
    if(CATEGORY_SYNONYMS[c].some(word => lower.includes(word))){
      result.category = c;
      break;
    }
  }

  // No specific shoe type matched, but a generic shoe word was used — flag it
  // so handleUserText can ask "what kind of shoe?" instead of guessing.
  if(!result.category && GENERIC_SHOE_WORDS.some(word => lower.includes(word))){
    result.genericShoe = true;
  }

  result.size = extractSizeFromText(lower);

  let budgetMatch = lower.match(/under\s*£?\s*(\d{1,4})/) || lower.match(/£\s*(\d{1,4})/) || lower.match(/budget\s*£?\s*(\d{1,4})/);
  if(budgetMatch){
    result.budget = parseInt(budgetMatch[1]);
  }

  STYLE_WORDS.forEach(w=>{
    if(lower.includes(w)) result.styles.push(w);
  });

  return result;
}

function validateQuery(q, rawText){
  if(!rawText || rawText.trim().length===0){
    return "Oops — looks like you didn't type anything. Try something like: <b>dress size 10 under £30 party</b>";
  }
  if(/^[^a-zA-Z0-9]+$/.test(rawText.trim())){
    return "That's just punctuation! Try telling me what you're after, like: <b>trainers size 6 under £25 casual</b>";
  }
  if(!q.category && !q.genericShoe){
    return "I couldn't spot what you're shopping for. Pick a category: trainers, heels, boots, sandals, flats, wedges, dresses, sunglasses, tops, shorts or trousers.";
  }
  if(q.size!==null && (q.size<3 || q.size>18)){
    return "That size looks a bit off — most items run from size 3 to 18 (or one size for sunglasses). Mind double-checking?";
  }
  if(q.budget!==null && q.budget<=0){
    return "Your budget needs to be more than £0! Try again with a real number, like under £25.";
  }
  return null;
}

/* ---------------- MATCHING ---------------- */
/*
  TruFit matching rules (Session 7 — written by Allegra, implemented exactly):
  1. Keep only the right category
  2. Keep only the shopper's EXACT size — never broken, ever (word sizes count)
     2a. If no size was given at all, ASK for one — unless the category is one-size-fits-all
  3. Keep items within budget
  4. If fewer than 3 are left, allow up to 20% over budget — but label it
  5. Rank what's left by style match
  6. Show the top 3
*/

const OVER_BUDGET_ALLOWANCE = 0.20; // 20% — Rule 4

function findMatches(q){

  // Rule 1: category
  let pool = PRODUCTS.filter(p => p.cat === q.category);

  // Rule 2: exact size — GOLDEN RULE, never relaxed under any circumstance
  if(q.size !== null){
    pool = pool.filter(p => p.sizes.includes("one size") || p.sizes.includes(q.size));
  }

  // Rule 3: within budget
  let withinBudget = pool;
  if(q.budget !== null){
    withinBudget = pool.filter(p => p.price <= q.budget);
  }

  // Mark these as NOT over budget
  let candidates = withinBudget.map(p => Object.assign({}, p, { overBudget:false }));

  // Rule 4: if fewer than 3 remain, top up with near-budget matches (up to 20% over),
  // still respecting category + exact size, clearly labelled
  if(q.budget !== null && candidates.length < 3){
    const maxAllowed = q.budget * (1 + OVER_BUDGET_ALLOWANCE);
    const nearBudget = pool
      .filter(p => p.price > q.budget && p.price <= maxAllowed)
      .map(p => Object.assign({}, p, { overBudget:true }));
    candidates = candidates.concat(nearBudget);
  }

  // Rule 5: rank by style match (does NOT filter anything out — just orders it)
  candidates.sort((a,b)=>{
    let aScore = a.style.filter(s=>q.styles.includes(s)).length;
    let bScore = b.style.filter(s=>q.styles.includes(s)).length;
    if(bScore !== aScore) return bScore - aScore;
    // tie-break: prefer in-budget items, then cheaper first
    if(a.overBudget !== b.overBudget) return a.overBudget ? 1 : -1;
    return a.price - b.price;
  });

  // Rule 6: top 3
  return candidates.slice(0,3);
}

/* ---------------- RENDER RESULTS ---------------- */

function renderResults(results, q){
  if(results.length===0){
    addMsg("Hmm, I couldn't find anything matching that exactly. Want to try loosening your budget or size?");
    setQuickReplies([
      {label:"Try again", action: resetToStart}
    ]);
    return;
  }

  results.forEach(p=>{
    const cardId = "card_" + Math.random().toString(36).slice(2,9);
    const priceHtml = p.overBudget
      ? `<div class="card-price over-budget">⚠️ A little over budget — £${p.price}</div>`
      : `<div class="card-price">£${p.price}</div>`;
    const cardHtml = `
      <div class="card" id="${cardId}">
        <div class="card-cat">${p.cat}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-details">Size: ${Array.isArray(p.sizes)? p.sizes.join(", "): p.sizes}</div>
        ${priceHtml}
        ${p.link ? `<a class="view-link" href="${p.link}" target="_blank" rel="noopener noreferrer">View at ${getShopName(p.link)} →</a>` : ""}
        <div class="card-actions">
          <button class="save-btn" data-name="${p.name}">🤍 Save</button>
          <button class="notquite-btn" data-name="${p.name}">Not quite right</button>
          ${p.pairsWith.length>0 ? `<button class="look-btn" data-name="${p.name}">Build the Look</button>` : ""}
        </div>
        <div class="not-quite-box" style="display:none;"></div>
        <div class="look-section" style="display:none;"></div>
      </div>`;
    const div = document.createElement("div");
    div.className = "msg bot";
    div.innerHTML = cardHtml;
    chatLog.appendChild(div);

    if(p.link){
      const cardEl = div.querySelector(".card");
      cardEl.addEventListener("click", (e)=>{
        if(e.target.closest("button") || e.target.closest("a")) return;
        window.open(p.link, "_blank", "noopener");
      });
    }
  });
  chatLog.scrollTop = chatLog.scrollHeight;

  wireCardButtons(results, q);

  setQuickReplies([
    {label:"Search again", action: resetToStart}
  ]);
}

function wireCardButtons(results, q){
  document.querySelectorAll(".save-btn").forEach(btn=>{
    btn.onclick = ()=>{
      const name = btn.dataset.name;
      const product = PRODUCTS.find(p=>p.name===name);
      toggleFave(product, btn);
    };
  });

  document.querySelectorAll(".notquite-btn").forEach(btn=>{
    btn.onclick = ()=>{
      const name = btn.dataset.name;
      const product = PRODUCTS.find(p=>p.name===name);
      const card = btn.closest(".card");
      const box = card.querySelector(".not-quite-box");
      box.style.display = "block";
      box.innerHTML = `
        <div>What's the issue?</div>
        <div class="quick-replies" style="margin-top:8px;">
          <div class="chip" data-issue="price">Too pricey</div>
          <div class="chip" data-issue="size">Wrong size</div>
          <div class="chip" data-issue="vibe">Wrong vibe</div>
        </div>`;
      box.querySelectorAll(".chip").forEach(chip=>{
        chip.onclick = ()=> handleNotQuiteRight(product, chip.dataset.issue, q, box);
      });
    };
  });

  document.querySelectorAll(".look-btn").forEach(btn=>{
    btn.onclick = ()=>{
      const name = btn.dataset.name;
      const product = PRODUCTS.find(p=>p.name===name);
      const card = btn.closest(".card");
      const section = card.querySelector(".look-section");
      buildTheLook(product, section);
    };
  });
}

function handleNotQuiteRight(product, issue, q, box){
  let newQuery = Object.assign({}, q);
  let msg = "";

  if(issue==="price"){
    newQuery.budget = Math.max(5, Math.floor(product.price * 0.7));
    msg = `Got it — looking for something cheaper than £${newQuery.budget}...`;
  } else if(issue==="size"){
    box.innerHTML = `<div>No worries — what size do you need?</div>`;
    const sizeInput = document.createElement("input");
    sizeInput.type = "text";
    sizeInput.placeholder = "e.g. 8";
    sizeInput.style = "margin-top:8px;padding:8px;border-radius:10px;border:1px solid #ddd;width:100%;";
    box.appendChild(sizeInput);
    const goBtn = document.createElement("button");
    goBtn.textContent = "Update";
    goBtn.style = "margin-top:8px;background:var(--main);color:white;border:none;border-radius:12px;padding:6px 14px;";
    goBtn.onclick = ()=>{
      const val = parseInt(sizeInput.value);
      if(isNaN(val)){
        addMsg("That doesn't look like a size — try a number like 8 or 10.", "error");
        return;
      }
      newQuery.size = val;
      addMsg(`Looking for size ${val} instead...`);
      const results = findMatches(newQuery);
      renderResults(results, newQuery);
    };
    box.appendChild(goBtn);
    return;
  } else if(issue==="vibe"){
    box.innerHTML = `<div>What vibe are you after instead?</div>
      <div class="quick-replies" style="margin-top:8px;">
        ${STYLE_WORDS.map(w=>`<div class="chip" data-style="${w}">${w}</div>`).join("")}
      </div>`;
    box.querySelectorAll(".chip").forEach(chip=>{
      chip.onclick = ()=>{
        newQuery.styles = [chip.dataset.style];
        addMsg(`Looking for something more ${chip.dataset.style}...`);
        const results = findMatches(newQuery);
        renderResults(results, newQuery);
      };
    });
    return;
  }

  addMsg(msg);
  const results = findMatches(newQuery);
  renderResults(results, newQuery);
}

function buildTheLook(product, section){
  if(product.pairsWith.length===0){
    section.style.display = "block";
    section.innerHTML = "<h4>No pairing suggestions for this item.</h4>";
    return;
  }
  const pairCat = product.pairsWith[Math.floor(Math.random()*product.pairsWith.length)];
  let candidates = PRODUCTS.filter(p=>p.cat===pairCat && p.style.some(s=>product.style.includes(s)));
  if(candidates.length===0){
    candidates = PRODUCTS.filter(p=>p.cat===pairCat);
  }
  const pick = candidates[Math.floor(Math.random()*candidates.length)];

  section.style.display = "block";
  section.innerHTML = `
    <h4>Complete the look with:</h4>
    <div class="card-name">${pick.name}</div>
    <div class="card-details">${pick.cat} · Size: ${Array.isArray(pick.sizes)? pick.sizes.join(", "): pick.sizes}</div>
    <div class="card-price">£${pick.price}</div>
  `;
}

/* ---------------- FAVES ---------------- */

function toggleFave(product, btn){
  const idx = faves.findIndex(f=>f.name===product.name);
  if(idx>=0){
    faves.splice(idx,1);
    btn.textContent = "🤍 Save";
    btn.classList.remove("saved");
  } else {
    faves.push(product);
    btn.textContent = "❤️ Saved";
    btn.classList.add("saved");
  }
  renderFaves();
}

function renderFaves(){
  favesList.innerHTML = "";
  if(faves.length===0){
    favesList.innerHTML = `<div class="empty-msg">No faves yet — heart something in chat to save it here!</div>`;
    return;
  }
  faves.forEach(p=>{
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="card-cat">${p.cat}</div>
      <div class="card-name">${p.name}</div>
      <div class="card-details">Size: ${Array.isArray(p.sizes)? p.sizes.join(", "): p.sizes}</div>
      <div class="card-price">£${p.price}</div>
      <div class="card-actions">
        <button class="remove-fave-btn">Remove</button>
      </div>
    `;
    div.querySelector(".remove-fave-btn").onclick = ()=>{
      faves = faves.filter(f=>f.name!==p.name);
      renderFaves();
      document.querySelectorAll(`.save-btn[data-name="${p.name}"]`).forEach(b=>{
        b.textContent = "🤍 Save";
        b.classList.remove("saved");
      });
    };
    favesList.appendChild(div);
  });
}

/* ---------------- AI CHAT (Session 8) ---------------- */

// Keeps every message so far in the shape the Anthropic API expects:
// [{role:"user", content:"..."}, {role:"assistant", content:"..."}, ...]
let conversationHistory = [];

async function sendToAI(text){
  conversationHistory.push({ role:"user", content: text });

  // Show a "thinking" bubble while we wait for the AI to reply
  const thinkingDiv = document.createElement("div");
  thinkingDiv.className = "msg bot thinking";
  thinkingDiv.textContent = "TruFit is thinking...";
  chatLog.appendChild(thinkingDiv);
  chatLog.scrollTop = chatLog.scrollHeight;

  try{
    const response = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversationHistory })
    });
    const data = await response.json();
    thinkingDiv.remove();

    if(!response.ok || data.error){
      addMsg("Sorry, something went wrong talking to the AI. Try again in a sec.", "error");
      return;
    }

    addMsg(data.reply);
    conversationHistory.push({ role:"assistant", content: data.reply });
  } catch(err){
    thinkingDiv.remove();
    addMsg("Sorry, I couldn't reach the AI right now. Check your connection and try again.", "error");
  }
}

/* ---------------- CHAT FLOW ---------------- */

function resetToStart(){
  clearQuickReplies();
  state.stage = "start";
  addMsg("What are you looking for? Try: trainers, heels, boots, sandals, flats, wedges, dresses, sunglasses, tops, shorts or trousers — with your size, budget and style if you've got them!");
}

function proceedWithSearch(q){
  let confirmBits = [q.category];
  if(q.size!==null) confirmBits.push("size " + q.size);
  if(q.budget!==null) confirmBits.push("under £" + q.budget);
  if(q.styles.length>0) confirmBits.push(q.styles.join("/") + " style");

  addMsg("Searching for " + confirmBits.join(", ") + " — here's what I found:");
  const results = findMatches(q);
  state.lastResults = results;
  renderResults(results, q);
}

// Called once we know the category for sure — checks Rule 2a (ask for size)
// before running the actual search.
function afterCategoryKnown(q){
  if(q.size===null && !ONE_SIZE_CATEGORIES.includes(q.category)){
    state.lastQuery = q;
    state.stage = "awaiting_size";
    addMsg(`What size are you after for ${q.category}?`);
    return;
  }
  state.lastQuery = q;
  proceedWithSearch(q);
}

// Shows tappable chips for the six shoe types when someone just says "shoes".
function askShoeType(q){
  state.lastQuery = q;
  state.stage = "awaiting_shoe_type";
  addMsg("What kind of shoe are you after?");
  setQuickReplies(SHOE_CATEGORIES.map(cat => ({
    label: cat.charAt(0).toUpperCase() + cat.slice(1),
    action: ()=>{
      clearQuickReplies();
      addMsg(cat.charAt(0).toUpperCase() + cat.slice(1), "user");
      let q2 = Object.assign({}, state.lastQuery);
      q2.category = cat;
      state.stage = "start";
      afterCategoryKnown(q2);
    }
  })));
}

function handleUserText(text){
  addMsg(text, "user");
  userInput.value = "";

  // Rule 2a follow-up: we already have a category + budget/styles, just waiting on size
  if(state.stage === "awaiting_size"){
    const sizeVal = extractSizeFromText(text.toLowerCase());
    if(sizeVal===null || sizeVal<3 || sizeVal>18){
      addMsg("That doesn't look like a size — try a number like 8, or a word like \"ten\".", "error");
      return;
    }
    state.lastQuery.size = sizeVal;
    state.stage = "start";
    proceedWithSearch(state.lastQuery);
    return;
  }

  // "What kind of shoe?" follow-up, in case someone types instead of tapping a chip
  if(state.stage === "awaiting_shoe_type"){
    const lower = text.toLowerCase();
    let matchedCat = null;
    for(const c of SHOE_CATEGORIES){
      if(CATEGORY_SYNONYMS[c].some(w=>lower.includes(w))){ matchedCat = c; break; }
    }
    if(!matchedCat){
      addMsg("Sorry, I didn't catch the shoe type — try trainers, heels, boots, sandals, flats or wedges.", "error");
      return;
    }
    clearQuickReplies();
    let q2 = Object.assign({}, state.lastQuery);
    q2.category = matchedCat;
    state.stage = "start";
    afterCategoryKnown(q2);
    return;
  }

  // Session 8: free-text messages now go to the real AI (via the Netlify function)
  // instead of the old scripted parseQuery/findMatches logic.
  sendToAI(text);
}

sendBtn.onclick = ()=>{
  const text = userInput.value;
  handleUserText(text);
};

userInput.addEventListener("keydown", e=>{
  if(e.key==="Enter") handleUserText(userInput.value);
});

/* ---------------- TABS ---------------- */

document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.screen).classList.add("active");
  };
});

/* ---------------- INIT ---------------- */

addMsg("Hey! I'm TruFit 👋 Tell me what you're shopping for — category, size, budget and style all in one go if you like. E.g. <i>dress size 10 under £30 party trendy</i>");
renderFaves();
