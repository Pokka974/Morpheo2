import { useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const SHOW_THRESHOLD = 400;

/**
 * Tracks whether a scroll-to-top affordance should be shown, driven by the same
 * `onScroll` event a `ScrollView`/`FlatList`/`FlashList` already emits — no extra
 * ref or gesture wiring needed.
 */
export function useScrollToTopVisibility(threshold: number = SHOW_THRESHOLD) {
  const [isVisible, setIsVisible] = useState(false);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIsVisible(event.nativeEvent.contentOffset.y > threshold);
    },
    [threshold]
  );

  return { isVisible, onScroll };
}
