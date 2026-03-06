import React, { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import SmartSlider from "@/components/SmartSlider";
import { scoreTotal, type Gender } from "@/lib/pfraScoring2026";
import { useTabSwipe } from "@/contexts/TabSwipeContext";

type AgeBracket = "under25" | "25to29" | "30to34" | "35to39" | "40to44" | "45to49" | "50to54" | "55to59" | "60plus";

function scoreTier(score: number) {
  if (score >= 90) return { label: "Excellent", color: "#22c55e" };
  if (score >= 75) return { label: "Satisfactory", color: "#3b82f6" };
  return { label: "Fail", color: "#ef4444" };
}

export default function CalculatorScreen() {
  const { setSwipeEnabled } = useTabSwipe();

  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState<number>(34);

  // Components (keep whatever defaults you used before)
  const [pushups, setPushups] = useState<number>(40);
  const [plankSeconds, setPlankSeconds] = useState<number>(120);
  const [hamrShuttles, setHamrShuttles] = useState<number>(40);

  const totalScore = useMemo(() => {
    return scoreTotal({
      gender,
      age,
      pushups,
      plankSeconds,
      hamrShuttles,
      // If your scorer supports exemptions/alt components, keep them in your existing file.
      // This UI file intentionally does not change scoring behavior.
    } as any);
  }, [gender, age, pushups, plankSeconds, hamrShuttles]);

  const tier = useMemo(() => scoreTier(Number(totalScore) || 0), [totalScore]);

  const onSlideStart = () => setSwipeEnabled(false);
  const onSlideEnd = () => setSwipeEnabled(true);

  return (
    <LinearGradient colors={["#071226", "#0B1E3A"]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 90 }}
          stickyHeaderIndices={[1]}
          showsVerticalScrollIndicator={false}
        >
          {/* Title (scrolls away) */}
          <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 }}>
            <Text style={{ color: "white", fontSize: 22, fontWeight: "800" }}>PFRA Calculator</Text>
          </View>

          {/* Sticky score card (opaque-ish, not full width) */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingBottom: 10,
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
                    overflow: "visible",
                  }}
                >
                  <Text style={{ fontSize: 44, fontWeight: "900", color: tier.color }}>
                    {Number(totalScore) || 0}
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
                  <Text style={{ color: tier.color, fontWeight: "800" }}>{tier.label}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Controls */}
          <View style={{ paddingHorizontal: 20, gap: 14 }}>
            {/* Gender */}
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "800", marginBottom: 8 }}>Gender</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Text
                  onPress={() => setGender("male")}
                  style={{
                    color: gender === "male" ? "white" : "rgba(255,255,255,0.65)",
                    fontWeight: "700",
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: gender === "male" ? "rgba(74,144,217,0.25)" : "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  Male
                </Text>
                <Text
                  onPress={() => setGender("female")}
                  style={{
                    color: gender === "female" ? "white" : "rgba(255,255,255,0.65)",
                    fontWeight: "700",
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: gender === "female" ? "rgba(74,144,217,0.25)" : "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  Female
                </Text>
              </View>
            </View>

            {/* Age */}
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <SmartSlider
                label="Age"
                value={age}
                min={17}
                max={80}
                step={1}
                onChange={setAge}
                onSlidingStart={onSlideStart}
                onSlidingComplete={onSlideEnd}
              />
            </View>

            {/* Push-ups */}
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <SmartSlider
                label="Push-ups"
                value={pushups}
                min={0}
                max={80}
                step={1}
                onChange={setPushups}
                onSlidingStart={onSlideStart}
                onSlidingComplete={onSlideEnd}
              />
            </View>

            {/* Plank */}
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <SmartSlider
                label="Plank (seconds)"
                value={plankSeconds}
                min={0}
                max={240}
                step={1}
                onChange={setPlankSeconds}
                onSlidingStart={onSlideStart}
                onSlidingComplete={onSlideEnd}
              />
            </View>

            {/* HAMR */}
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <SmartSlider
                label="HAMR (shuttles)"
                value={hamrShuttles}
                min={0}
                max={100}
                step={1}
                onChange={setHamrShuttles}
                onSlidingStart={onSlideStart}
                onSlidingComplete={onSlideEnd}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
