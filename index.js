// =====================
// IMPORT
// =====================
const TelegramBot = require("node-telegram-bot-api");

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ TELEGRAM_TOKEN o SUPER_ADMIN mancante!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot avviato correttamente");

// =====================
// STATI IN MEMORIA
// =====================
const reviewState = new Map();       // userId -> { rating, waitingComment }
const activeChats = new Map();       // userId <-> adminId
const userState = new Map();         // userId -> tipo modulo/assistenza/candidatura
const sponsorState = new Map();      // userId -> { step, duration }
const ADMINS = new Set([SUPER_ADMIN]);
const USERS = new Set();
const REVIEW_COOLDOWN_MS = 60 * 1000;
const reviewCooldown = new Map();

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

// =====================
// FUNZIONI UTILI
// =====================
const escape = (t) => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

const getAverage = () => {
  let sum = 0, count = 0;
  reviewState.forEach(r => { if (r.rating) { sum += r.rating; count++; } });
  return count ? (sum/count).toFixed(1) : "0.0";
};

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  userState.delete(userId);
  reviewState.delete(userId);
  sponsorState.delete(userId);

  if (activeChats.has(userId)) {
    const adminId = activeChats.get(userId);
    activeChats.delete(userId);
    activeChats.delete(adminId);
  }

  USERS.add(userId);

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei seguenti bottoni:`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Canale", url: CHANNEL_URL }],
        [{ text: "⚖️ Aste", callback_data: "OPEN_ASTA" }, { text: "📄 Listino", callback_data: "OPEN_LISTINO" }],
        [{ text: "📝 Ordina", callback_data: "OPEN_ORDINI" }, { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }],
        [{ text: "⭐ Lascia una Recensione", callback_data: "OPEN_REVIEW" }],
        [{ text: "📢 Richiedi uno Sponsor", callback_data: "OPEN_SPONSOR" }],
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

  // ⭐ RECENSIONI
  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();
    if (now - (reviewCooldown.get(userId) || 0) < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, { text: "⏳ Attendi un po’", show_alert: true });
      return;
    }
    reviewCooldown.set(userId, now);
    reviewState.set(userId, { rating, waitingComment: true });
    bot.answerCallbackQuery(q.id, { text: "⭐ Voto registrato!" });
    bot.sendMessage(chatId, `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`, {
      reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] }
    });
    return;
  }

  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    reviewState.delete(userId);
    bot.answerCallbackQuery(q.id, { text: "✅ Recensione inviata!" });
    bot.sendMessage(chatId, `✅ Recensione inviata senza commento ⭐ ${rating}/5`);
    return;
  }

  // 📢 SPONSOR
  if (q.data === "SPONSOR_CONTINUA") {
    const state = sponsorState.get(userId);
    if (!state || state.step !== "SHOW_INFO") return;
    state.step = "SELECT_DURATION";
    sponsorState.set(userId, state);
    bot.sendMessage(chatId, "Seleziona il tempo di durata della sponsor:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "12h", callback_data: "SPONSOR_12h" }],
          [{ text: "24h", callback_data: "SPONSOR_24h" }],
          [{ text: "36h", callback_data: "SPONSOR_36h" }],
          [{ text: "48h", callback_data: "SPONSOR_48h" }],
          [{ text: "Permanente", callback_data: "SPONSOR_PERMANENTE" }]
        ]
      }
    });
    bot.answerCallbackQuery(q.id);
    return;
  }

  if (q.data.startsWith("SPONSOR_")) {
    const state = sponsorState.get(userId);
    if (!state || state.step !== "SELECT_DURATION") return;
    const durationMap = {
      "SPONSOR_12h": "12h",
      "SPONSOR_24h": "24h",
      "SPONSOR_36h": "36h",
      "SPONSOR_48h": "48h",
      "SPONSOR_PERMANENTE": "Permanente"
    };
    state.step = "WRITE_TEXT";
    state.duration = durationMap[q.data];
    sponsorState.set(userId, state);
    bot.sendMessage(chatId, "Ora invia il testo del messaggio sponsor:");
    bot.answerCallbackQuery(q.id);
    return;
  }

  // MENU PRINCIPALE
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ Seleziona un voto da 1 a 5:", {
        reply_markup: { inline_keyboard: [[1,2,3,4,5].map(n => ({ text:`⭐ ${n}`, callback_data:`RATE_${n}` }))] }
      });
      break;
    case "OPEN_LISTINO":
      bot.sendMessage(chatId, "📄 Consulta il listino completo qui: https://telegra.ph/Listino-CapyBar-02-07");
      break;
    case "OPEN_ASTA":
      userState.set(userId, "ASTA");
      bot.sendMessage(chatId, "🏷️ Modulo Asta: scrivi nickname, oggetto, prezzo base e rilancio.");
      break;
    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId, "📝 Modulo Ordini: scrivi nickname, @ Telegram e prodotti desiderati.");
      break;
    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      bot.sendMessage(chatId, "🆘 Scrivi qui la tua richiesta, un admin ti risponderà.");
      break;
    case "OPEN_SPONSOR":
      sponsorState.set(userId, { step: "SHOW_INFO" });
      bot.sendMessage(chatId,
        "*📢 Prezzi Sponsor:*\n12h » 500\n24h » 1000\n36h » 1600\n48h » 2100\nPermanente » 3200",
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "✅ Continua", callback_data: "SPONSOR_CONTINUA" }]] } }
      );
      break;
    case "OPEN_CANDIDATURA":
      userState.set(userId, "CANDIDATURA");
      bot.sendMessage(chatId,
`📝 Modulo Candidatura Dipendente\n\n1️⃣ Dati personali\n2️⃣ Parlaci di te\n3️⃣ Perché dovremmo sceglierti?\n4️⃣ Esperienze lavorative\n5️⃣ Competenze pratiche\n6️⃣ Pregi e difetti`);
      break;
  }
  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGGI UTENTE
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  USERS.add(userId);

  // CHAT UTENTE -> ADMIN
  if (activeChats.has(userId) && !ADMINS.has(userId)) {
    const adminId = activeChats.get(userId);
    bot.sendMessage(adminId, `💬 Messaggio da ${msg.from.first_name}:\n\n${escape(msg.text)}`);
    bot.sendMessage(chatId, "✅ Messaggio inviato!");
    return;
  }

  // CHAT ADMIN -> UTENTE
  if (ADMINS.has(userId) && activeChats.has(userId)) {
    const targetUser = activeChats.get(userId);
    bot.sendMessage(targetUser, `💬 Risposta da ${msg.from.first_name}:\n\n${escape(msg.text)}`);
    bot.sendMessage(chatId, "✅ Messaggio inviato!");
    return;
  }

  // COMMENTO RECENSIONE
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    bot.sendMessage(chatId, `✅ Recensione inviata!\n⭐ Voto: ${rating}/5\n💬 Commento: ${escape(msg.text)}`);
    return;
  }

  // MODULI / SPONSOR / ASSISTENZA / CANDIDATURA
  if (userState.has(userId) || sponsorState.has(userId)) {
    let type = userState.get(userId) || "SPONSOR";
    userState.delete(userId);
    sponsorState.delete(userId);

    const adminArray = Array.from(ADMINS);
    if (!adminArray.length) { bot.sendMessage(chatId, "❌ Nessun admin disponibile"); return; }
    const assignedAdmin = adminArray[Math.floor(Math.random() * adminArray.length)];

    activeChats.set(userId, assignedAdmin);
    activeChats.set(assignedAdmin, userId);

    bot.sendMessage(assignedAdmin, `📩 ${type} da ${msg.from.first_name}:\n\n${escape(msg.text)}`);
    bot.sendMessage(chatId, "✅ Messaggio inviato! Ora puoi continuare a scrivere qui e ricevere risposta dall'admin.");
    return;
  }
});

// =====================
// COMANDI ADMIN DINAMICI
// =====================
bot.onText(/\/admin add (\d+)/, (msg, match) => {
  if (msg.from.id !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può aggiungere admin.");
  const newAdmin = Number(match[1]);
  if (ADMINS.has(newAdmin)) return bot.sendMessage(msg.chat.id, "⚠️ Admin già presente.");
  ADMINS.add(newAdmin);
  bot.sendMessage(msg.chat.id, `✅ Admin aggiunto: ${newAdmin}`);
});

bot.onText(/\/admin remove (\d+)/, (msg, match) => {
  if (msg.from.id !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può rimuovere admin.");
  const remAdmin = Number(match[1]);
  if (!ADMINS.has(remAdmin)) return bot.sendMessage(msg.chat.id, "⚠️ Admin non trovato.");
  ADMINS.delete(remAdmin);
  bot.sendMessage(msg.chat.id, `✅ Admin rimosso: ${remAdmin}`);
});

// =====================
// COMANDI BASE
// =====================
bot.onText(/\/id/, (msg) => bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`));

bot.onText(/\/stats/, (msg) => {
  bot.sendMessage(msg.chat.id, `📊 Statistiche Bot:\n👥 Utenti totali: ${USERS.size}\n⭐ Recensioni totali: ${reviewState.size}\n📊 Voto medio: ${getAverage()}`);
});