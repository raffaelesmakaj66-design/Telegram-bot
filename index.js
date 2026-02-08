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
  botData.users ||= [];
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
const reviewState = new Map();
const reviewCooldown = new Map();
const userState = new Map();
const adminReplyMap = {};
const ADMINS = new Set(botData.admins);

// =====================
// FUNZIONI UTILI
// =====================
const saveBotData = () =>
  fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));

const escape = (t) =>
  t.replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");

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
  const userId = msg.from.id;

  // ✅ registra utente reale una sola volta
  if (!botData.users.includes(userId)) {
    botData.users.push(userId);
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

  if (q.data === "OPEN_LISTINO") {
    bot.sendMessage(
      chatId,
      "📄 *Listino CapyBar*\n\nConsulta il listino completo qui:\nhttps://telegra.ph/Listino-CapyBar-02-07",
      { parse_mode: "Markdown" }
    );
  }

  if (q.data === "OPEN_ASTA") {
    userState.set(userId, "ASTA");
    bot.sendMessage(
      chatId,
      "🏷️ *Modulo Asta*\n\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio",
      { parse_mode: "Markdown" }
    );
  }

  if (q.data === "OPEN_ORDINI") {
    userState.set(userId, "ORDINE");
    bot.sendMessage(
      chatId,
      "📝 *Modulo Ordinazioni*\n\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati",
      { parse_mode: "Markdown" }
    );
  }

  if (q.data === "OPEN_ASSISTENZA") {
    userState.set(userId, "ASSISTENZA");
    bot.sendMessage(
      chatId,
      "🆘 *Assistenza*\n\nScrivi qui la tua richiesta.",
      { parse_mode: "Markdown" }
    );
  }

  if (q.data === "OPEN_CANDIDATURA") {
    userState.set(userId, "CANDIDATURA");
    bot.sendMessage(
      chatId,
      `📝 *Modulo Candidatura Dipendente*

Compila il tuo curriculum seguendo questi punti:

1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome e ore disponibili  
2️⃣ *Parlaci di te*: chi sei, passioni, motivazioni  
3️⃣ *Perché dovremmo sceglierti?*  
4️⃣ *Esperienze lavorative*: se presenti e se lavori attualmente in un’azienda  
5️⃣ *Competenze pratiche*: uso della cassa, capacità di cucinare  
6️⃣ *Pregi e difetti*

📍 *Consegna del curriculum*:  
Bancarella 8, coordinate -505 64 22, davanti all’ospedale`,
      { parse_mode: "Markdown" }
    );
  }

  bot.answerCallbackQuery(q.id);
});

// =====================
// MESSAGE
// =====================
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;

  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    bot.sendMessage(
      chatId,
      type === "ASSISTENZA"
        ? "✅ Messaggio inviato con successo!"
        : "✅ Modulo inviato con successo!"
    );

    ADMINS.forEach(id => {
      bot.sendMessage(
        id,
        `📩 *${type}*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escape(msg.text)}`,
        { parse_mode: "Markdown" }
      );
      adminReplyMap[id] = userId;
    });
  }
});

// =====================
// COMANDO /stats
// =====================
bot.onText(/\/stats/, (msg) => {
  if (!ADMINS.has(msg.from.id)) {
    bot.sendMessage(msg.chat.id, "❌ Non autorizzato");
    return;
  }

  bot.sendMessage(
    msg.chat.id,
    `📊 *Statistiche Bot*\n\n👥 Utenti unici reali: *${botData.users.length}*`,
    { parse_mode: "Markdown" }
  );
});

// =====================
// COMANDO /id
// =====================
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`);
});