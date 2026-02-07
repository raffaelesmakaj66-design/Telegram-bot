import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ Config mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================
// FILE E COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";
const REVIEWS_FILE = path.join(process.cwd(), "reviews.json");
const CHATLOG_FILE = path.join(process.cwd(), "chatlog.json");
const ADMINS_FILE = path.join(process.cwd(), "admins.json");

// =====================
// HELPERS
// =====================
const escapeMarkdown = (text) => text.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
const loadJSON = (file, defaultData) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : defaultData;
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// =====================
// STATI
// =====================
let ADMINS = new Set(loadJSON(ADMINS_FILE, [SUPER_ADMIN]));
const userState = new Map(); // userId -> tipo modulo ("ASSISTENZA","ORDINE","ASTA","SPONSOR","CANDIDATURA")
const reviewState = new Map(); // userId -> {rating, chatId, waitingComment}
const reviewCooldown = new Map();
const REVIEW_COOLDOWN_MS = 60*1000;

// mappa chat tra admin e utente per conversazione assistenza
const lastMessageMap = new Map(); // userId -> last message sender ("USER"|"ADMIN")
const adminReplyMap = {}; // adminId -> userId (ultimo utente a cui deve rispondere)

// =====================
// FUNZIONI RECENSIONI
// =====================
const saveReview = (review) => {
  const reviews = loadJSON(REVIEWS_FILE, []);
  reviews.push(review);
  saveJSON(REVIEWS_FILE, reviews);
};

const getAverage = () => {
  const reviews = loadJSON(REVIEWS_FILE, []);
  if (!reviews.length) return "0.0";
  const sum = reviews.reduce((a,r)=>a+r.rating,0);
  return (sum/reviews.length).toFixed(1);
};

