import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

const THUMB = 22;
const TRACK_H = 6;

interface SliderProps {
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  color?: string;
  disabled?: boolean;
}

/** Draggable value slider — the RN equivalent of the web `<input type="range">`.
 *  Pure reanimated + gesture-handler, no native module (no rebuild needed). */
export function Slider({
  value, min = 0, max, step = 1, onChange, color = "#EBE05A", disabled = false,
}: SliderProps) {
  const [trackW, setTrackW] = useState(0);
  const pos = useSharedValue(0);
  const start = useSharedValue(0);
  const draggingRef = useRef(false);

  const span = Math.max(1, max - min);
  const maxX = Math.max(0, trackW - THUMB);

  // Keep the thumb in sync with the controlled value while not dragging.
  useEffect(() => {
    if (!draggingRef.current) {
      const clamped = Math.min(max, Math.max(min, value));
      pos.value = ((clamped - min) / span) * maxX;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, maxX, max, min, span]);

  const emit = (p: number) => {
    const ratio = maxX > 0 ? p / maxX : 0;
    let v = Math.round((min + ratio * span) / step) * step;
    v = Math.min(max, Math.max(min, v));
    onChange(v); // same value → React bails out, so safe to call each move
  };
  const setDragging = (d: boolean) => { draggingRef.current = d; };

  // value is intentionally NOT a dep — recreating the gesture mid-drag would drop it.
  const pan = useMemo(
    () => Gesture.Pan()
      .enabled(!disabled)
      .onBegin(() => { start.value = pos.value; runOnJS(setDragging)(true); })
      .onUpdate((e) => {
        const np = Math.min(maxX, Math.max(0, start.value + e.translationX));
        pos.value = np;
        runOnJS(emit)(np);
      })
      .onFinalize(() => { runOnJS(setDragging)(false); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxX, disabled, span, step, min, max],
  );

  const tap = useMemo(
    () => Gesture.Tap()
      .enabled(!disabled)
      .onEnd((e) => {
        const np = Math.min(maxX, Math.max(0, e.x - THUMB / 2));
        pos.value = np;
        runOnJS(emit)(np);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxX, disabled, span, step, min, max],
  );

  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: pos.value + THUMB / 2 }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        style={[styles.wrap, { opacity: disabled ? 0.4 : 1 }]}
        hitSlop={{ top: 12, bottom: 12 }}
      >
        <View style={styles.track} />
        <Animated.View style={[styles.fill, fillStyle, { backgroundColor: color }]} />
        <Animated.View style={[styles.thumb, thumbStyle, { backgroundColor: color }]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", height: THUMB, justifyContent: "center" },
  track: { height: TRACK_H, borderRadius: TRACK_H / 2, backgroundColor: "#2c2c2e", width: "100%" },
  fill: {
    position: "absolute",
    left: 0,
    top: (THUMB - TRACK_H) / 2,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
  },
  thumb: {
    position: "absolute",
    left: 0,
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
