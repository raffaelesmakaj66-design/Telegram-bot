import TelegramBot from "node-telegram-bot-api";
import fs from "fs";

console.log("🤖 Bot Telegram avviato");

// ===== CONFIG =====
const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_IDS = process.env.ADMIN_ID.split(",").map(id => id.trim());

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error("❌ Variabili ambiente mancanti");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== FILE RECENSIONI =====
const REVIEWS_FILE = "./reviews.json";

if (!fs.existsSync(REVIEWS_FILE)) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify([]));
}

const loadReviews = () => JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));

const saveReview = (rating) => {
  const reviews = loadReviews();
  reviews.push(rating);
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
};

const getAverage = () => {
  const reviews = loadReviews();
  if (reviews.length === 0) return 0;
  return (reviews.reduce((a, b) => a + b, 0) / reviews.length).toFixed(1);
};

// ===== ALTRE CONFIG =====
const WELCOME_IMAGE =
  "AgACAgQAAxkBAAM1aYRXYd4FNs3LsBgpox5c0av2Ic8AAg8OaxsyrSlQ23YZ-nsoLoABAAMCAAN5AAM4BA";

const CHANNEL_URL = "https://t.me/CapyBarNeoTecno";

const assistenzaUsers = new Set();
const adminReplyMap = {};

// ===== /start =====
bot.onText(/\/start/, (msg) => {
  bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
    caption: `👋 *Benvenuto nel bot ufficiale di CapyBar!*`,
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

// ===== CALLBACK QUERY =====
bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;

  // ===== RECENSIONI =====
  if (q.data.startsWith("RATE_")) {
    const rating = parseInt(q.data.split("_")[1]);
    saveReview(rating);

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(
      chatId,
      `🙏 Grazie per la recensione!\n\n⭐ Voto: *${rating}/5*\n📊 Media attuale: *${avg}* (${total} voti)`,
      { parse_mode: "Markdown" }
    );

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `⭐ *Nuova recensione*\n\n👤 ${q.from.first_name}\n⭐ ${rating}/5\n📊 Media: ${avg}`,
        { parse_mode: "Markdown" }
      );
    });

    return bot.answerCallbackQuery(q.id);
  }

  // ===== ALTRE CALLBACK =====
  switch (q.data) {
    case "OPEN_LISTINO":
    case "OPEN_SPONSOR":
      bot.sendMessage(
        chatId,
        `📄 *Listino Ufficiale*\n\n• Prodotto A → *1k*\n• Prodotto B → *2.5k*\n• Prodotto C → *5k*\n• Prodotto Premium → *10k*\n\n📌 Usa *📝 Ordina* per acquistare`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASTA":
      bot.sendMessage(
        chatId,
        `🏷️ *Modulo Asta*\n\n1️⃣ Oggetto/i\n2️⃣ Nickname\n3️⃣ Prezzo base\n4️⃣ Rilancio`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      bot.sendMessage(
        chatId,
        `📝 *Modulo Ordini*\n\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASSISTENZA":
      assistenzaUsers.add(chatId);
      bot.sendMessage(chatId, "🆘 Scrivi il tuo messaggio per l'assistenza.");
      break;

    case "OPEN_CANDIDATURA":
      bot.sendMessage(
        chatId,
        `📝 *Come fare il curriculum*\n\n1️⃣ Dati personali\n2️⃣ Parlaci di te\n3️⃣ Perché sceglierti\n4️⃣ Esperienze\n5️⃣ Competenze\n6️⃣ Pregi e difetti\n\n📍 Bancarella 8 – -505 64 22`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_REVIEW":
      bot.sendMessage(chatId, "⭐ *Lascia una recensione*", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "⭐", callback_data: "RATE_1" },
            { text: "⭐⭐", callback_data: "RATE_2" },
            { text: "⭐⭐⭐", callback_data: "RATE_3" },
            { text: "⭐⭐⭐⭐", callback_data: "RATE_4" },
            { text: "⭐⭐⭐⭐⭐", callback_data: "RATE_5" }
          ]]
        }
      });
      break;
  }

  bot.answerCallbackQuery(q.id);
});

// ===== MESSAGGI TESTO =====
bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const user = msg.from;

  // ===== RISPOSTA ADMIN =====
  if (ADMIN_IDS.includes(String(user.id))) {
    const target = adminReplyMap[user.id];
    if (target) {
      bot.sendMessage(target, `💬 *Risposta admin:*\n${msg.text}`, { parse_mode: "Markdown" });
      delete adminReplyMap[user.id];
    }
    return;
  }

  // ===== ASSISTENZA =====
  if (assistenzaUsers.has(chatId)) {
    bot.sendMessage(chatId, "✅ Messaggio inviato correttamente!");
    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `📩 *Assistenza*\n\n👤 ${user.first_name} (@${user.username || "nessuno"})\n🆔 ${user.id}\n\n${msg.text}`,
        { parse_mode: "Markdown" }
      );
      adminReplyMap[id] = chatId;
    });
    return;
  }

  // ===== MODULI =====
  bot.sendMessage(chatId, "✅ Modulo inviato correttamente!");
  ADMIN_IDS.forEach(id => {
    bot.sendMessage(
      id,
      `📥 *Nuovo modulo*\n\n👤 ${user.first_name}\n🆔 ${user.id}\n\n${msg.text}`,
      { parse_mode: "Markdown" }
    );
  });
});