import { Alert, AlertButton, AlertOptions, Platform } from "react-native";

/**
 * Robust emoji and symbol sanitizer that cleans all unicode emojis,
 * symbols, dingbats, and pictographs from text strings.
 */
export const stripEmojis = (text: string): string => {
  if (!text || typeof text !== "string") return "";

  return text
    // Remove all unicode emoji blocks, pictographs, dingbats, transport symbols, etc.
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FC}\u{25FB}\u{2B1B}\u{2B1C}\u{1F1E6}-\u{1F1FF}\u{200D}\u{FE00}-\u{FE0F}]/gu,
      ""
    )
    // Clean up any stray leading bullets, punctuation, or multiple spaces created by stripping
    .replace(/^[\s•\-_:!]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

export interface GlobalAlertButton {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

export interface GlobalAlertConfig {
  title: string;
  message?: string;
  buttons?: GlobalAlertButton[];
  cancelable?: boolean;
  onDismiss?: () => void;
}

type AlertListener = (config: GlobalAlertConfig | null) => void;

let activeListener: AlertListener | null = null;
let queuedConfig: GlobalAlertConfig | null = null;

export const globalAlert = {
  /**
   * Show a modern, icon-free, emoji-free alert box
   */
  show(config: GlobalAlertConfig) {
    const sanitizedConfig: GlobalAlertConfig = {
      title: stripEmojis(config.title || ""),
      message: config.message ? stripEmojis(config.message) : undefined,
      cancelable: config.cancelable ?? true,
      onDismiss: config.onDismiss,
      buttons:
        config.buttons && config.buttons.length > 0
          ? config.buttons.map((b) => ({
              ...b,
              text: stripEmojis(b.text || "OK") || "OK",
            }))
          : [{ text: "OK", style: "default" }],
    };

    if (activeListener) {
      activeListener(sanitizedConfig);
    } else {
      queuedConfig = sanitizedConfig;
    }
  },

  /**
   * Helper for confirmation dialogs with Cancel and Action buttons
   */
  confirm(options: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) {
    this.show({
      title: options.title,
      message: options.message,
      buttons: [
        {
          text: options.cancelText || "Cancel",
          style: "cancel",
          onPress: options.onCancel,
        },
        {
          text: options.confirmText || "Confirm",
          style: options.destructive ? "destructive" : "default",
          onPress: options.onConfirm,
        },
      ],
    });
  },

  /**
   * Hide the currently visible global alert
   */
  hide() {
    if (activeListener) {
      activeListener(null);
    }
    queuedConfig = null;
  },

  /**
   * Internal subscribe method used by the GlobalAlert component
   */
  subscribe(listener: AlertListener) {
    activeListener = listener;
    if (queuedConfig) {
      listener(queuedConfig);
      queuedConfig = null;
    }
    return () => {
      if (activeListener === listener) {
        activeListener = null;
      }
    };
  },
};

/**
 * Intercepts React Native's native Alert.alert:
 * - On Android: Displays our custom global alert and confirmation box (no emojis, no icons).
 * - On iOS: Cleans title, message, and button texts of all emojis and symbols before invoking native alert.
 */
let isPatched = false;

export const setupGlobalAlertInterceptor = () => {
  if (isPatched) return;
  isPatched = true;

  const originalAlert = Alert.alert;

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ) => {
    const cleanTitle = stripEmojis(title || "");
    const cleanMessage = message ? stripEmojis(message) : undefined;
    const cleanButtons = buttons?.map((btn) => ({
      ...btn,
      text: stripEmojis(btn.text || "OK") || "OK",
    }));

    if (Platform.OS === "android") {
      // Use custom Global Alert on Android
      globalAlert.show({
        title: cleanTitle,
        message: cleanMessage,
        buttons: cleanButtons as GlobalAlertButton[],
        cancelable: options?.cancelable ?? true,
        onDismiss: options?.onDismiss,
      });
    } else {
      // On iOS, invoke native Alert with sanitized, emoji-free & icon-free strings
      originalAlert(cleanTitle, cleanMessage, cleanButtons, options);
    }
  };
};

// Auto-initialize interceptor on module load
setupGlobalAlertInterceptor();

export default function () {
  return null;
}

