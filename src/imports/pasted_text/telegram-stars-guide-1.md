Оплата Telegram Stars внутри Mini App — полный гайд
Архитектура
Frontend (Mini App)  →  Твой Backend  →  Telegram Bot API
     ↓                      ↓                    ↓
openInvoice()         createInvoiceLink     answerPreCheckoutQuery
     ↓                      ↓                    ↓
callback status       confirm payment       webhook auto-approve
Три участника: фронтенд (React в Mini App), бэкенд (Hono/Express/любой сервер), Telegram Bot API. Оплата происходит нативно внутри Telegram — без редиректов, без ботов в чате.

1. Бэкенд: создание invoice link
Фронтенд вызывает твой сервер, сервер идёт в Bot API и возвращает ссылку:

// POST /premium/invoice  { packageId: "coins_100" }

app.post('/premium/invoice', async (c) => {
  const { packageId } = await c.req.json();
  const botToken = process.env.TELEGRAM_BOT_TOKEN; // или Deno.env.get()

  // Определяем пакет
  const pkg = {
    id: 'coins_100',
    label: '100 монет',
    description: 'Пополнение баланса на 100 монет',
    stars: 50, // цена в Telegram Stars (1 Star ≈ $0.02)
  };

  // Вызываем Telegram Bot API — createInvoiceLink
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: pkg.label,
        description: pkg.description,
        // payload — любая строка, вернётся в webhook при оплате
        payload: JSON.stringify({
          packageId: pkg.id,
          tgId: authenticatedUserId,
          ts: Date.now(),
        }),
        currency: 'XTR',  // ← КЛЮЧЕВОЕ: "XTR" = Telegram Stars
        prices: [
          { label: pkg.label, amount: pkg.stars }, // amount = кол-во Stars
        ],
      }),
    },
  );

  const result = await response.json();

  if (!result.ok) {
    return c.json({ error: result.description }, 500);
  }

  // result.result — это URL вида "https://t.me/$..."
  return c.json({ invoiceUrl: result.result });
});
Критически важно:

currency: 'XTR' — именно эта строка активирует оплату в Telegram Stars
amount в prices — количество Stars (целое число), не центы и не доллары
payload — произвольная строка до 128 байт, вернётся в webhook
2. Фронтенд: открытие нативного окна оплаты
const handleBuy = async (packageId: string) => {
  // 1. Запрашиваем invoice URL у своего бэкенда
  const res = await fetch('/api/premium/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageId }),
  });
  const { invoiceUrl } = await res.json();

  // 2. Открываем нативное окно оплаты Telegram
  const tg = window.Telegram?.WebApp;

  if (tg?.openInvoice) {
    // openInvoice — магия! Открывает платёжное окно прямо в Mini App
    tg.openInvoice(invoiceUrl, async (status: string) => {
      // 3. Callback вызывается когда пользователь закрыл окно оплаты
      // status: "paid" | "cancelled" | "failed" | "pending"

      if (status === 'paid') {
        // 4. Подтверждаем на бэкенде и начисляем бонусы
        await fetch('/api/premium/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageId }),
        });

        // Обновляем UI
        refreshBalance();
        alert('Оплата прошла!');
      }
    });
  }
};
tg.openInvoice(url, callback) — это единственный метод, который нужен на фронте. Он:

Открывает нативный платёжный bottom sheet Telegram
Пользователь видит описание, цену в Stars, кнопку «Pay»
После оплаты/отмены вызывается callback со статусом
Никаких редиректов, никаких внешних окон
3. Бэкенд: webhook для pre_checkout_query (обязательно!)
Telegram перед списанием Stars отправляет pre_checkout_query в webhook бота. Если не ответить за 10 секунд — оплата отменяется.

// Webhook endpoint — тот же, что для /start и других update'ов
app.post('/webhook/telegram', async (c) => {
  const body = await c.req.json();

  // ━━━ Pre-checkout query (ОБЯЗАТЕЛЬНО) ━━━
  const preCheckout = body?.pre_checkout_query;
  if (preCheckout) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Отвечаем ok: true — одобряем платёж
    await fetch(
      `https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: preCheckout.id,
          ok: true,
          // Если нужно отклонить:
          // ok: false,
          // error_message: "Товар больше не доступен"
        }),
      },
    );

    return c.json({ ok: true });
  }

  // ━━━ Successful payment (опционально — для логирования) ━━━
  const payment = body?.message?.successful_payment;
  if (payment) {
    const payload = JSON.parse(payment.invoice_payload || '{}');
    console.log(`Payment received: ${payload.tgId} bought ${payload.packageId}`);
    // Здесь можно продублировать начисление, если фронт не вызвал /confirm
    return c.json({ ok: true });
  }

  // ... остальная обработка (message, /start и т.д.)
  return c.json({ ok: true });
});
4. Регистрация webhook с поддержкой платежей
При регистрации webhook обязательно указать pre_checkout_query в allowed_updates:

// GET /webhook/setup — вызвать один раз
app.get('/webhook/setup', async (c) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = 'https://your-server.com/webhook/telegram';

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'pre_checkout_query'], // ← ОБЯЗАТЕЛЬНО
        drop_pending_updates: true,
      }),
    },
  );

  return c.json(await res.json());
});
5. Бэкенд: подтверждение и начисление (после оплаты)
// POST /premium/confirm  { packageId }
app.post('/premium/confirm', async (c) => {
  const { packageId } = await c.req.json();
  const userId = getAuthenticatedUser(c); // твоя авторизация

  // Начисляем монеты / активируем VIP / что угодно
  const wallet = await db.get(`wallet:${userId}`) || { balance: 0 };
  wallet.balance += package.coins;
  await db.set(`wallet:${userId}`, wallet);

  return c.json({ success: true, balance: wallet.balance });
});
Чеклист перед запуском
#	Что сделать	Проверить
1	currency: 'XTR' в createInvoiceLink	Без этого Stars не работают
2	allowed_updates включает pre_checkout_query	Иначе webhook не получит запрос и оплата зависнет
3	answerPreCheckoutQuery с ok: true	Ответить за 10 сек, иначе Telegram отменит платёж
4	window.Telegram.WebApp.openInvoice()	Работает только внутри Telegram Mini App
5	Бот должен быть подключен к Payments	В @BotFather → /mybots → Payments
6	Webhook зарегистрирован (/setWebhook)	Один раз вызвать setup endpoint
Минимальный флоу в 4 строки
Фронт:  POST /invoice {packageId}     → получил invoiceUrl
Фронт:  tg.openInvoice(invoiceUrl)    → нативный платёжный UI
Сервер: answerPreCheckoutQuery(ok:true) → одобрил списание
Фронт:  callback("paid") → POST /confirm → начислили бонусы
Всё. Никаких SDK оплаты, никаких провайдеров, никаких iframe — Telegram делает всю работу через openInvoice() и pre_checkout_query.