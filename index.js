import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

if (!TOKEN || !SUPER_ADMIN) {
  console.error("❌ TELEGRAM_TOKEN o SUPER_ADMIN mancante");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// =====================
// FILE DATI
// =====================
const DATA_FILE = path.join(process.cwd(), "bot_data.json");

// Inizializzazione dati persistenti
let botData = { admins: [SUPER_ADMIN], reviews: [], users: [] };
if (fs.existsSync(DATA_FILE)) {
  botData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} else {
  fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));
}

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE = "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";
const REVIEW_COOLDOWN_MS = 60 * 1000;

// =====================
// STATI
// =====================
const reviewState = new Map(); // userId -> { rating, chatId, waitingComment }
const reviewCooldown = new Map();
const userState = new Map();   // userId -> tipo modulo/assistenza
const adminReplyMap = {};      // adminId -> userId per risposta
const ADMINS = new Set(botData.admins);

// =====================
// FUNZIONI UTILI
// =====================
const saveBotData = () => fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));
const escape = (t) => t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
const getAverage = () => {
  if (botData.reviews.length === 0) return "0.0";
  const sum = botData.reviews.reduce((a, r) => a + r.rating, 0);
  return (sum / botData.reviews.length).toFixed(1);
};

// =====================
// /start
// =====================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // salva utente se nuovo
  if (!botData.users.includes(chatId)) {
    botData.users.push(chatId);
    saveBotData();
  }

  bot.sendPhoto(chatId, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei seguenti bottoni:`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📣 Canale", url: CHANNEL_URL }],
        [
          { text: "⚖️ Aste", callback_data: "OPEN_ASTA" },
          { text: "📄 Listino", callback_data: "OPEN_LISTINO" }
        ],
        [
          { text: "📝 Ordina", callback_data: "OPEN_ORDINI" },
          { text: "🆘 Assistenza", callback_data: "OPEN_ASSISTENZA" }
        ],
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
    bot.sendMessage(chatId, `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`, {
      reply_markup: { inline_keyboard: [[{ text: "⏭️ Skip", callback_data: `SKIP_${rating}` }]] }
    });
    return;
  }

  if (q.data.startsWith("SKIP_")) {
    const rating = Number(q.data.split("_")[1]);
    botData.reviews.push({ rating, comment: null, userId });
    saveBotData();
    const avg = getAverage();
    const total = botData.reviews.length;
    bot.sendMessage(chatId, `✅ Recensione inviata!\n⭐ ${rating}/5\n📊 Media attuale: ${avg} (${total} voti)`);
    ADMINS.forEach(id => {
      bot.sendMessage(id, `⭐ Nuova recensione\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n💬 Nessun commento`);
    });
    reviewState.delete(userId);
    return;
  }

  // MENU
  switch (q.data) {
    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ *Lascia una recensione*\nSeleziona un voto da 1 a 5:", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[1,2,3,4,5].map(n => ({ text:`⭐ ${n}`, callback_data:`RATE_${n}` }))] }
      });
      break;

    case "OPEN_LISTINO":
      bot.sendMessage(chatId, "📄 *Listino CapyBar*\nConsulta il listino completo qui: https://telegra.ph/Listino-CapyBar-02-07", { parse_mode: "Markdown" });
      break;

    case "OPEN_ASTA":
      userState.set(userId, "ASTA");
      bot.sendMessage(chatId, "🏷️ *Modulo Asta*\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio", { parse_mode: "Markdown" });
      break;

    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId, "📝 *Modulo Ordinazioni*\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati", { parse_mode: "Markdown" });
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      bot.sendMessage(chatId, "🆘 *Assistenza*\nSe hai bisogno di aiuto o supporto contatta un admin o scrivi qui la tua richiesta.", { parse_mode: "Markdown" });
      break;

    case "OPEN_SPONSOR":
      userState.set(userId, "SPONSOR");
      bot.sendMessage(chatId, "📢 *Richiesta Sponsor*\nScrivi in un unico messaggio: tipo, durata, dettagli aggiuntivi", { parse_mode: "Markdown" });
      break;

    case "OPEN_CANDIDATURA":
      userState.set(userId, "CANDIDATURA");
      bot.sendMessage(chatId,
`📝 *Modulo Candidatura Dipendente*\n\nCompila il tuo curriculum seguendo questi punti:\n\n` +
`1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome e ore disponibili\n` +
`2️⃣ *Parlaci di te*: chi sei, passioni, motivazioni\n` +
`3️⃣ *Perché dovremmo sceglierti?*\n` +
`4️⃣ *Esperienze lavorative*: se presenti e se attualmente lavori in un’azienda\n` +
`5️⃣ *Competenze pratiche*: uso della cassa, capacità di cucinare\n` +
`6️⃣ *Pregi e difetti*\n\n` +
`📍 *Consegna del curriculum*: Bancarella 8, coordinate -505 64 22, davanti all’ospedale`,
{ parse_mode: "Markdown" });
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGE
// =====================
bot.on("message", (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // COMMENTO RECENSIONE
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    botData.reviews.push({ rating, comment: msg.text, userId });
    saveBotData();
    const avg = getAverage();
    const total = botData.reviews.length;

    bot.sendMessage(chatId, `✅ Recensione inviata correttamente!\n⭐ Voto: ${rating}/5\n💬 Commento: ${escape(msg.text)}\n📊 Media attuale: ${avg} (${total} voti)`);
    ADMINS.forEach(id => bot.sendMessage(id, `⭐ Recensione\n👤 ${msg.from.first_name}\n⭐ ${rating}/5\n💬 ${escape(msg.text)}`, { parse_mode:"Markdown" }));
    return;
  }

  // MODULI / ASSISTENZA / CANDIDATURA / SPONSOR
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    bot.sendMessage(chatId, "✅ Messaggio inviato con successo!");
    ADMINS.forEach(id => {
      bot.sendMessage(id, `📩 *${type}*\n👤 ${msg.from.first_name} (@${msg.from.username || "nessuno"})\n🆔 ${userId}\n\n${escape(msg.text)}`, { parse_mode:"Markdown" });
      adminReplyMap[id] = userId; // collega admin -> utente
    });

    // salva utente in bot_data.json per stats
    if (!botData.users.includes(userId)) {
      botData.users.push(userId);
      saveBotData();
    }

    return;
  }

  // RISPOSTE ADMIN
  if (ADMINS.has(userId) && adminReplyMap[userId]) {
    const targetUser = adminReplyMap[userId];
    bot.sendMessage(targetUser, `💬 *Risposta da ${msg.from.first_name}:*\n\n${escape(msg.text)}`, { parse_mode:"Markdown" });
    bot.sendMessage(userId, "✅ Messaggio inviato con successo!");
    // notifico altri admin
    ADMINS.forEach(aid => {
      if (aid !== userId) bot.sendMessage(aid, `💬 *${msg.from.first_name}* ha risposto a ${targetUser}\n\n${escape(msg.text)}`, { parse_mode:"Markdown" });
    });
    delete adminReplyMap[userId];
    return;
  }
});

// =====================
// COMANDI ADMIN
// =====================
bot.onText(/\/admin add (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  if (fromId !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può usare questo comando.");
  const newAdmin = Number(match[1]);
  if (ADMINS.has(newAdmin)) return bot.sendMessage(msg.chat.id, "⚠️ Admin già presente.");
  ADMINS.add(newAdmin);
  botData.admins.push(newAdmin);
  saveBotData();
  bot.sendMessage(msg.chat.id, `✅ Admin aggiunto: ${newAdmin}`);
});

bot.onText(/\/admin remove (\d+)/, (msg, match) => {
  const fromId = msg.from.id;
  if (fromId !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può usare questo comando.");
  const remAdmin = Number(match[1]);
  if (!ADMINS.has(remAdmin)) return bot.sendMessage(msg.chat.id, "⚠️ Admin non trovato.");
  ADMINS.delete(remAdmin);
  botData.admins = botData.admins.filter(a => a !== remAdmin);
  saveBotData();
  bot.sendMessage(msg.chat.id, `✅ Admin rimosso: ${remAdmin}`);
});

// =====================
// COMANDO /id
// =====================
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});

// =====================
// COMANDO /stats
// =====================
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const totalUsers = botData.users.length;
  const totalReviews = botData.reviews.length;
  const avgRating = getAverage();

  bot.sendMessage(chatId,
    `📊 *Statistiche Bot*\n\n👥 Utenti totali: ${totalUsers}\n⭐ Recensioni totali: ${totalReviews}\n📊 Voto medio: ${avgRating}`,
    { parse_mode:"Markdown" }
  );
});