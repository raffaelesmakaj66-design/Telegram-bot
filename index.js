import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);
const ADMIN_IDS = process.env.ADMIN_ID?.split(",").map(id => Number(id.trim())) || [];

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ Config mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";
const REVIEWS_FILE = path.join(process.cwd(), "reviews.json");
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));

const reviewState = new Map();    
const reviewCooldown = new Map();
const REVIEW_COOLDOWN_MS = 60 * 1000;

const userState = new Map();      
const adminReplyMap = new Map();  
const ADMINS = new Set([SUPER_ADMIN, ...ADMIN_IDS]);

// =====================
// FUNZIONI
// =====================
const loadReviews = () => JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));
const saveReviews = (reviews) => fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
const saveReview = (review) => { const r = loadReviews(); r.push(review); saveReviews(r); };
const getAverage = () => { const r = loadReviews(); return r.length === 0 ? "0.0" : (r.reduce((a,b)=>a+b.rating,0)/r.length).toFixed(1); };
const escapeMarkdown = (t) => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei seguenti bottoni per continuare:`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Canale", url: CHANNEL_URL }],
        [{ text: "⚖️ Aste", callback_data: "OPEN_ASTA" }, { text: "📄 Listino", callback_data: "OPEN_LISTINO" }],
        [{ text: "📝 Ordina", callback_data: "OPEN_ORDINI" }, { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }],
        [{ text: "⭐ Lascia una Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "📢 Richiedi Sponsor", callback_data: "OPEN_SPONSOR" }],
        [{ text: "💼 Candidati dipendente", callback_data: "OPEN_CANDIDATURA" }]
      ]
    }
  });
});

// =====================
// CALLBACK QUERY
// =====================
bot.on("callback_query", (q) => {
  const userId = q.from.id;
  const chatId = q.message.chat.id;

  // ⭐ RECENSIONE
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();
    if (now - (reviewCooldown.get(userId) || 0) < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, { text: "⏳ Attendi un po’", show_alert: true });
      return;
    }
    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, chatId, waitingComment: true });

    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });
    bot.sendMessage(chatId,
      `Hai votato ⭐ ${rating}/5\nScrivi un commento o premi Skip`,
      { reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] } }
    );
    return;
  }

  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    saveReview({ rating, comment: null, userId });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.answerCallbackQuery(q.id, { text: "Recensione inviata!" });
    bot.sendMessage(chatId, `✅ Recensione inviata correttamente!\n⭐ ${rating}/5\n📊 Media attuale: ${avg} (${total} voti)`);

    ADMINS.forEach(id => bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`));
    reviewState.delete(userId);
    return;
  }

  // MENU
  switch(q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ Scegli un voto:", {
        reply_markup: { inline_keyboard: [[1,2,3,4,5].map(n => ({ text:`⭐ ${n}`, callback_data:`RATE_${n}` }))] }
      });
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(chatId, "*Listino Sponsor*\n• Base 1k\n• Medio 2.5k\n• Premium 5k\n• Elite 10k", { parse_mode:"Markdown" });
      break;

    case "OPEN_ASTA":
      userState.set(userId,"ASTA");
      bot.sendMessage(chatId,"*Modulo Asta*\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio",{ parse_mode:"Markdown" });
      break;

    case "OPEN_ORDINI":
      userState.set(userId,"ORDINE");
      bot.sendMessage(chatId,"*Modulo Ordinazioni*\n1️⃣ Nickname\n2️⃣ @Telegram\n3️⃣ Prodotti desiderati",{ parse_mode:"Markdown" });
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId,"ASSISTENZA");
      bot.sendMessage(chatId,"🆘 Scrivi il tuo messaggio per l’assistenza",{ parse_mode:"Markdown" });
      break;

    case "OPEN_SPONSOR":
      userState.set(userId,"SPONSOR");
      bot.sendMessage(chatId,"📢 Scrivi la richiesta sponsor",{ parse_mode:"Markdown" });
      break;

    case "OPEN_CANDIDATURA":
      bot.sendMessage(chatId,
`📝 *Come fare il curriculum*
1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome, ore settimanali (/tempo)
2️⃣ *Parlaci di te*: chi sei, passioni...
3️⃣ *Perché dovremmo sceglierti*
4️⃣ *Esperienze lavorative*: se presenti o attuali
5️⃣ *Competenze*: uso cassa e capacità di cucinare
6️⃣ *Pregi e difetti*

📍 *Consegna*: Bancarella 8, coordinate -505 64 22, davanti all’ospedale`, { parse_mode:"Markdown" });
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI
// =====================
bot.on("message", (msg) => {
  if (!msg.text) return;
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // ⭐ COMMENTO RECENSIONE
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    saveReview({ rating, comment: escapeMarkdown(msg.text), userId });

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ ${rating}/5\n💬 ${escapeMarkdown(msg.text)}\n📊 Media attuale: ${avg} (${total} voti)`
    );

    ADMINS.forEach(id => {
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${msg.from.first_name}\n⭐ ${rating}/5\n💬 ${escapeMarkdown(msg.text)}`, { parse_mode:"Markdown" });
    });
    return;
  }

  // MODULI / ASSISTENZA
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    bot.sendMessage(chatId, type === "ASSISTENZA" ? "✅ Messaggio inviato correttamente!" : "✅ Modulo inviato con successo!");

    ADMINS.forEach(id => {
      bot.sendMessage(id,
        `📩 *${type}*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escapeMarkdown(msg.text)}`,
        { parse_mode:"Markdown" }
      );
      adminReplyMap.set(id, { userId, chatId });
    });
    return;
  }

  // RISPOSTE ADMIN
  if (ADMINS.has(userId) && adminReplyMap.has(userId)) {
    const { userId: targetId, chatId: targetChat } = adminReplyMap.get(userId);
    adminReplyMap.delete(userId);

    bot.sendMessage(targetChat, `💬 *Risposta da ${msg.from.first_name}:*\n\n${escapeMarkdown(msg.text)}`, { parse_mode:"Markdown" });
    bot.sendMessage(chatId, "✅ Risposta inviata all’utente");

    ADMINS.forEach(id => { if (id !== userId) adminReplyMap.set(id, { userId: targetId, chatId: targetChat }); });
    return;
  }
});

