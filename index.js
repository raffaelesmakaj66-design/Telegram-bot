bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;

  // ⭐ GESTIONE RECENSIONI (PRIMA)
  if (q.data.startsWith("RATE_")) {
    const rating = parseInt(q.data.split("_")[1]);
    saveReview(rating);

    const avg = getAverage();
    const total = loadReviews().length;

    bot.sendMessage(
      chatId,
      `🙏 Grazie per la recensione!

⭐ Voto: *${rating}/5*
📊 Media attuale: *${avg}* (${total} voti)`,
      { parse_mode: "Markdown" }
    );

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `⭐ *Nuova recensione*

👤 ${q.from.first_name}
⭐ ${rating}/5
📊 Media: ${avg}`,
        { parse_mode: "Markdown" }
      );
    });

    bot.answerCallbackQuery(q.id);
    return; // 🔴 IMPORTANTISSIMO
  }

  // ===== ALTRI BOTTONI =====
  switch (q.data) {
    case "OPEN_LISTINO":
    case "OPEN_SPONSOR":
      bot.sendMessage(
        chatId,
        `📄 *Listino Ufficiale*

• Prodotto A → *1k*
• Prodotto B → *2.5k*
• Prodotto C → *5k*
• Prodotto Premium → *10k*

📌 Usa *📝 Ordina* per acquistare`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ASTA":
      bot.sendMessage(
        chatId,
        `🏷️ *Modulo Asta*

1️⃣ Oggetto/i  
2️⃣ Nickname  
3️⃣ Prezzo base  
4️⃣ Rilancio`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_ORDINI":
      bot.sendMessage(
        chatId,
        `📝 *Modulo Ordini*

1️⃣ Nickname  
2️⃣ @ Telegram  
3️⃣ Prodotti desiderati`,
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
        `📝 *Come fare il curriculum*

1️⃣ Dati personali  
2️⃣ Parlaci di te  
3️⃣ Perché sceglierti  
4️⃣ Esperienze  
5️⃣ Competenze  
6️⃣ Pregi e difetti

📍 Bancarella 8 – -505 64 22`,
        { parse_mode: "Markdown" }
      );
      break;

    case "OPEN_REVIEW":
      bot.sendMessage(
        chatId,
        `⭐ *Lascia una recensione*

Seleziona un voto da *1 a 5 stelle* ⭐
in base alla tua esperienza.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "⭐ 1", callback_data: "RATE_1" },
              { text: "⭐ 2", callback_data: "RATE_2" },
              { text: "⭐ 3", callback_data: "RATE_3" },
              { text: "⭐ 4", callback_data: "RATE_4" },
              { text: "⭐ 5", callback_data: "RATE_5" }
            ]]
          }
        }
      );
      break;
  }

  bot.answerCallbackQuery(q.id);
});