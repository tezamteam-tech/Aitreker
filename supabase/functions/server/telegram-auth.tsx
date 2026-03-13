// =============================================
// BECOME — Telegram initData HMAC-SHA256 Validation
// =============================================

export interface TelegramUserData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface TelegramAuthResult {
  valid: boolean;
  user?: TelegramUserData;
}

/**
 * Validates Telegram WebApp initData using HMAC-SHA256.
 *
 * Algorithm:
 * 1. Parse initData as URLSearchParams
 * 2. Extract "hash", sort remaining fields alphabetically
 * 3. data_check_string = sorted fields joined by "\n"
 * 4. secret_key = HMAC-SHA256("WebAppData", BOT_TOKEN)
 * 5. Verify HMAC-SHA256(secret_key, data_check_string) === hash
 */
export async function validateInitData(initData: string): Promise<TelegramAuthResult> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN_BECOME");
  if (!botToken) {
    console.log("ERROR: TELEGRAM_BOT_TOKEN_BECOME environment variable is not set");
    throw new Error("TELEGRAM_BOT_TOKEN_BECOME environment variable is not set");
  }

  if (!initData || initData.trim() === "") {
    return { valid: false };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      console.log("No hash found in initData");
      return { valid: false };
    }

    // Remove hash from params and sort remaining
    params.delete("hash");
    const entries = Array.from(params.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

    // Create secret key: HMAC-SHA256("WebAppData", BOT_TOKEN)
    const encoder = new TextEncoder();
    const keyData = encoder.encode("WebAppData");
    const botTokenData = encoder.encode(botToken);

    const secretKeyMaterial = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const secretKeyBuffer = await crypto.subtle.sign("HMAC", secretKeyMaterial, botTokenData);

    // Verify: HMAC-SHA256(secretKey, dataCheckString) === hash
    const verifyKey = await crypto.subtle.importKey(
      "raw",
      secretKeyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", verifyKey, encoder.encode(dataCheckString));

    // Convert to hex
    const computedHash = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computedHash !== hash) {
      console.log("Hash mismatch: initData validation failed");
      return { valid: false };
    }

    // Parse user data
    const userStr = params.get("user");
    if (!userStr) {
      console.log("No user field in initData");
      return { valid: false };
    }

    const user: TelegramUserData = JSON.parse(userStr);
    return { valid: true, user };
  } catch (err) {
    console.log("Error validating initData:", err);
    return { valid: false };
  }
}