// =====================
// /delreview
// =====================
bot.onText(/\/delreview(?: (\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  if (!ADMINS.has(fromId)) return bot.sendMessage(chatId,"❌ Non sei autorizzato a usare questo comando.");

  let reviews = loadReviews();
  if (reviews.length === 0) return bot.sendMessage(chatId,"⚠️ Nessuna recensione presente.");

  const targetUserId = match[1] ? Number(match[1]) : null;
  if (targetUserId) {
    const before = reviews.length;
    reviews = reviews.filter(r => r.userId !== targetUserId);
    saveReviews(reviews);
    bot.sendMessage(chatId, `✅ Eliminate ${before - reviews.length} recensioni dell'utente ${targetUserId}.`);
  } else {
    const removed = reviews.pop();
    saveReviews(reviews);
    bot.sendMessage(chatId, `✅ Eliminata l'ultima recensione di ⭐ ${removed.rating}/5.`);
  }
});

// =====================
// /id
// =====================
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});

// =====================
// /admin add / remove
// =====================
bot.onText(/\/admin (add|remove) (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  const chatId = msg.chat.id;
  if (fromId !== SUPER_ADMIN) return bot.sendMessage(chatId,"❌ Solo il super admin può usare questo comando.");

  const action = match[1];
  const targetId = Number(match[2]);

  if (action === "add") {
    ADMINS.add(targetId);
    bot.sendMessage(chatId, `✅ L'utente ${targetId} è stato aggiunto come admin.`);
  } else {
    if (targetId === SUPER_ADMIN) return bot.sendMessage(chatId,"❌ Non puoi rimuovere il super admin.");
    ADMINS.delete(targetId);
    bot.sendMessage(chatId, `✅ L'utente ${targetId} è stato rimosso dagli admin.`);
  }
});