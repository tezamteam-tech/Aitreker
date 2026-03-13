// =============================================
// Proper Food AI — Backend Reference (apps/api)
// =============================================
// This file is NOT rendered in the frontend.
// It documents the exact backend implementation
// you should create in /apps/api for production.
//
// Stack: Node.js + Express + TypeScript + Prisma + JWT
// =============================================

// ---- .env ----
// BOT_TOKEN=your_telegram_bot_token
// DATABASE_URL=postgresql://user:pass@localhost:5432/become
// JWT_SECRET=your_jwt_secret_32chars
// PORT=3001

// ---- prisma/schema.prisma ----
export const PRISMA_SCHEMA = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id         String   @id @default(cuid())
  telegramId BigInt   @unique
  firstName  String
  lastName   String?
  username   String?
  photoUrl   String?
  language   String   @default("en")
  tone       String   @default("supportive")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  progress    Progress[]
  wallet      Wallet?
  challenges  Challenge[]
  memberships ChallengeMember[]
}

model Program {
  id           String  @id @default(cuid())
  code         String  @unique
  title        String
  durationDays Int
  isActive     Boolean @default(true)

  days     ProgramDay[]
  progress Progress[]
}

model ProgramDay {
  id          String  @id @default(cuid())
  programId   String
  dayNumber   Int
  title       String
  description String
  tasksJson   Json

  program Program @relation(fields: [programId], references: [id])

  @@unique([programId, dayNumber])
}

model Progress {
  id             String   @id @default(cuid())
  userId         String
  programId      String
  dayNumber      Int
  status         String   @default("pending") // done | skip | pending
  reflectionText String?
  createdAt      DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id])
  program Program @relation(fields: [programId], references: [id])

  @@unique([userId, programId, dayNumber])
}

model Wallet {
  id           String @id @default(cuid())
  userId       String @unique
  starsBalance Int    @default(0)
  tonBalance   Float  @default(0)

  user User @relation(fields: [userId], references: [id])
}

model Challenge {
  id            String   @id @default(cuid())
  ownerId       String
  type          String   // solo | contract | pool
  title         String
  depositAmount Float    @default(0)
  currency      String   @default("stars") // stars | ton
  startAt       DateTime
  endAt         DateTime
  rulesJson     Json?

  owner   User              @relation(fields: [ownerId], references: [id])
  members ChallengeMember[]
}

model ChallengeMember {
  id          String   @id @default(cuid())
  challengeId String
  userId      String
  status      String   @default("joined")
  joinedAt    DateTime @default(now())

  challenge Challenge @relation(fields: [challengeId], references: [id])
  user      User      @relation(fields: [userId], references: [id])

  @@unique([challengeId, userId])
}
`;

// ---- src/lib/telegram-auth.ts ----
export const TELEGRAM_AUTH_CODE = `
import crypto from 'crypto';

interface TelegramAuthResult {
  valid: boolean;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
    is_premium?: boolean;
  };
}

/**
 * Validates Telegram WebApp initData using HMAC-SHA256.
 * 
 * Algorithm:
 * 1. Parse initData as URLSearchParams
 * 2. Extract "hash", sort remaining fields alphabetically
 * 3. data_check_string = sorted fields joined by "\\n"
 * 4. secret_key = HMAC-SHA256("WebAppData", BOT_TOKEN)
 * 5. Verify HMAC-SHA256(secret_key, data_check_string) === hash
 * 
 * @param initData - The raw initData string from Telegram WebApp
 * @returns Validation result with parsed user data
 */
export function validateInitData(initData: string): TelegramAuthResult {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN environment variable is not set');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  
  if (!hash) {
    return { valid: false };
  }

  // Remove hash from params and sort
  params.delete('hash');
  const entries = Array.from(params.entries());
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => k + '=' + v).join('\\n');

  // Create secret key: HMAC-SHA256("WebAppData", BOT_TOKEN)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  // Verify: HMAC-SHA256(secretKey, dataCheckString) === hash
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    return { valid: false };
  }

  // Parse user data
  const userStr = params.get('user');
  const user = userStr ? JSON.parse(decodeURIComponent(userStr)) : undefined;

  return { valid: true, user };
}
`;

// ---- src/routes/auth.ts ----
export const AUTH_ROUTES_CODE = `
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { validateInitData } from '../lib/telegram-auth';

