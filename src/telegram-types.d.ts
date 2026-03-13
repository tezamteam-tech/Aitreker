// =============================================
// BECOME — Telegram WebApp TypeScript Definitions
// =============================================
// Full type definitions for window.Telegram.WebApp
// Based on Telegram Mini Apps Bot API documentation.
// =============================================

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  added_to_attachment_menu?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

interface TelegramContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
  vcard?: string;
}

interface WebAppInitData {
  query_id?: string;
  user?: TelegramUser;
  receiver?: TelegramUser;
  chat?: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    photo_url?: string;
  };
  chat_type?: string;
  chat_instance?: string;
  start_param?: string;
  can_send_after?: number;
  auth_date: number;
  hash: string;
}

interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
  bottom_bar_bg_color?: string;
  section_separator_color?: string;
}

interface BackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface MainButton {
  text: string;
  color: string;
  textColor: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText(text: string): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }): void;
}

interface HapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface ContentSafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface WebApp {
  initData: string;
  initDataUnsafe: WebAppInitData;
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  isExpanded: boolean;
  isFullscreen?: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  BackButton: BackButton;
  MainButton: MainButton;
  HapticFeedback: HapticFeedback;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: ContentSafeAreaInset;

  ready(): void;
  expand(): void;
  close(): void;
  sendData(data: string): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(url: string, callback?: (status: string) => void): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  requestFullscreen?(): void;
  requestContact?(callback: (sent: boolean, event?: {
    responseUnsafe?: { contact?: TelegramContact }
  }) => void): void;
  onEvent?(eventType: string, callback: (...args: any[]) => void): void;
  offEvent?(eventType: string, callback: (...args: any[]) => void): void;
  showPopup?(params: {
    title?: string;
    message: string;
    buttons?: Array<{ id?: string; type?: string; text?: string }>;
  }, callback?: (id: string) => void): void;
  showAlert?(message: string, callback?: () => void): void;
  showConfirm?(message: string, callback?: (confirmed: boolean) => void): void;
  switchInlineQuery?(query: string, choose_chat_types?: string[]): void;
}

interface Telegram {
  WebApp: WebApp;
}

interface Window {
  Telegram?: Telegram;
}
