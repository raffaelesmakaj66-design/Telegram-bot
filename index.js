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

let botData = {
  admins: [SUPER_ADMIN],
  reviews: [],
  users: []
};

if (fs.existsSync(DATA_FILE)) {
  botData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} else {
  fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));
}

const saveBotData = () =>
  fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));

// =====================
// COSTANTI
// =====================
const WELCOME_IMAGE =
  "AgACAgQAAxkBAAICCWmHXxtN2F4GIr9-kOdK-ykXConxAALNDGsbx_A4UN36kLWZSKBFAQADAgADeQADOgQ";
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
// UTILS
// =====================
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
  const userId = msg.from.id;

  if (!botData.users.includes(userId)) {
    botData.users.push(userId);
    saveBotData();
  }

  bot.sendPhoto(msg.chat.id, WELCOME_IMAGE, {
    caption:
      "👋 *Benvenuto nel bot ufficiale di CapyBar!*\n\nPremi uno dei seguenti bottoni:",
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

  if (q.data.startsWith("RATE_")) {
    const rating = Number(q.data.split("_")[1]);
    const now = Date.now();

    if (now - (reviewCooldown.get(userId) || 0) < REVIEW_COOLDOWN_MS) {
      bot.answerCallbackQuery(q.id, {
        text: "⏳ Attendi prima di votare di nuovo",
        show_alert: true
      });
      return;
    }

    reviewCooldown.set(userId, now);
    reviewState.set(userId, rating);

    bot.sendMessage(
      chatId,
      `Hai votato ⭐ ${rating}/5\nVuoi lasciare un commento?`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "⏭️ Skip", callback_data: "SKIP" }]]
        }
      }
    );
    return;
  }

  if (q.data === "SKIP") {
    const rating = reviewState.get(userId);
    reviewState.delete(userId);

    botData.reviews.push({ userId, rating, comment: null });
    saveBotData();

    bot.sendMessage(chatId, "✅ Recensione inviata!");
    return;
  }

  const texts = {
    OPEN_REVIEW:
      "⭐ *Lascia una recensione*\n\nSeleziona un voto da 1 a 5 stelle ⭐",
    OPEN_LISTINO:
      "📄 *Listino CapyBar*\n\n👉 https://telegra.ph/Listino-CapyBar-02-07",
    OPEN_ASTA:
      "🏷️ *Modulo Asta*\n\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ Oggetto/i\n3️⃣ Prezzo base\n4️⃣ Rilancio",
    OPEN_ORDINI:
      "📝 *Modulo Ordinazioni*\n\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati",
    OPEN_ASSISTENZA:
      "🆘 *Assistenza*\n\nScrivi qui la tua richiesta.",
    OPEN_SPONSOR:
      "📢 *Richiesta Sponsor*\n\nScrivi la tua richiesta.",
    OPEN_CANDIDATURA:
  "📝 *Modulo Candidatura Dipendente*\n\n" +
  "*Compila il tuo curriculum seguendo questi punti:*\n\n" +
  "1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome e ore disponibili\n" +
  "2️⃣ *Parlaci di te*: chi sei, passioni, motivazioni\n" +
  "3️⃣ *Perché dovremmo sceglierti?*\n" +
  "4️⃣ *Esperienze lavorative*: se presenti e se attualmente lavori in un’azienda\n" +
  "5️⃣ *Competenze pratiche*: uso della cassa, capacità di cucinare\n" +
  "6️⃣ *Pregi e difetti*\n\n" +
  "📍 *Consegna del curriculum:*\n" +
  "Bancarella 8, coordinate -505 64 22, davanti all’ospedale"
  };

  if (texts[q.data]) {
    if (!["OPEN_LISTINO", "OPEN_REVIEW"].includes(q.data)) {
      userState.set(userId, q.data);
    }

    if (q.data === "OPEN_REVIEW") {
      bot.sendMessage(chatId, texts[q.data], {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[1, 2, 3, 4, 5].map((n) => ({
            text: `⭐ ${n}`,
            callback_data: `RATE_${n}`
          }))]
        }
      });
    } else {
      bot.sendMessage(chatId, texts[q.data], { parse_mode: "Markdown" });
    }
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

  // COMMENTO RECENSIONE
  if (reviewState.has(userId)) {
    const rating = reviewState.get(userId);
    reviewState.delete(userId);

    botData.reviews.push({ userId, rating, comment: msg.text });
    saveBotData();

    bot.sendMessage(chatId, "✅ Recensione inviata correttamente!");
    return;
  }

  // RISPOSTA ADMIN
  if (ADMINS.has(userId) && adminReplyMap[userId]) {
    const target = adminReplyMap[userId];

    bot.sendMessage(
      target,
      `💬 *Risposta admin:*\n\n${escape(msg.text)}`,
      { parse_mode: "Markdown" }
    );

    ADMINS.forEach((a) => {
      if (a !== userId)
        bot.sendMessage(
          a,
          `💬 *Admin ${msg.from.first_name} ha risposto:*\n\n${escape(
            msg.text
          )}`,
          { parse_mode: "Markdown" }
        );
    });

    delete adminReplyMap[userId];
    bot.sendMessage(userId, "✅ Messaggio inviato con successo!");
    return;
  }

  // MODULI / ASSISTENZA
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    bot.sendMessage(chatId, "✅ Messaggio inviato con successo!");

    ADMINS.forEach((a) => {
      bot.sendMessage(
        a,
        `📩 *${type}*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escape(
          msg.text
        )}`,
        { parse_mode: "Markdown" }
      );
      adminReplyMap[a] = userId;
    });
  }
});

// =====================
// /admin
// =====================
bot.onText(/\/admin add (\d+)/, (msg, m) => {
  if (msg.from.id !== SUPER_ADMIN)
    return bot.sendMessage(msg.chat.id, "❌ Non autorizzato");

  const id = Number(m[1]);
  if (ADMINS.has(id))
    return bot.sendMessage(msg.chat.id, "⚠️ Già admin");

  ADMINS.add(id);
  botData.admins.push(id);
  saveBotData();

  bot.sendMessage(msg.chat.id, `✅ Admin aggiunto: ${id}`);
});

bot.onText(/\/admin remove (\d+)/, (msg, m) => {
  if (msg.from.id !== SUPER_ADMIN)
    return bot.sendMessage(msg.chat.id, "❌ Non autorizzato");

  const id = Number(m[1]);
  ADMINS.delete(id);
  botData.admins = botData.admins.filter((a) => a !== id);
  saveBotData();

  bot.sendMessage(msg.chat.id, `✅ Admin rimosso: ${id}`);
});

// =====================
// /stats
// =====================
bot.onText(/\/stats/, (msg) => {
  if (!ADMINS.has(msg.from.id)) return;

  bot.sendMessage(
    msg.chat.id,
    `📊 *Statistiche Bot*\n\n👤 Utenti totali: ${botData.users.length}\n⭐ Recensioni: ${botData.reviews.length}\n🛠 Admin: ${botData.admins.length}`,
    { parse_mode: "Markdown" }
  );
});

// =====================
// /id
// =====================
bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Il tuo ID: ${msg.from.id}`);
});