const router = Router();
const prisma = new PrismaClient();

// POST /auth/telegram
router.post('/auth/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ 
        message: 'initData is required', 
        code: 'MISSING_INIT_DATA', 
        status: 400 
      });
    }

    const result = validateInitData(initData);
    
    if (!result.valid || !result.user) {
      return res.status(401).json({ 
        message: 'Invalid Telegram auth data', 
        code: 'INVALID_AUTH', 
        status: 401 
      });
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: { telegramId: result.user.id },
      update: {
        firstName: result.user.first_name,
        lastName: result.user.last_name || null,
        username: result.user.username || null,
        photoUrl: result.user.photo_url || null,
      },
      create: {
        telegramId: result.user.id,
        firstName: result.user.first_name,
        lastName: result.user.last_name || null,
        username: result.user.username || null,
        photoUrl: result.user.photo_url || null,
        language: result.user.language_code || 'en',
        wallet: { create: {} },
      },
      include: { wallet: true },
    });

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, telegramId: user.telegramId.toString() },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    return res.json({ user, token });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ 
      message: 'Internal server error', 
      code: 'INTERNAL_ERROR', 
      status: 500 
    });
  }
});

export default router;
`;

// ---- src/middleware/auth.ts ----
export const AUTH_MIDDLEWARE_CODE = `
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  telegramId?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ 
      message: 'Missing or invalid authorization header', 
      code: 'UNAUTHORIZED', 
      status: 401 
    });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      telegramId: string;
    };
    
    req.userId = payload.userId;
    req.telegramId = payload.telegramId;
    next();
  } catch {
    return res.status(401).json({ 
      message: 'Invalid or expired token', 
      code: 'TOKEN_INVALID', 
      status: 401 
    });
  }
}
`;

// ---- src/routes/me.ts ----
export const ME_ROUTE_CODE = `
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /me
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { wallet: true },
  });

  if (!user) {
    return res.status(404).json({ 
      message: 'User not found', 
      code: 'NOT_FOUND', 
      status: 404 
    });
  }

  return res.json(user);
});

export default router;
`;

// ---- src/server.ts (entrypoint) ----
export const SERVER_CODE = `
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import meRoutes from './routes/me';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Health check
app.get('/health', (_, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    version: '1.0.0' 
  });
});

// Routes
app.use(authRoutes);
app.use(meRoutes);

