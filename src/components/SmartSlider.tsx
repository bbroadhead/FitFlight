import React, { useMemo, useRef } from "react";
import { Platform } from "react-native";
import Slider, { SliderProps } from "@react-native-community/slider";

type Props = SliderProps & {
  /** Optional web-only inline style for the <input> element */
  webStyle?: React.CSSProperties;
};

export default function SmartSlider(props: Props) {
  // Native (iOS/Android): use the real RN slider
  if (Platform.OS !== "web") {
    return <Slider {...props} />;
  }

  // Web: use a native HTML range input to avoid findDOMNode crashes on React 19
  const {
    value = 0,
    minimumValue = 0,
    maximumValue = 1,
    step,
    disabled,
    onValueChange,
    onSlidingStart,
    onSlidingComplete,
    webStyle,
  } = props;

  const numericValue = typeof value === "number" ? value : Number(value) || 0;

  // Track latest value so pointer-up can report the final value
  const latest = useRef<number>(numericValue);
  latest.current = numericValue;

  const min = useMemo(() => (typeof minimumValue === "number" ? minimumValue : Number(minimumValue) || 0), [minimumValue]);
  const max = useMemo(() => (typeof maximumValue === "number" ? maximumValue : Number(maximumValue) || 0), [maximumValue]);
  const stepNum = step ?? 1;

  return (
    <input
      type="range"
      value={numericValue}
      min={min}
      max={max}
      step={stepNum}
      disabled={disabled}
      // Critical: prevent the tab-view swipe handler from also capturing the gesture on web.
      onPointerDown={(e) => {
        e.stopPropagation();
        onSlidingStart?.(latest.current);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onSlidingComplete?.(latest.current);
      }}
      onChange={(e) => {
        const next = Number((e.target as HTMLInputElement).value);
        latest.current = next;
        onValueChange?.(next);
      }}
      style={{ width: "100%", touchAction: "pan-y", ...webStyle }}
    />
  );
}
