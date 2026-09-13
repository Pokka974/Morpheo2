import { renderHook, act } from '@testing-library/react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useScrollToTopVisibility } from '@shared/hooks/useScrollToTopVisibility';

function scrollEvent(y: number): NativeSyntheticEvent<NativeScrollEvent> {
  return { nativeEvent: { contentOffset: { x: 0, y } } } as NativeSyntheticEvent<NativeScrollEvent>;
}

describe('useScrollToTopVisibility', () => {
  it('starts hidden', () => {
    const { result } = renderHook(() => useScrollToTopVisibility());
    expect(result.current.isVisible).toBe(false);
  });

  it('becomes visible once the scroll offset passes the default threshold', () => {
    const { result } = renderHook(() => useScrollToTopVisibility());
    act(() => result.current.onScroll(scrollEvent(500)));
    expect(result.current.isVisible).toBe(true);
  });

  it('stays hidden at or below the default threshold', () => {
    const { result } = renderHook(() => useScrollToTopVisibility());
    act(() => result.current.onScroll(scrollEvent(400)));
    expect(result.current.isVisible).toBe(false);
  });

  it('goes back to hidden once scrolled back up', () => {
    const { result } = renderHook(() => useScrollToTopVisibility());
    act(() => result.current.onScroll(scrollEvent(500)));
    expect(result.current.isVisible).toBe(true);
    act(() => result.current.onScroll(scrollEvent(0)));
    expect(result.current.isVisible).toBe(false);
  });

  it('honors a custom threshold', () => {
    const { result } = renderHook(() => useScrollToTopVisibility(100));
    act(() => result.current.onScroll(scrollEvent(150)));
    expect(result.current.isVisible).toBe(true);
  });
});
