import { Platform } from 'react-native';
import type { ExperimentalBlurMethod } from 'expo-blur';

/**
 * expo-blur's Android blur defaults to 'none' (its own documented default): a flat, semi-transparent
 * tint with no actual blur of what's behind it. iOS always uses a real native blur (UIVisualEffectView)
 * regardless of this setting, so every "glass" surface built with BlurView looked correctly blurred on
 * iOS but noticeably flatter/more see-through on Android. Pass this to every such BlurView's
 * `experimentalBlurMethod` prop so Android renders a real blur too, matching the iOS look.
 *
 * Marked "experimental" by expo-blur itself (may cost more to render); iOS is untouched either way,
 * since the prop only has an effect on Android.
 */
export const ANDROID_BLUR_METHOD: ExperimentalBlurMethod | undefined =
    Platform.OS === 'android' ? 'dimezisBlurView' : undefined;
