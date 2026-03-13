# 08. Авторизация: Telegram initData и взаимодействие с системой

## Концепция

В Telegram Mini App **нет логина и пароля**. Пользователь уже авторизован в Telegram, и приложение получает его данные автоматически через `initData` — подписанную строку, которую Telegram клиент передаёт при каждом запуске Mini App.

Приложение работает в двух режимах:
1. **Внутри Telegram** — автоматическая авторизация через initData (основной сценарий)
2. **На внешнем сайте** — гостевой режим + опциональная авторизация через Telegram-бот

## Что такое initData

`initData` — это URL-encoded строка, которую Telegram клиент помещает в `window.Telegram.WebApp.initData` (или в URL hash для @tma.js/sdk). Она содержит:

```
query_id=AAHdF...&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%2C...%7D&auth_date=1678901234&hash=abc123...
```

Распарсенные поля:
- **`user`** — JSON с данными пользователя (`id`, `first_name`, `last_name`, `username`, `photo_url`, `language_code`, `is_premium`)
- **`auth_date`** — timestamp авторизации
- **`hash`** — HMAC-SHA256 подпись, подтверждающая подлинность данных
- **`query_id`** — идентификатор сессии (опционально)
- **`start_param`** — deep link параметр (опционально)

**Ключевое**: `hash` подписан секретным ключом бота. Только сервер с bot token может верифицировать подлинность. Клиент **не может** подделать initData.

---

## Полная схема авторизации

```
┌─────────────────────────────────────────────────────────────────┐
│                    ЗАПУСК MINI APP                               │
│                                                                 │
│  Telegram клиент                                                │
│  └─ Генерирует initData (подпись hash через bot token)          │
│  └─ Помещает в window.Telegram.WebApp.initData                  │
│  └─ Открывает WebView с приложением                             │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TmaProvider (React, useEffect)                                 │
│  └─ initTma() → isTMA() → sdkInit()                            │
│  └─ retrieveRawInitData() → кеширует initData строку            │
│  └─ Устанавливает isTelegram = true                             │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  AuthProvider (React, useEffect autoAuth)                       │
│                                                                 │
│  Стратегия трёх путей (от быстрого к полному):                  │
│                                                                 │
│  1️⃣  Кеш (localStorage) — мгновенный UI                        │
│  │   └─ restoreSession() → JSON из "Mova_session"               │
│  │   └─ TTL 24 часа, если не истёк → показать сразу             │
│  │   └─ Фоновая верификация через бэкенд (шаг 3)               │
│  │                                                              │
│  2️⃣  Fast-path (launch params) — < 1ms, без сети               │
│  │   └─ retrieveLaunchParams().tgWebAppData.user                │
│  │   └─ Создать временный AppUser (id: "lp-{tgId}")            │
│  │   └─ Показать UI немедленно (optimistic)                     │
│  │   └─ Фоновая верификация через бэкенд (шаг 3)               │
│  │                                                              │
│  3️⃣  Полная верификация (сеть, HMAC проверка)                   │
│      └─ getRawInitData() → initData строка                      │
│      └─ POST /auth/telegram { initData }                        │
│      └─ Сервер верифицирует hash → syncUser → AppUser           │
│      └─ saveSession(appUser, telegramUser) в localStorage       │
│                                                                 │
│  4️⃣  Guest mode — если нет initData (внешний сайт)              │
│      └─ isAuthenticated = false, isLoading = false              │
└─────────────────────────────────────────────────────────────────┘
```

## Frontend: получение initData

### Файл: `/src/app/shared/utils/tma.ts`

```ts
import { retrieveRawInitData } from "@tma.js/sdk-react";

let _rawInitData: string | undefined;

export function getRawInitData(): string | undefined {
  if (!_rawInitData) {
    try {
      _rawInitData = retrieveRawInitData() ?? undefined;
    } catch {
      // Fallback: нативный Telegram.WebApp
      try {
        const tg = (window as any).Telegram?.WebApp;
        const d = tg?.initData;
        if (d && d.length > 0) _rawInitData = d;
      } catch {}
    }
  }
  return _rawInitData;
}
```

initData кешируется при первом чтении. Два источника:
1. **@tma.js/sdk-react** — `retrieveRawInitData()` (парсит URL hash)
2. **Нативный fallback** — `window.Telegram.WebApp.initData`

### Файл: `/src/app/features/auth/api/telegram-auth-service.ts`

Парсинг user из initData (клиентская сторона, ДО серверной верификации):

```ts
parseTelegramUser(initData: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const userStr = params.get("user");
  if (!userStr) return null;
  return JSON.parse(userStr) as TelegramUser;
}
```