app.listen(PORT, () => {
  console.log(\\\`Proper Food AI API running on port \\\${PORT}\\\`);
});
`;

// ---- prisma/seed.ts ----
export const SEED_SCRIPT = `
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create 7-Day Focus program
  const program = await prisma.program.upsert({
    where: { code: '7DAY_FOCUS' },
    update: {},
    create: {
      code: '7DAY_FOCUS',
      title: '7-Day Focus',
      durationDays: 7,
      isActive: true,
    },
  });

  const days = [
    {
      dayNumber: 1,
      title: 'Set Your Intention',
      description: 'Begin with clarity. Define what focus means to you.',
      tasksJson: [
        { id: 't1_1', title: 'Morning Breath Work', description: '5 min box breathing', type: 'mindfulness', emoji: '🫁' },
        { id: 't1_2', title: 'Write Focus Statement', description: '1-2 sentence intention', type: 'action', emoji: '✍️' },
        { id: 't1_3', title: 'Evening Reflection', description: 'Journal your experience', type: 'reflection', emoji: '🌙' },
      ],
    },
    // ... Days 2-7 (see seed-data.tsx for full content)
  ];

  for (const day of days) {
    await prisma.programDay.upsert({
      where: { programId_dayNumber: { programId: program.id, dayNumber: day.dayNumber } },
      update: day,
      create: { ...day, programId: program.id },
    });
  }

  console.log('Seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
`;

// ---- Monorepo structure ----
export const MONOREPO_STRUCTURE = `
become/
├── apps/
│   ├── web/                    # Frontend (this Figma Make app)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── App.tsx
│   │   │   │   ├── routes.tsx
│   │   │   │   └── components/
│   │   │   │       ├── types.tsx
│   │   │   │       ├── api-client.tsx
│   │   │   │       ├── auth-context.tsx
│   │   │   │       ├── telegram.tsx
│   │   │   │       ├── seed-data.tsx
│   │   │   │       ├── glass-card.tsx
│   │   │   │       ├── onboarding.tsx
│   │   │   │       ├── dashboard.tsx
│   │   │   │       ├── day-view.tsx
│   │   │   │       ├── profile.tsx
│   │   │   │       └── layout.tsx
│   │   │   └── styles/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── api/                    # Backend
│       ├── src/
│       │   ├── server.ts       # Express entrypoint
│       │   ├── lib/
│       │   │   └── telegram-auth.ts  # initData HMAC validation
│       │   ├── middleware/
│       │   │   └── auth.ts     # JWT middleware
│       │   └── routes/
│       │       ├── auth.ts     # POST /auth/telegram
│       │       ├── me.ts       # GET /me
│       │       ├── programs.ts
│       │       └── progress.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── seed.ts
│       ├── .env
│       └── package.json
│
└── packages/
    └── shared/                 # Shared types
        ├── src/
        │   └── types.ts        # = types.tsx content
        ├── package.json
        └── tsconfig.json
`;

// This component renders nothing — it's documentation only
export function BackendReference() {
  return null;
}

// =============================================
// FOOD SCANNING — Edge Function Implementation
// =============================================
// Endpoints:
//   POST /food/scan        — AI food recognition via OpenAI Vision
//   POST /food/entries     — Save food entry to database
//   GET  /food/entries     — List food entries (by date)
//   DELETE /food/entries/:id — Remove food entry
// =============================================

export const FOOD_SCAN_EDGE_FUNCTION = `
// ---- POST /food/scan ----
// Receives: { imageBase64: string, mimeType?: string }
// Calls OpenAI Vision API to analyze food in image
// Returns: { food_name, estimated_calories, protein, carbs, fat }

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

async function handleFoodScan(req: Request, userId: string): Promise<Response> {
  const { imageBase64, mimeType = "image/jpeg" } = await req.json();

  if (!imageBase64) {
    return new Response(JSON.stringify({
      message: "imageBase64 is required",
      code: "MISSING_IMAGE",
      status: 400,
    }), { status: 400 });
  }

  const dataUrl = \\\`data:\\\${mimeType};base64,\\\${imageBase64}\\\`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: \\\`You are a nutrition analysis AI. Analyze the food in the image.
Return ONLY valid JSON with this exact structure:
{
  "food_name": "Name of the dish or food item",
  "estimated_calories": <number>,
  "protein": <number in grams>,
  "carbs": <number in grams>,
  "fat": <number in grams>
}
If multiple food items are visible, combine them into a single meal estimate.
Be as accurate as possible with calorie and macro estimates.
Do not include any text outside the JSON object.\\\`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze the food in this image."
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "low" }
          }
        ]
      }
    ],
    max_tokens: 300,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content?.trim() || "";
  
  // Parse JSON from response (handle markdown code blocks)
  let parsed;
  try {
    const jsonStr = content.replace(/\\\`\\\`\\\`json?\\n?/g, "").replace(/\\\`\\\`\\\`/g, "").trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    return new Response(JSON.stringify({
      message: "Failed to parse AI response",
      code: "AI_PARSE_ERROR",
      status: 500,
    }), { status: 500 });
  }

  return new Response(JSON.stringify({
    food_name: parsed.food_name || "Unknown food",
    estimated_calories: Number(parsed.estimated_calories) || 0,
    protein: Number(parsed.protein) || 0,
    carbs: Number(parsed.carbs) || 0,
    fat: Number(parsed.fat) || 0,
  }));
}

// ---- POST /food/entries ----
// Receives: { food_name, calories, protein, carbs, fat, meal_type?, image_base64? }
// Stores in kv_store as become:food_entries:{userId}:{date}:{entryId}
// Optionally uploads image to Supabase Storage

async function handleAddFoodEntry(req: Request, userId: string, kv: any): Promise<Response> {
  const { food_name, calories, protein, carbs, fat, meal_type, image_base64 } = await req.json();

  const entryId = crypto.randomUUID();
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

  let image_url: string | null = null;

  // Optionally upload image to Supabase Storage
  if (image_base64) {
    // Upload to storage bucket "food-photos"
    // image_url = signed URL after upload
  }

  const entry = {
    id: entryId,
    user_id: userId,
    food_name,
    calories: Number(calories),
    protein: Number(protein),
    carbs: Number(carbs),
    fat: Number(fat),
    meal_type: meal_type || "snack",
    image_url,
    created_at: now.toISOString(),
  };

  // Store in KV
  const key = \\\`become:food_entries:\\\${userId}:\\\${dateStr}:\\\${entryId}\\\`;
  await kv.set(key, JSON.stringify(entry));

  return new Response(JSON.stringify(entry));
}

// ---- GET /food/entries?date=YYYY-MM-DD ----
// Returns all food entries for the given date (default: today)

async function handleGetFoodEntries(req: Request, userId: string, kv: any): Promise<Response> {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];

  const prefix = \\\`become:food_entries:\\\${userId}:\\\${date}:\\\`;
  const keys = await kv.list({ prefix });
  
  const entries = [];
  let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  
  for (const key of keys) {
    const raw = await kv.get(key.name);
    if (raw) {
      const entry = JSON.parse(raw);
      entries.push(entry);
      totals.calories += entry.calories;
      totals.protein += entry.protein;
      totals.carbs += entry.carbs;
      totals.fat += entry.fat;
    }
  }

  // Sort by created_at
  entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return new Response(JSON.stringify({ entries, totals }));
}

// ---- DELETE /food/entries/:id ----
async function handleDeleteFoodEntry(entryId: string, userId: string, kv: any): Promise<Response> {
  // Search for the entry across dates
  const prefix = \\\`become:food_entries:\\\${userId}:\\\`;
  const keys = await kv.list({ prefix });
  
  for (const key of keys) {
    if (key.name.endsWith(entryId)) {
      await kv.delete(key.name);
      return new Response(JSON.stringify({ success: true }));
    }
  }

  return new Response(JSON.stringify({
    message: "Entry not found",
    code: "NOT_FOUND",
    status: 404,
  }), { status: 404 });
}
`;

// =============================================
// MEAL PLAN GENERATION — Edge Function Handlers
// =============================================
// Required: OPENAI_API_KEY secret in Supabase project
//
// Table: meal_plans (or KV store)
//   - user_id: string
//   - plan_length: number (7 | 30 | 100)
//   - plan_data_json: JSON (MealPlanData)
//   - created_at: ISO timestamp
//
// Routes:
//   POST /meal-plans/generate — AI generation
//   GET  /meal-plans           — list user's plans
//   GET  /meal-plans/:id       — get single plan
//   DELETE /meal-plans/:id     — delete plan
// =============================================

export const MEAL_PLAN_HANDLERS = `
// ---- POST /meal-plans/generate ----
// Receives: { plan_length, goal, daily_calories, gender, activity_level }
// Calls OpenAI to generate full meal plan, saves to KV, returns result

async function handleGenerateMealPlan(req: Request, userId: string, kv: any): Promise<Response> {
  const { plan_length, goal, daily_calories, gender, activity_level } = await req.json();

  // Validate plan_length
  if (![7, 30, 100].includes(plan_length)) {
    return new Response(JSON.stringify({
      message: "plan_length must be 7, 30, or 100",
      code: "INVALID_INPUT",
      status: 400,
    }), { status: 400 });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({
      message: "OpenAI API key not configured",
      code: "CONFIG_ERROR",
      status: 500,
    }), { status: 500 });
  }

  // Goal label mapping
  const goalLabels: Record<string, string> = {
    lose_weight: "lose weight (calorie deficit)",
    maintain_weight: "maintain current weight",
    gain_muscle: "build muscle (calorie surplus)",
  };

  const activityLabels: Record<string, string> = {
    low: "sedentary (little or no exercise)",
    medium: "lightly active (2-3 workouts/week)",
    high: "moderately active (4-5 workouts/week)",
    athlete: "very active (daily intense training)",
  };

  // For large plans (30, 100), generate in batches to stay within token limits
  const BATCH_SIZE = plan_length <= 7 ? plan_length : 7;
  const totalBatches = Math.ceil(plan_length / BATCH_SIZE);
  const allDays: any[] = [];

  for (let batch = 0; batch < totalBatches; batch++) {
    const startDay = batch * BATCH_SIZE + 1;
    const endDay = Math.min(startDay + BATCH_SIZE - 1, plan_length);
    const daysInBatch = endDay - startDay + 1;

    const prompt = \`Generate a detailed meal plan for days \${startDay} to \${endDay} (\${daysInBatch} days).

User profile:
- Gender: \${gender}
- Goal: \${goalLabels[goal] || goal}
- Daily calorie target: \${daily_calories} calories
- Activity level: \${activityLabels[activity_level] || activity_level}

For each day, provide exactly 4 meals: breakfast, lunch, dinner, snack.
Each meal should have 1-4 food items.

IMPORTANT: 
- Total daily calories should be close to \${daily_calories} (within 5% tolerance).
- Vary meals across days — avoid repeating the same meals.
- Include diverse, realistic food items.
- All quantities should be practical portions.

Return JSON only. No markdown, no explanation. The exact format:
{
  "days": [
    {
      "day": \${startDay},
      "meals": [
        {
          "meal_type": "breakfast",
          "items": [
            {
              "food_name": "Oatmeal with Berries",
              "calories": 320,
              "protein": 12,
              "carbs": 54,
              "fat": 8,
              "quantity": 250,
              "unit": "g"
            }
          ]
        },
        { "meal_type": "lunch", "items": [...] },
        { "meal_type": "dinner", "items": [...] },
        { "meal_type": "snack", "items": [...] }
      ]
    }
  ]
}\`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${OPENAI_API_KEY}\`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a professional nutritionist. Generate meal plans in valid JSON format only. No markdown, no code blocks, no explanation — just the JSON object."
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 4000,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[MealPlan] OpenAI error:", errText);
      return new Response(JSON.stringify({
        message: "AI generation failed",
        code: "AI_ERROR",
        status: 500,
      }), { status: 500 });
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonStr = content.replace(/\\\`\\\`\\\`json?\\n?/g, "").replace(/\\\`\\\`\\\`/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[MealPlan] Parse error for batch", batch, content.substring(0, 200));
      return new Response(JSON.stringify({
        message: "Failed to parse AI response",
        code: "AI_PARSE_ERROR",
        status: 500,
      }), { status: 500 });
    }

    if (parsed.days && Array.isArray(parsed.days)) {
      allDays.push(...parsed.days);
    }
  }

  // Create plan record
  const planId = crypto.randomUUID();
  const now = new Date().toISOString();

  const plan = {
    id: planId,
    user_id: userId,
    plan_length,
    plan_data: { days: allDays },
    created_at: now,
  };

  // Save to KV
  const planKey = \\\`become:meal_plans:\\\${userId}:\\\${planId}\\\`;
  await kv.set(planKey, JSON.stringify(plan));

  // Also maintain an index of plan IDs for listing
  const indexKey = \\\`become:meal_plans_index:\\\${userId}\\\`;
  const existingIndex = await kv.get(indexKey);
  const planIds: string[] = existingIndex ? JSON.parse(existingIndex) : [];
  planIds.unshift(planId); // newest first
  await kv.set(indexKey, JSON.stringify(planIds.slice(0, 20))); // keep last 20

  return new Response(JSON.stringify({
    id: planId,
    plan_length,
    plan_data: { days: allDays },
    created_at: now,
  }));
}

// ---- GET /meal-plans ----
// Returns list of user's saved plans (preview only, no full plan_data)

async function handleGetMealPlans(userId: string, kv: any): Promise<Response> {
  const indexKey = \\\`become:meal_plans_index:\\\${userId}\\\`;
  const existingIndex = await kv.get(indexKey);
  const planIds: string[] = existingIndex ? JSON.parse(existingIndex) : [];

  const plans = [];
  for (const planId of planIds) {
    const planKey = \\\`become:meal_plans:\\\${userId}:\\\${planId}\\\`;
    const raw = await kv.get(planKey);
    if (raw) {
      const plan = JSON.parse(raw);
      plans.push({
        id: plan.id,
        plan_length: plan.plan_length,
        created_at: plan.created_at,
        preview: plan.plan_data?.days?.[0]?.meals?.[0]?.items?.[0]?.food_name || "Meal Plan",
      });
    }
  }

  return new Response(JSON.stringify({ plans }));
}

// ---- GET /meal-plans/:id ----
// Returns full plan with all data

async function handleGetMealPlan(planId: string, userId: string, kv: any): Promise<Response> {
  const planKey = \\\`become:meal_plans:\\\${userId}:\\\${planId}\\\`;
  const raw = await kv.get(planKey);

  if (!raw) {
    return new Response(JSON.stringify({
      message: "Plan not found",
      code: "NOT_FOUND",
      status: 404,
    }), { status: 404 });
  }

  const plan = JSON.parse(raw);
  return new Response(JSON.stringify({
    id: plan.id,
    plan_length: plan.plan_length,
    plan_data: plan.plan_data,
    created_at: plan.created_at,
  }));
}

// ---- DELETE /meal-plans/:id ----
async function handleDeleteMealPlan(planId: string, userId: string, kv: any): Promise<Response> {
  const planKey = \\\`become:meal_plans:\\\${userId}:\\\${planId}\\\`;
  await kv.delete(planKey);

  // Remove from index
  const indexKey = \\\`become:meal_plans_index:\\\${userId}\\\`;
  const existingIndex = await kv.get(indexKey);
  if (existingIndex) {
    const planIds: string[] = JSON.parse(existingIndex);
    const updated = planIds.filter(id => id !== planId);
    await kv.set(indexKey, JSON.stringify(updated));
  }

  return new Response(JSON.stringify({ success: true }));
}

// ---- Route registration in main handler ----
// Add to the main request handler switch:
//
// case "POST /meal-plans/generate":
//   return handleGenerateMealPlan(req, userId, kv);
// case "GET /meal-plans":
//   return handleGetMealPlans(userId, kv);
// case url.match(/^GET \\/meal-plans\\/(.+)$/):
//   return handleGetMealPlan(match[1], userId, kv);
// case url.match(/^DELETE \\/meal-plans\\/(.+)$/):
//   return handleDeleteMealPlan(match[1], userId, kv);
`;

// =============================================
// WORKOUT PLAN GENERATION — Edge Function Handlers
// =============================================
// Required: OPENAI_API_KEY secret
//
// KV Storage:
//   become:workout_plans:{userId}:{planId}  — full plan data
//   become:workout_plans_index:{userId}     — array of plan IDs
//
// Routes:
//   POST   /workout-plans/generate — AI generation
//   GET    /workout-plans           — list user's plans
//   GET    /workout-plans/:id       — get single plan
//   DELETE /workout-plans/:id       — delete plan
// =============================================

export const WORKOUT_PLAN_HANDLERS = `
// ---- POST /workout-plans/generate ----
// Receives: { plan_length, workout_type, goal, gender, activity_level }
// workout_type: "home" | "gym"

async function handleGenerateWorkoutPlan(req: Request, userId: string, kv: any): Promise<Response> {
  const { plan_length, workout_type, goal, gender, activity_level } = await req.json();

  if (![7, 30, 100].includes(plan_length)) {
    return new Response(JSON.stringify({
      message: "plan_length must be 7, 30, or 100",
      code: "INVALID_INPUT",
      status: 400,
    }), { status: 400 });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({
      message: "OpenAI API key not configured",
      code: "CONFIG_ERROR",
      status: 500,
    }), { status: 500 });
  }

  const goalLabels: Record<string, string> = {
    lose_weight: "lose weight and burn fat",
    maintain_weight: "maintain fitness and stay active",
    gain_muscle: "build muscle and gain strength",
  };

  const activityLabels: Record<string, string> = {
    low: "beginner (little or no exercise history)",
    medium: "intermediate (2-3 workouts/week)",
    high: "advanced (4-5 workouts/week)",
    athlete: "very advanced (daily training)",
  };

  const equipmentNote = workout_type === "home"
    ? "HOME WORKOUTS ONLY. No gym equipment. Use only bodyweight exercises, resistance bands, and simple household items (chair, wall, floor). No barbells, dumbbells, or machines."
    : "GYM WORKOUTS. Full gym equipment available: barbells, dumbbells, machines, cables, benches, pull-up bars, etc.";

  const BATCH_SIZE = plan_length <= 7 ? plan_length : 7;
  const totalBatches = Math.ceil(plan_length / BATCH_SIZE);
  const allDays: any[] = [];

  for (let batch = 0; batch < totalBatches; batch++) {
    const startDay = batch * BATCH_SIZE + 1;
    const endDay = Math.min(startDay + BATCH_SIZE - 1, plan_length);
    const daysInBatch = endDay - startDay + 1;

    const prompt = \\\`Generate a workout plan for days \\\${startDay} to \\\${endDay} (\\\${daysInBatch} days).

User profile:
- Gender: \\\${gender}
- Goal: \\\${goalLabels[goal] || goal}
- Activity level: \\\${activityLabels[activity_level] || activity_level}

\\\${equipmentNote}

Rules:
- Include 1-2 rest days per 7-day block.
- Rest days should have workout_type "rest" and empty exercises array.
- Vary workout focus across days (upper body, lower body, full body, cardio, etc.).
- Each workout day should have 5-8 exercises.
- workout_type must be one of: "strength", "cardio", "flexibility", "hiit", "rest".
- For time-based exercises (planks, wall sits), use duration_seconds instead of reps.
- Include realistic rest_seconds between sets (30-120 seconds).
- muscle_group should be specific (e.g. "Chest", "Quads", "Core", "Full Body").
- duration_minutes should be the estimated total workout time.

Return JSON only. No markdown. Exact format:
{
  "days": [
    {
      "day": \\\${startDay},
      "focus": "Upper Body Strength",
      "workout_type": "strength",
      "duration_minutes": 45,
      "exercises": [
        {
          "exercise_name": "Push-ups",
          "sets": 3,
          "reps": "12-15",
          "rest_seconds": 60,
          "muscle_group": "Chest",
          "notes": "Keep core tight"
        },
        {
          "exercise_name": "Plank",
          "sets": 3,
          "reps": "hold",
          "duration_seconds": 45,
          "rest_seconds": 30,
          "muscle_group": "Core"
        }
      ]
    },
    {
      "day": \\\${startDay + 1},
      "focus": "Rest & Recovery",
      "workout_type": "rest",
      "duration_minutes": 0,
      "exercises": []
    }
  ]
}\\\`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \\\`Bearer \\\${OPENAI_API_KEY}\\\`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a certified personal trainer. Generate workout plans in valid JSON only. No markdown, no code blocks."
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 4000,
      }),
    });

    if (!openaiRes.ok) {
      console.error("[WorkoutPlan] OpenAI error:", await openaiRes.text());
      return new Response(JSON.stringify({
        message: "AI generation failed",
        code: "AI_ERROR",
        status: 500,
      }), { status: 500 });
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonStr = content.replace(/\\\\\\\`\\\\\\\`\\\\\\\`json?\\\\n?/g, "").replace(/\\\\\\\`\\\\\\\`\\\\\\\`/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[WorkoutPlan] Parse error batch", batch);
      return new Response(JSON.stringify({
        message: "Failed to parse AI response",
        code: "AI_PARSE_ERROR",
        status: 500,
      }), { status: 500 });
    }

    if (parsed.days && Array.isArray(parsed.days)) {
      allDays.push(...parsed.days);
    }
  }

  const planId = crypto.randomUUID();
  const now = new Date().toISOString();

  const plan = {
    id: planId,
    user_id: userId,
    plan_length,
    workout_type,
    workout_data: { days: allDays },
    created_at: now,
  };

  const planKey = \\\`become:workout_plans:\\\${userId}:\\\${planId}\\\`;
  await kv.set(planKey, JSON.stringify(plan));

  const indexKey = \\\`become:workout_plans_index:\\\${userId}\\\`;
  const existingIndex = await kv.get(indexKey);
  const planIds: string[] = existingIndex ? JSON.parse(existingIndex) : [];
  planIds.unshift(planId);
  await kv.set(indexKey, JSON.stringify(planIds.slice(0, 20)));

  return new Response(JSON.stringify({
    id: planId,
    plan_length,
    workout_type,
    workout_data: { days: allDays },
    created_at: now,
  }));
}

// ---- GET /workout-plans ----
async function handleGetWorkoutPlans(userId: string, kv: any): Promise<Response> {
  const indexKey = \\\`become:workout_plans_index:\\\${userId}\\\`;
  const existingIndex = await kv.get(indexKey);
  const planIds: string[] = existingIndex ? JSON.parse(existingIndex) : [];

  const plans = [];
  for (const planId of planIds) {
    const raw = await kv.get(\\\`become:workout_plans:\\\${userId}:\\\${planId}\\\`);
    if (raw) {
      const plan = JSON.parse(raw);
      plans.push({
        id: plan.id,
        plan_length: plan.plan_length,
        workout_type: plan.workout_type,
        created_at: plan.created_at,
        preview: plan.workout_data?.days?.[0]?.focus || "Workout Plan",
      });
    }
  }

  return new Response(JSON.stringify({ plans }));
}

// ---- GET /workout-plans/:id ----
async function handleGetWorkoutPlan(planId: string, userId: string, kv: any): Promise<Response> {
  const raw = await kv.get(\\\`become:workout_plans:\\\${userId}:\\\${planId}\\\`);
  if (!raw) {
    return new Response(JSON.stringify({ message: "Plan not found", code: "NOT_FOUND", status: 404 }), { status: 404 });
  }
  const plan = JSON.parse(raw);
  return new Response(JSON.stringify({
    id: plan.id,
    plan_length: plan.plan_length,
    workout_type: plan.workout_type,
    workout_data: plan.workout_data,
    created_at: plan.created_at,
  }));
}

// ---- DELETE /workout-plans/:id ----
async function handleDeleteWorkoutPlan(planId: string, userId: string, kv: any): Promise<Response> {
  await kv.delete(\\\`become:workout_plans:\\\${userId}:\\\${planId}\\\`);
  const indexKey = \\\`become:workout_plans_index:\\\${userId}\\\`;
  const existingIndex = await kv.get(indexKey);
  if (existingIndex) {
    const planIds: string[] = JSON.parse(existingIndex);
    await kv.set(indexKey, JSON.stringify(planIds.filter(id => id !== planId)));
  }
  return new Response(JSON.stringify({ success: true }));
}

// ---- Route registration ----
// case "POST /workout-plans/generate":
//   return handleGenerateWorkoutPlan(req, userId, kv);
// case "GET /workout-plans":
//   return handleGetWorkoutPlans(userId, kv);
// case url.match(/^GET \\/workout-plans\\/(.+)$/):
//   return handleGetWorkoutPlan(match[1], userId, kv);
// case url.match(/^DELETE \\/workout-plans\\/(.+)$/):
//   return handleDeleteWorkoutPlan(match[1], userId, kv);
`;