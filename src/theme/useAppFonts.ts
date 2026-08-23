import { useFonts } from 'expo-font';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
} from '@expo-google-fonts/fraunces';

/**
 * Loads the two families the design system depends on.
 *
 * Manrope carries the interface; Fraunces carries the dream — its title, its
 * narrative and the AI's voice. Only the weights the tokens actually reference are
 * loaded, since each is a separate file shipped in the bundle.
 *
 * Returns `[loaded, error]`. Callers must keep the splash screen up until `loaded`
 * is true: rendering before the faces resolve shows a system-font flash, and the
 * type scale is metric-tuned to Manrope.
 */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_400Regular_Italic,
  });

  return [loaded, error ?? null];
}
