// =====================
// IMPORT
// =====================
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const DB_FILE = "./database.json";

// Carica database
let db = { users: [], admins: [] };

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE));
}

// Funzione per salvare
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// =====================
// CONFIG
// =====================
const TOKEN = process.env.TELEGRAM_TOKEN;
const SUPER_ADMIN = Number(process.env.SUPER_ADMIN);

const ADMINS = new Set([SUPER_ADMIN, ...db.admins]);

if (!TOKEN || !process.env.SUPER_ADMIN) {
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
const USERS = new Set(db.users);

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

  // RESET stato utente e chat
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
    bot.sendMessage(chatId, "✅ Recensione inviata senza commento.");
    return;
  }

  // =======================
  // SPONSOR
  // =======================
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

  // =======================
  // MENU PRINCIPALE
  // =======================
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
      bot.sendMessage(chatId,
`💎 *Asta | CapyBar*

🎒 Oggetto ➪ 

🪶 Descrizione ➪ 

💰 Base d’asta ➪ 

📈 Rilancio minimo ➪ 

💎 Prezzo “Compra Ora” ➪ 

⏱️ Fine asta ➪ 1h dopo l'ultima offerta

📜 Regole ➪ Le offerte fake o il mancato ritiro saranno sanzionati.

💡 Per offrire ➪ usa i commenti qui sotto!

🌆 *Allega una foto dell'asta se possibile*`,
      { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      userState.set(userId, "ORDINE");
      bot.sendMessage(chatId, "📝 *Modulo Ordinazioni*\nScrivi in un unico messaggio:\n1️⃣ Nickname\n2️⃣ @ Telegram\n3️⃣ Prodotti desiderati", { parse_mode: "Markdown" });
      break;

    case "OPEN_ASSISTENZA":
      userState.set(userId, "ASSISTENZA");
      bot.sendMessage(chatId, "🆘 *Assistenza*\nScrivi qui la tua richiesta o contatta un admin.", { parse_mode: "Markdown" });
      break;

    case "OPEN_SPONSOR":
      sponsorState.set(userId, { step: "SHOW_INFO" });
      bot.sendMessage(chatId,
        "*📢 Prezzi Sponsor:*\n\n12h » 500€\n24h » 1000€\n36h » 1600€\n48h » 2100€\nPermanente » 3200€",
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "✅ Continua", callback_data: "SPONSOR_CONTINUA" }]] } }
      );
      break;

    case "OPEN_CANDIDATURA":
      userState.set(userId, "CANDIDATURA");
      bot.sendMessage(chatId,
`📝 *Come fare il curriculum*\n\nCompila il tuo curriculum su un libro seguendo questi punti:\n\n` +
`1️⃣ *Dati personali*: @ Telegram, Discord, telefono, nome, ore settimanali e totali\n` +
`2️⃣ *Parlaci di te*: chi sei, passioni, motivazioni\n` +
`3️⃣ *Perché dovremmo sceglierti?*\n` +
`4️⃣ *Esperienze lavorative*: se presenti e se attualmente lavori in un’azienda\n` +
`5️⃣ *Competenze pratiche*: uso della cassa, capacità di cucinare\n` +
`6️⃣ *Pregi e difetti*\n\n` +
`📍 *Consegna*: Bancarella 8, coordinate -505 64 22, davanti all’ospedale`,
        { parse_mode: "Markdown" });
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

  if (!USERS.has(userId)) {
  USERS.add(userId);
  db.users.push(userId);
  saveDB();
}

  // =========================
