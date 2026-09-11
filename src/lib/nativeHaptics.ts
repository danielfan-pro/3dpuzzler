import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const HAPTICS_STORAGE_KEY = "haptics_enabled";

export type HapticStyle = "selection" | "placement" | "invalid" | "completion";

export function getHapticsEnabled() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(HAPTICS_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HAPTICS_STORAGE_KEY, String(enabled));
  } catch {
    // A blocked storage write should not interrupt play.
  }
}

export async function triggerHaptic(style: HapticStyle) {
  if (!getHapticsEnabled() || !Capacitor.isNativePlatform()) return;
  try {
    if (style === "selection") await Haptics.impact({ style: ImpactStyle.Light });
    else if (style === "placement") await Haptics.impact({ style: ImpactStyle.Medium });
    else if (style === "invalid") await Haptics.notification({ type: NotificationType.Warning });
    else await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Haptics are an enhancement; unsupported hardware must never interrupt play.
  }
}