Отправка на сервер:

```ts
async authenticateWithBackend(initData: string): Promise<AuthResult> {
  const telegramUser = this.parseTelegramUser(initData);

  const response = await fetch(`${API_BASE_URL}/auth/telegram`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`, // Supabase Edge Function auth
    },
    body: JSON.stringify({ initData }),
  });

  const { user } = await response.json(); // AppUser из KV store
  this.saveSession(user, telegramUser);    // Кеш в localStorage

  return { success: true, user, telegramUser, error: null };
}
```

---

## Backend: верификация initData (HMAC-SHA256)

### Файл: `/supabase/functions/server/telegram-auth.tsx`

Алгоритм верификации (официальная документация Telegram):

```ts
export async function verifyInitData(
  initData: string,
  botToken: string
): Promise<{ valid: boolean; user: TelegramInitDataUser | null }> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { valid: false, user: null };

  // 1. Убрать hash из параметров
  params.delete("hash");

  // 2. Отсортировать оставшиеся поля по алфавиту
  const dataCheckArr: string[] = [];
  params.forEach((value, key) => {
    dataCheckArr.push(`${key}=${value}`);
  });
  dataCheckArr.sort();

  // 3. Склеить через \n
  const dataCheckString = dataCheckArr.join("\n");

  // 4. secret_key = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = await hmacSha256(
    new TextEncoder().encode("WebAppData"),
    botToken
  );

  // 5. computed_hash = HMAC-SHA256(secret_key, data_check_string)
  const computedHash = bufferToHex(
    await hmacSha256(new Uint8Array(secretKey), dataCheckString)
  );

  // 6. Сравнить
  if (computedHash !== hash) {
    return { valid: false, user: null };
  }

  // Данные подлинные — парсим user
  const user = JSON.parse(params.get("user")!);
  return { valid: true, user };
}
```

### Серверный маршрут: `POST /auth/telegram`

```ts
app.post(`${PREFIX}/auth/telegram`, async (c) => {
  const { initData } = await c.req.json();

  if (!initData) {
    return c.json({ error: "Missing initData" }, 400);
  }

  // Токен бота — из env переменной (НИКОГДА не на клиенте!)
  const botToken = Deno.env.get("tg_bot_biznes_mova");
  if (!botToken) {
    return c.json({ error: "Bot token not configured" }, 500);
  }

  // Верификация HMAC-SHA256
  const { valid, user: tgUser } = await verifyInitData(initData, botToken);
  if (!valid || !tgUser) {
    return c.json({ error: "Invalid initData" }, 401);
  }

  // Синхронизация пользователя в KV store
  const appUser = await syncUser(tgUser);

  return c.json({ user: appUser });
});
```

### Синхронизация пользователя в KV Store

```ts
const USER_KEY_PREFIX = "user:tg:";

export async function syncUser(tgUser: TelegramInitDataUser): Promise<AppUser> {
  const key = `${USER_KEY_PREFIX}${tgUser.id}`; // Ключ: "user:tg:123456789"
  const existing: AppUser | null = await kv.get(key);

  if (existing) {
    // Обновить изменяемые поля, сохранить contact_phone
    const updated: AppUser = {
      ...existing,
      username: tgUser.username ?? existing.username,
      first_name: tgUser.first_name,
      last_name: tgUser.last_name ?? existing.last_name,
      avatar: tgUser.photo_url ?? existing.avatar,
      contact_phone: existing.contact_phone ?? null, // НЕ перезатираем
    };
    await kv.set(key, updated);
    return updated;
  }

  // Новый пользователь
  const newUser: AppUser = {
    id: crypto.randomUUID(),
    telegram_id: tgUser.id,
    username: tgUser.username ?? null,
    first_name: tgUser.first_name,
    last_name: tgUser.last_name ?? null,
    avatar: tgUser.photo_url ?? null,
    contact_phone: null,
    created_at: new Date().toISOString(),
  };

  await kv.set(key, newUser);
  return newUser;
}
```

---

## Типы данных

### TelegramUser (из initData, frontend)

```ts
export interface TelegramUser {
  id: number;             // Telegram user ID (уникальный, постоянный)
  first_name: string;
  last_name?: string;
  username?: string;       // @username (может меняться)
  language_code?: string;  // "ru", "en", etc.
  photo_url?: string;      // URL аватарки
  is_premium?: boolean;    // Telegram Premium
}
```

### AppUser (в KV Store, backend)

```ts
export interface AppUser {
  id: string;              // UUID, генерируется при создании
  telegram_id: number;     // Telegram user ID — основной идентификатор
  username: string | null;
  first_name: string;
  last_name: string | null;
  avatar: string | null;
  contact_phone?: string | null;  // Телефон (сохраняется отдельно)
  created_at: string;              // ISO timestamp
}
```

### AuthState (React state)

```ts
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  telegramUser: TelegramUser | null; // Данные из initData
  appUser: AppUser | null;           // Данные из KV store
  error: string | null;
}
```

---

## AuthProvider: три стратегии при запуске

### Стратегия 1: Кеш (localStorage)

```ts
// При каждом запуске сначала проверяем кеш
const cached = TelegramAuthService.restoreSession();
if (cached) {
  // Мгновенно показать UI — пользователь уже видит своё имя/аватар
  setState({
    isAuthenticated: true,
    isLoading: false,
    telegramUser: cached.telegramUser,
    appUser: cached.appUser,
    error: null,
  });

  // Фоновое обновление — верифицирует + обновляет данные
  const initData = getRawInitData();
  if (initData) {
    TelegramAuthService.authenticateWithBackend(initData).then(result => {
      if (result.success && result.user) {
        setState(prev => ({ ...prev, appUser: result.user! }));
      }
    });
  }
  return;
}
```

### Стратегия 2: Fast-path (launch params, без сети)

```ts
// Если кеша нет, но мы в Telegram — мгновенно извлекаем user из launch params
const lp = retrieveLaunchParams();
const u = lp?.tgWebAppData?.user;