// GESTIONE CHAT ATTIVA (utente ↔ tutti gli admin)
// =========================
if (ADMINS.has(userId)) {
  // Admin o super admin che scrive
  const targetUserId = activeChats.get(userId);
  if (!targetUserId) {
    bot.sendMessage(chatId, "❌ Nessuna chat attiva assegnata.");
    return;
  }

  // 1️⃣ Invia la risposta all'utente
  bot.sendMessage(targetUserId,
    `💬 *Risposta da ${msg.from.first_name}:*\n\n${escape(msg.text)}`,
    { parse_mode: "Markdown" }
  );

  // 2️⃣ Invia la risposta a tutti gli altri admin (compreso super admin)
  ADMINS.forEach(adminId => {
    if (adminId !== userId) { // non rimandare al mittente
      bot.sendMessage(adminId,
        `💬 *${msg.from.first_name} ha risposto a ${targetUserId}:*\n\n${escape(msg.text)}`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Mantieni la chat attiva tra admin e utente
  activeChats.set(userId, targetUserId);
  activeChats.set(targetUserId, userId);

  // Conferma invio all'admin mittente
  bot.sendMessage(chatId, "✅ Messaggio inviato all'utente e agli admin!").then(sentMsg => {
    setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 3000);
  });

  return;
}

if (!ADMINS.has(userId)) {
  // Utente che scrive
  const adminArray = Array.from(ADMINS);
  adminArray.forEach(adminId => {
    bot.sendMessage(adminId,
      `💬 *Messaggio da ${msg.from.first_name}:*\n👤 ID: ${userId}\n\n${escape(msg.text)}`,
      { parse_mode: "Markdown" }
    );

    // Aggiorna la chat attiva con il primo admin (o super admin)
    activeChats.set(userId, adminId);
    activeChats.set(adminId, userId);
  });

  bot.sendMessage(chatId, "✅ Messaggio inviato a tutti gli admin!").then(sentMsg => {
    setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 3000);
  });

  return;
}

  // =========================
  // COMMENTO RECENSIONE
  // =========================
  if (reviewState.has(userId)) {
    const { rating } = reviewState.get(userId);
    reviewState.delete(userId);
    bot.sendMessage(chatId,
      `✅ Recensione inviata!\n⭐ Voto: ${rating}/5\n💬 Commento: ${escape(msg.text)}`
    );
    return;
  }

  // =========================
  // MODULI / ASSISTENZA / CANDIDATURA
  // =========================
  if (userState.has(userId)) {
    const type = userState.get(userId);
    userState.delete(userId);

    const adminArray = Array.from(ADMINS);
if (adminArray.length === 0) {
  bot.sendMessage(chatId, "❌ Nessun admin disponibile");
  return;
}

// Invia a TUTTI gli admin
adminArray.forEach(adminId => {
  bot.sendMessage(adminId,
    `📩 *${type}*\n👤 ${msg.from.first_name}\n🆔 ${userId}\n\n${escape(msg.text)}`,
    { parse_mode: "Markdown" }
  );
});

    bot.sendMessage(chatId, "✅ Messaggio inviato! Ora puoi continuare a scrivere qui.").then((sentMsg) => {
      setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 3000);
    });

    return;
  }

// =========================
// SPONSOR
// =========================
if (sponsorState.has(userId)) {
  const data = sponsorState.get(userId);

  if (data.step === "WRITE_TEXT") {
    sponsorState.delete(userId);

    const adminArray = Array.from(ADMINS);
    if (adminArray.length === 0) {
      bot.sendMessage(chatId, "❌ Nessun admin disponibile");
      return;
    }

    // Invia a TUTTI gli admin
    adminArray.forEach(adminId => {
      bot.sendMessage(adminId,
        `📢 *Sponsor*\n👤 ${msg.from.first_name}\n🆔 ${userId}\nDurata: ${data.duration}\n\n${escape(msg.text)}`,
        { parse_mode: "Markdown" }
      );
    });

    bot.sendMessage(chatId, "✅ Sponsor inviato! Ora puoi continuare a scrivere qui.").then((sentMsg) => {
      setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 3000);
    });

    return;
  }
}
// CHIUSURA EVENTO MESSAGE
});

// =====================
// COMANDI ADMIN
// =====================
bot.onText(/\/admin add (\d+)/, (msg, match) => {
  if (msg.from.id !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può aggiungere admin.");
  const newAdmin = Number(match[1]);
  if (ADMINS.has(newAdmin)) return bot.sendMessage(msg.chat.id, "⚠️ Admin già presente.");
  ADMINS.add(newAdmin);
  
  if (!db.admins.includes(newAdmin)) {
  db.admins.push(newAdmin);
  saveDB();
}
  bot.sendMessage(msg.chat.id, `✅ Admin aggiunto: ${newAdmin}`);
});

bot.onText(/\/admin remove (\d+)/, (msg, match) => {
  if (msg.from.id !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può rimuovere admin.");
  const remAdmin = Number(match[1]);
  if (!ADMINS.has(remAdmin)) return bot.sendMessage(msg.chat.id, "⚠️ Admin non trovato.");
  ADMINS.delete(remAdmin);
  db.admins = db.admins.filter(id => id !== remAdmin);
saveDB();
  bot.sendMessage(msg.chat.id, `✅ Admin rimosso: ${remAdmin}`);
});

// =====================
// BROADCAST (solo admin)
// =====================
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (!ADMINS.has(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "❌ Solo gli admin possono usare questo comando.");
  }

  const text = match[1];
  let success = 0;
  let failed = 0;

  for (const userId of USERS) {
    try {
      await bot.sendMessage(userId, `📢 *Comunicazione ufficiale:*\n\n${escape(text)}`, {
        parse_mode: "Markdown"
      });
      success++;
    } catch (err) {
      failed++;
    }
  }

  bot.sendMessage(msg.chat.id,
    `✅ Broadcast completato!\n\n📨 Inviati: ${success}\n❌ Falliti: ${failed}`
  );
});

// =====================
// COMANDI BASE
// =====================
bot.onText(/\/id/, (msg) => bot.sendMessage(msg.chat.id, `🆔 Il tuo ID Telegram è: ${msg.from.id}`));

bot.onText(/\/stats/, (msg) => {
  bot.sendMessage(msg.chat.id, `📊 Statistiche Bot:\n👥 Utenti totali: ${USERS.size}\n⭐ Recensioni totali: ${reviewState.size}\n📊 Voto medio: ${getAverage()}`);
});

// =====================
// COMANDO LISTA ADMIN LEGIBILE
// =====================
bot.onText(/\/admin list/, async (msg) => {
  if (msg.from.id !== SUPER_ADMIN) return bot.sendMessage(msg.chat.id, "❌ Solo il super admin può vedere la lista degli admin.");

  if (ADMINS.size === 0) return bot.sendMessage(msg.chat.id, "⚠️ Nessun admin presente.");

  let adminInfoList = [];

  for (const id of ADMINS) {
    try {
      const chat = await bot.getChat(id);
      const name = chat.first_name || "N/A";
      const username = chat.username ? `@${chat.username}` : "N/A";
      adminInfoList.push(`${name} (${username}) - ID: ${id}`);
    } catch (err) {
      adminInfoList.push(`ID: ${id}`);
    }
  }

  bot.sendMessage(msg.chat.id, `👑 Lista Admin:\n\n${adminInfoList.join("\n")}`);
});