// =====================
// LOG CHAT
// =====================
const saveChatLog = (entry) => {
  const logs = loadJSON(CHATLOG_FILE, []);
  logs.push(entry);
  saveJSON(CHATLOG_FILE, logs);
};

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei bottoni per continuare:`,
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
      bot.answerCallbackQuery(q.id, { text: "⏳ Attendi prima di lasciare un'altra recensione", show_alert: true });
      return;
    }
    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, chatId, waitingComment: true });
    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });
    bot.sendMessage(chatId, `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`, {
      reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] }
    });
    return;
  }

  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    saveReview({ rating, comment: null, userId, timestamp: new Date().toISOString() });

    const avg = getAverage();
    const total = loadJSON(REVIEWS_FILE, []).length;

    bot.answerCallbackQuery(q.id, { text: "Recensione inviata!" });
    bot.sendMessage(chatId,
      `✅ Recensione inviata correttamente!\n⭐ Voto: ${rating}/5\n📊 Media attuale: ${avg} (${total} voti)`
    );

    ADMINS.forEach(id =>
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`)
    );

    reviewState.delete(userId);
    return;
  }

  // MENU
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ *Lascia una recensione*\nMetti un voto da 1 a 5", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[
          { text: "⭐ 1", callback_data:"RATE_1" },
          { text: "⭐ 2", callback_data:"RATE_2" },
          { text: "⭐ 3", callback_data:"RATE_3" },
          { text: "⭐ 4", callback_data:"RATE_4" },
          { text: "⭐ 5", callback_data:"RATE_5" }
        ]] }
      });
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(chatId, "📄 *Listino Sponsor*\n• Base 1k\n• Medio 2.5k\n• Premium 5k\n• Elite 10k", { parse_mode:"Markdown" });
      break;

    case "OPEN_ASTA":
      userState.set(userId, "ASTA");
      bot.sendMessage(chatId, "🏷️ *Modulo Asta*\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio\n📌 Invia tutto in un unico messaggio", { parse_mode:"Markdown" });
      break;

    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId, "📝 *Modulo Ordini*\n1️⃣ Nickname\n2️⃣ @Telegram\n3️⃣ Prodotti desiderati\n📌 Invia tutto in un unico messaggio", { parse_mode:"Markdown" });
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      lastMessageMap.set(userId, "USER");
      bot.sendMessage(chatId, "🆘 Scrivi il tuo messaggio per l’assistenza", { parse_mode:"Markdown" });
      break;

    case "OPEN_SPONSOR":
      userState.set(userId, "SPONSOR");
      bot.sendMessage(chatId, "📢 Richiesta sponsor\nScrivi tipo, durata, dettagli aggiuntivi seguendo il listino", { parse_mode:"Markdown" });
      break;

    case "OPEN_CANDIDATURA":
      userState.set(userId, "CANDIDATURA");
      bot.sendMessage(chatId, `📝 *Modulo Candidatura Dipendente*\n1️⃣ Dati personali: @Telegram, Discord, telefono, nome e ore disponibili\n2️⃣ Parlaci di te\n3️⃣ Perché dovremmo sceglierti\n4️⃣ Esperienze lavorative\n5️⃣ Competenze\n6️⃣ Pregi e difetti\n📍 Bancarella 8`, { parse_mode:"Markdown" });
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI UTENTE / ADMIN
// =====================
bot.on("message", (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Commento recensione
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    saveReview({ rating, comment: escapeMarkdown(msg.text), userId, timestamp: new Date().toISOString() });
    const avg = getAverage();
    const total = loadJSON(REVIEWS_FILE, []).length;

    bot.sendMessage(chatId, `✅ Recensione inviata correttamente!\n⭐ Voto: ${rating}/5\n💬 Commento: ${escapeMarkdown(msg.text)}\n📊 Media: ${avg} (${total} voti)`);
    ADMINS.forEach(id =>
      bot.sendMessage(id, `⭐ Recensione\n👤 ${msg.from.first_name}\n⭐ ${rating}/5\n💬 ${escapeMarkdown(msg.text)}`, { parse_mode:"Markdown" })
    );
    return;
  }

  // MODULI / ASSISTENZA
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);
    lastMessageMap.set(userId, "USER");

    bot.sendMessage(chatId, type==="ASSISTENZA" ? "✅ Messaggio inviato con successo!" : "✅ Modulo inviato con successo!");

    ADMINS.forEach(adminId => {
      bot.sendMessage(adminId, `📩 *${type}*\n👤 ${msg.from.first_name} (@${msg.from.username||"nessuno"})\n🆔 ${userId}\n\n${escapeMarkdown(msg.text)}`, { parse_mode:"Markdown" });
      adminReplyMap[adminId] = userId; // collega admin → utente
    });

    saveChatLog({ type, userId, text: msg.text, timestamp: new Date().toISOString() });
    return;
  }

  // RISPOSTA ADMIN
  if (ADMINS.has(userId) && adminReplyMap[userId]) {
    const targetUser = adminReplyMap[userId];
    if (!lastMessageMap.has(targetUser) || lastMessageMap.get(targetUser) !== "USER") return;

    bot.sendMessage(targetUser, `💬 *Risposta da ${msg.from.first_name}:*\n\n${escapeMarkdown(msg.text)}`, { parse_mode:"Markdown" });
    bot.sendMessage(chatId, "✅ Messaggio inviato con successo!");
    lastMessageMap.set(targetUser, "ADMIN");

    // Tutti gli admin vedono la risposta
    ADMINS.forEach(adminId => {
      if (adminId!==userId)
        bot.sendMessage(adminId, `💬 *${msg.from.first_name} ha risposto a ${targetUser}:*\n${escapeMarkdown(msg.text)}`, { parse_mode:"Markdown" });
    });

    saveChatLog({ type:"admin_reply", adminId:userId, userId:targetUser, text:msg.text, timestamp:new Date().toISOString() });
    return;
  }
});

// =====================
// COMANDI ADMIN / SUPER ADMIN
// =====================

bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});

// /admin add
bot.onText(/\/admin add (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  const newAdmin = Number(match[1]);
  if (fromId!==SUPER_ADMIN) return bot.sendMessage(msg.chat.id,"❌ Solo il Super Admin può usare questo comando.");
  ADMINS.add(newAdmin);
  saveJSON(ADMINS_FILE, Array.from(ADMINS));
  bot.sendMessage(msg.chat.id, `✅ Utente ${newAdmin} aggiunto come admin.`);
});

// /admin remove
bot.onText(/\/admin remove (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  const removeAdmin = Number(match[1]);
  if (fromId!==SUPER_ADMIN) return bot.sendMessage(msg.chat.id,"❌ Solo il Super Admin può usare questo comando.");
  if (removeAdmin===SUPER_ADMIN) return bot.sendMessage(msg.chat.id,"❌ Non puoi rimuovere il Super Admin.");
  ADMINS.delete(removeAdmin);
  saveJSON(ADMINS_FILE, Array.from(ADMINS));
  bot.sendMessage(msg.chat.id, `✅ Utente ${removeAdmin} rimosso dagli admin.`);
});