if (u) {
  // Создать временный AppUser (optimistic)
  const fastAppUser: AppUser = {
    id: `lp-${u.id}`,         // Временный ID — заменится после верификации
    telegram_id: u.id,
    first_name: u.first_name,
    // ...
  };

  // UI готов мгновенно
  setState({ isAuthenticated: true, isLoading: false, appUser: fastAppUser, ... });

  // Фоновая верификация на сервере
  TelegramAuthService.authenticateWithBackend(initData).then(result => {
    if (result.success) {
      setState(prev => ({ ...prev, appUser: result.user! }));
      TelegramAuthService.saveSession(result.user, result.telegramUser);
    }
  });
  return;
}
```

### Стратегия 3: Полная верификация (fallback)

```ts
// Если ни кеш, ни launch params не сработали
const initData = getRawInitData();
if (initData) {
  await login(initData); // Полный flow с loading state
  return;
}

// Guest mode
setState(prev => ({ ...prev, isLoading: false }));
```

---

## Кеширование сессии (localStorage)

```ts
interface StoredSession {
  appUser: AppUser;
  telegramUser: TelegramUser;
  timestamp: number;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

saveSession(appUser, telegramUser) {
  localStorage.setItem("Mova_session", JSON.stringify({
    appUser, telegramUser, timestamp: Date.now()
  }));
}

restoreSession() {
  const raw = localStorage.getItem("Mova_session");
  const session = JSON.parse(raw);

  // Проверить TTL
  if (Date.now() - session.timestamp > SESSION_TTL_MS) {
    this.clearSession();
    return null;
  }

  return { appUser: session.appUser, telegramUser: session.telegramUser };
}
```

---

## Как `telegram_id` используется в API

После авторизации `telegram_id` — это основной идентификатор пользователя **во всех запросах**:

```ts
// Получить профиль
GET /auth/me?telegram_id=123456789

// Сохранить телефон
PATCH /api/user/phone
{ telegram_id: 123456789, phone: "+375291234567" }

// Все API запросы используют SUPABASE_ANON_KEY для авторизации Edge Function
headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
```

**Важно**: в этой архитектуре `telegram_id` передаётся как query/body параметр, а `SUPABASE_ANON_KEY` используется для доступа к Edge Function. Первичная верификация через HMAC гарантирует, что `telegram_id` принадлежит реальному пользователю.

### KV Store — ключи пользователей

```
user:tg:123456789 → { id, telegram_id, first_name, ... }  // AppUser
```

Все данные пользователя привязаны к `telegram_id` как primary key.

---

## Веб-авторизация (внешний сайт)

Для пользователей, которые открывают приложение в браузере (не в Telegram):

### Последовательность

```
1. Frontend: POST /auth/web-start
   ← { token: "abc123..." }

2. Frontend показывает кнопку:
   "Открыть бот: t.me/BiznesMova_bot?start=auth_abc123"

3. Пользователь нажимает → открывается Telegram бот

4. Бот получает /start auth_abc123 → синхронизирует user → обновляет KV:
   webauth:abc123 = { status: "confirmed", user: AppUser }

5. Frontend polling (каждые 2.5с):
   GET /auth/web-check/abc123
   ← { status: "confirmed", user: { ... } }

6. Frontend: loginWithUser(user)
   → setState({ isAuthenticated: true, appUser: user })
   → saveSession в localStorage
```

### Хук `useWebAuth`

```ts
export function useWebAuth() {
  const { loginWithUser } = useAuth();

  const start = async () => {
    const { token } = await TelegramAuthService.startWebAuth();
    const link = `https://t.me/BiznesMova_bot?start=auth_${token}`;
    // Показать ссылку пользователю

    // Начать polling
    setInterval(async () => {
      const check = await TelegramAuthService.checkWebAuth(token);
      if (check.status === "confirmed" && check.user) {
        loginWithUser(check.user); // Авторизован!
      }
    }, 2500);
  };

  return { start, status, botLink, cancel };
}
```

### Серверная часть

```ts
// Создание токена
POST /auth/web-start → KV: webauth:{token} = { status: "pending", expires_at: +5min }

// Бот подтверждает
POST /webhook/telegram → обработка /start auth_{token}
  → syncUser(from) → KV: webauth:{token} = { status: "confirmed", user: AppUser }

// Проверка статуса
GET /auth/web-check/:token → KV: webauth:{token} → { status, user }
  → При "confirmed": удалить токен, вернуть user
  → При expiration: удалить токен, вернуть "expired"
```

---

## Access Gate — защита разделов

Компонент `AccessGate` проверяет уровень доступа:

```tsx
<AccessGate requiredLevel="member">
  <ProtectedContent />
</AccessGate>
```

Логика:
- `!isAuthenticated` → экран «Войдите через Telegram»
- `meetsLevel(userLevel, requiredLevel)` → показать контент
- Иначе → экран «Доступно для Member/VIP»

Уровни: `guest` (0) → `member` (1) → `vip` (2)

---

## Безопасность

| Аспект | Реализация |
|--------|-----------|
| Подлинность initData | HMAC-SHA256 верификация на сервере |
| Bot token | Только на сервере (`Deno.env.get`), НИКОГДА на клиенте |
| Подделка telegram_id | Невозможна — hash в initData привязан к конкретным данным |
| Сессия | localStorage, TTL 24 часа, обновляется при каждом запуске |
| Edge Function доступ | `SUPABASE_ANON_KEY` (публичный, ограничен RLS/CORS) |
| Web auth | Одноразовый токен, TTL 5 минут, удаляется после использования |

---

## Fallback при ошибке верификации

Если бэкенд недоступен или верификация провалилась, приложение **не блокирует** пользователя полностью:

```ts
if (!result.success) {
  // Создать fallback AppUser из данных initData (не верифицированных)
  const fallbackAppUser = {
    id: `local-${tgUser.id}`, // Маркер: данные не с сервера
    telegram_id: tgUser.id,
    first_name: tgUser.first_name,
    // ...
  };
  setState({ isAuthenticated: true, appUser: fallbackAppUser });
}
```

Пользователь видит UI, но некоторые серверные операции могут не работать. ID с префиксом `local-` или `lp-` означает, что данные не прошли серверную верификацию.

---

## Переделка в другом проекте

### Минимальный набор

1. **`tma.ts`** — функция `getRawInitData()` для получения initData строки
2. **`telegram-auth.tsx` (сервер)** — `verifyInitData()` с HMAC-SHA256, `syncUser()` для KV store
3. **`telegram-auth-service.ts` (клиент)** — `authenticateWithBackend()`, `saveSession()`, `restoreSession()`
4. **`AuthProvider.tsx`** — React Context с autoAuth при mount
5. **Env переменная** — `tg_bot_biznes_mova` (или ваш bot token) на сервере
6. **Серверный маршрут** — `POST /auth/telegram` для верификации

### Что адаптировать

- `STORAGE_KEYS.SESSION` — ключ localStorage для кеша сессии
- `SESSION_TTL_MS` — время жизни кеша (по умолчанию 24ч)
- `USER_KEY_PREFIX` — префикс ключей в KV store (`user:tg:`)
- `AppUser` — интерфейс пользователя (добавить свои поля)
- `API_BASE_URL` — URL вашего бэкенда
- Bot token env variable name — имя переменной окружения

### Принципы

1. **initData получается один раз** при запуске и кешируется
2. **Верификация — только на сервере** (bot token не должен быть на клиенте)
3. **Optimistic UI** — показывать данные пользователя мгновенно, верифицировать в фоне
4. **Graceful degradation** — если сервер недоступен, всё равно показать UI
5. **telegram_id — primary key** — все данные привязаны к нему
