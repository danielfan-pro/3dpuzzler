import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

async function runNativeHaptic(action: () => Promise<void>) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await action();
  } catch {
    // Haptics are an enhancement; unsupported hardware must never interrupt play.
  }
}

export const selectionHaptic = () => runNativeHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
export const placementHaptic = () => runNativeHaptic(() => Haptics.impact({ style: ImpactStyle.Medium }));
export const invalidPlacementHaptic = () => runNativeHaptic(() => Haptics.notification({ type: NotificationType.Warning }));
export const completionHaptic = () => runNativeHaptic(() => Haptics.notification({ type: NotificationType.Success }));
