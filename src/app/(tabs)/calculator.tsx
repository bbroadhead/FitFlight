import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import SmartSlider from "@/components/SmartSlider";
import { scoreTotal, type Gender } from "@/lib/pfraScoring2026";
import { useTabSwipe } from "@/contexts/TabSwipeContext";

type StrengthTest = "pushups" | "hand_release_pushups";
type CoreTest = "situps" | "cross_leg_reverse_crunch" | "plank";
type CardioTest = "run_2mile" | "hamr_20m" | "walk_2k";

function getScoreTier(score: number) {
  if (score >= 90) return { label: "Excellent", color: "#22c55e" };
  if (score >= 75) return { label: "Satisfactory", color: "#3b82f6" };
  return { label: "Fail", color: "#ef4444" };
}

type SegmentedOption<T extends string> = {
  label: string;
  value: T;
};

function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
}) {
  return (
    <View
      style={{
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text
        style={{
          color: "rgba(255,255,255,0.92)",
          fontWeight: "800",
          marginBottom: 10,
          fontSize: 16,
        }}
      >
        {label}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={{
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: selected
                  ? "rgba(74,144,217,0.25)"
                  : "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Text
                style={{
                  color: selected ? "#ffffff" : "rgba(255,255,255,0.68)",
                  fontWeight: "700",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SliderCard({
  label,
  value,
  minimumValue,
  maximumValue,
  step,
  onValueChange,
  onSlidingStart,
  onSlidingComplete,
  displayValue,
}: {
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange: (value: number) => void;
  onSlidingStart: () => void;
  onSlidingComplete: () => void;
  displayValue?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            color: "rgba(255,255,255,0.92)",
            fontWeight: "800",
            fontSize: 16,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: "#ffffff",
            fontWeight: "800",
            fontSize: 16,
          }}
        >
          {displayValue ?? value}
        </Text>
      </View>

      <SmartSlider
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        onValueChange={(next) => onValueChange(Number(next))}
        onSlidingStart={onSlidingStart}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor="#1e90ff"
        maximumTrackTintColor="rgba(255,255,255,0.18)"
        thumbTintColor="#1e90ff"
      />
    </View>
  );
}

export default function CalculatorScreen() {
  const { setSwipeEnabled } = useTabSwipe();

  const [gender, setGender] = useState<Gender>("male");
  const [ageYears, setAgeYears] = useState<number>(34);

  const [heightIn, setHeightIn] = useState<number>(70);
  const [waistIn, setWaistIn] = useState<number>(34);

  const [strengthTest, setStrengthTest] =
    useState<StrengthTest>("pushups");
  const [strengthReps, setStrengthReps] = useState<number>(40);

  const [coreTest, setCoreTest] = useState<CoreTest>("plank");
  const [coreValue, setCoreValue] = useState<number>(120);

  const [cardioTest, setCardioTest] = useState<CardioTest>("hamr_20m");
  const [cardioValue, setCardioValue] = useState<number>(40);

  const scores = useMemo(() => {
    return scoreTotal({
      ageYears,
      gender,
      waistIn,
      heightIn,
      strengthTest,
      strengthReps,
      coreTest,
      coreValue,
      cardioTest,
      cardioValue,
    });
  }, [
    ageYears,
    gender,
    waistIn,
    heightIn,
    strengthTest,
    strengthReps,
    coreTest,
    coreValue,
    cardioTest,
    cardioValue,
  ]);

  const totalScore = scores.total;
  const tier = getScoreTier(totalScore);

  const onSlideStart = () => setSwipeEnabled(false);
  const onSlideEnd = () => setSwipeEnabled(true);

  const cardioLabel =
    cardioTest === "run_2mile"
      ? "2-Mile Run (sec)"
      : cardioTest === "hamr_20m"
      ? "HAMR Shuttles"
      : "2km Walk (sec)";

  const cardioMin =
    cardioTest === "run_2mile"
      ? 600
      : cardioTest === "hamr_20m"
      ? 0
      : 700;

  const cardioMax =
    cardioTest === "run_2mile"
      ? 1800
      : cardioTest === "hamr_20m"
      ? 120
      : 1400;

  const cardioStep =
    cardioTest === "hamr_20m" ? 1 : 1;

  const coreLabel =
    coreTest === "plank"
      ? "Plank (sec)"
      : coreTest === "situps"
      ? "Sit-ups"
      : "Cross-Leg Reverse Crunch";

  const coreMin = 0;
  const coreMax = coreTest === "plank" ? 300 : 100;
  const coreStep = 1;

  return (
    <LinearGradient colors={["#071226", "#0B1E3A"]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 90 }}
          stickyHeaderIndices={[1]}
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 6,
              paddingBottom: 10,
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 22,
                fontWeight: "800",
              }}
            >
              PFRA Calculator
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: 20,
              paddingBottom: 10,
              backgroundColor: "#0B1E3A",
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: "100%",
                maxWidth: 520,
                backgroundColor: "rgba(15, 28, 50, 0.92)",
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                paddingVertical: 14,
                paddingHorizontal: 14,
              }}
            >
              <View style={{ alignItems: "center" }}>
                <View
                  style={{
                    width: 128,
                    height: 128,
                    borderRadius: 64,
                    borderWidth: 6,
                    borderColor: tier.color,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 44,
                      fontWeight: "900",
                      color: tier.color,
                    }}
                  >
                    {totalScore.toFixed(1).replace(/\.0$/, "")}
                  </Text>
                </View>

                <View
                  style={{
                    marginTop: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <Text style={{ color: tier.color, fontWeight: "800" }}>
                    {tier.label}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 12,
                    marginTop: 12,
                  }}
                >
                  <Text style={{ color: "rgba(255,255,255,0.75)" }}>
                    Waist: {scores.waist.toFixed(1)}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)" }}>
                    Strength: {scores.strength.toFixed(1)}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)" }}>
                    Core: {scores.core.toFixed(1)}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)" }}>
                    Cardio: {scores.cardio.toFixed(1)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, gap: 14 }}>
            <SegmentedControl
              label="Gender"
              value={gender}
              onChange={setGender}
              options={[
                { label: "Male", value: "male" },
                { label: "Female", value: "female" },
              ]}
            />

            <SliderCard
              label="Age"
              value={ageYears}
              minimumValue={17}
              maximumValue={80}
              step={1}
              onValueChange={setAgeYears}
              onSlidingStart={onSlideStart}
              onSlidingComplete={onSlideEnd}
            />

            <SliderCard
              label="Height (in)"
              value={heightIn}
              minimumValue={56}
              maximumValue={84}
              step={1}
              onValueChange={setHeightIn}
              onSlidingStart={onSlideStart}
              onSlidingComplete={onSlideEnd}
            />

            <SliderCard
              label="Waist (in)"
              value={waistIn}
              minimumValue={20}
              maximumValue={60}
              step={0.5}
              onValueChange={setWaistIn}
              onSlidingStart={onSlideStart}
              onSlidingComplete={onSlideEnd}
              displayValue={waistIn.toFixed(1)}
            />

            <SegmentedControl
              label="Strength Test"
              value={strengthTest}
              onChange={setStrengthTest}
              options={[
                { label: "Push-ups", value: "pushups" },
                { label: "HR Push-ups", value: "hand_release_pushups" },
              ]}
            />

            <SliderCard
              label="Strength Reps"
              value={strengthReps}
              minimumValue={0}
              maximumValue={100}
              step={1}
              onValueChange={setStrengthReps}
              onSlidingStart={onSlideStart}
              onSlidingComplete={onSlideEnd}
            />

            <SegmentedControl
              label="Core Test"
              value={coreTest}
              onChange={setCoreTest}
              options={[
                { label: "Sit-ups", value: "situps" },
                { label: "CLRC", value: "cross_leg_reverse_crunch" },
                { label: "Plank", value: "plank" },
              ]}
            />

            <SliderCard
              label={coreLabel}
              value={coreValue}
              minimumValue={coreMin}
              maximumValue={coreMax}
              step={coreStep}
              onValueChange={setCoreValue}
              onSlidingStart={onSlideStart}
              onSlidingComplete={onSlideEnd}
            />

            <SegmentedControl
              label="Cardio Test"
              value={cardioTest}
              onChange={setCardioTest}
              options={[
                { label: "2-Mile Run", value: "run_2mile" },
                { label: "HAMR", value: "hamr_20m" },
                { label: "2km Walk", value: "walk_2k" },
              ]}
            />

            <SliderCard
              label={cardioLabel}
              value={cardioValue}
              minimumValue={cardioMin}
              maximumValue={cardioMax}
              step={cardioStep}
              onValueChange={setCardioValue}
              onSlidingStart={onSlideStart}
              onSlidingComplete={onSlideEnd}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
