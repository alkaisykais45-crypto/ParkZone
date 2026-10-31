import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ParkingSpace, TopologyType, resolveParkedCarColor } from "../app/services/parking";
import { VoiceGuidance } from "../app/services/voiceGuidance";
import { useTheme } from "../hooks/useTheme";
import {
  COLOR_MAP,
  HorizontalUltraRealisticCar,
  VerticalUltraRealisticCar,
} from "./UltraRealisticCar";

interface Props {
  topology: TopologyType;
  spaces: ParkingSpace[];
  selectedSpaceId: string | null;
  onSelectSpace: (space: ParkingSpace) => void;
  currentZone: string;
  onTopologyChange?: (topo: TopologyType) => void;
  onDirectToSlot?: (space: ParkingSpace) => void;
  locationName?: string;
  /** "charging" renders EV charging lot semantics (green, plug badges, charging cars) */
  lotKind?: "parking" | "charging";
  /** Hide the built-in selection card (when the parent renders its own details sheet) */
  hideSelectionCard?: boolean;
  /** Compact height for embedding inside bottom sheets */
  compact?: boolean;
}

/**
 * Procedural 3D Aerial Vehicle Component
 */
export const ProceduralAerialCar = ({
  color = "#18181B",
  isEV = false,
  rotationDeg = 0,
  headlightsOn = false,
  scale = 1,
}: {
  color?: string;
  isEV?: boolean;
  rotationDeg?: number;
  headlightsOn?: boolean;
  scale?: number;
}) => {
  return (
    <View
      style={[
        styles.carWrapper,
        {
          transform: [{ rotate: `${rotationDeg}deg` }, { scale }],
        },
      ]}
    >
      <View style={styles.carShadow} />

      {headlightsOn && (
        <View style={styles.lightBeamsWrapper}>
          <View style={styles.lightBeam} />
          <View style={styles.lightBeam} />
        </View>
      )}

      <View style={[styles.carChassis, { backgroundColor: color }]}>
        <View style={styles.headlightsRow}>
          <View style={[styles.headlight, headlightsOn && styles.headlightGlow]} />
          <View style={[styles.headlight, headlightsOn && styles.headlightGlow]} />
        </View>

        <View style={styles.glassCanopy}>
          <View style={styles.windshield} />
          {isEV ? (
            <View style={styles.evRoofSolarBadge}>
              <Text style={styles.evBadgeGlyph}>EV</Text>
            </View>
          ) : (
            <View style={styles.sunroof} />
          )}
          <View style={styles.rearGlass} />
        </View>

        <View style={styles.taillightsRow}>
          <View style={styles.taillight} />
          <View style={styles.taillight} />
        </View>
      </View>
    </View>
  );
};

export const AerialParkingLot3D: React.FC<Props> = ({
  topology = "perpendicular",
  spaces,
  selectedSpaceId,
  onSelectSpace,
  currentZone,
  onDirectToSlot,
  locationName = "Parking Facility",
  lotKind = "parking",
  hideSelectionCard = false,
  compact = false,
}) => {
  const theme = useTheme();
  // Layout is strictly defined by the system administrator for this lot
  const activeTopology = topology || "perpendicular";
  const [animatingCar, setAnimatingCar] = useState(false);

  const carAisleProgress = useRef(new Animated.Value(0)).current;
  const carTurnRotation = useRef(new Animated.Value(0)).current;
  const carStallProgress = useRef(new Animated.Value(0)).current;
  const carOpacity = useRef(new Animated.Value(0)).current;

  const triggerDriveCarToSlot = useCallback(
    (targetSpace: ParkingSpace) => {
      if (targetSpace.is_occupied) return;

      setAnimatingCar(true);

      VoiceGuidance.announceSlotSelected(targetSpace.space_number, locationName, {
        isOccupied: false,
        wattPower: targetSpace.watt_power_kw,
        price: targetSpace.price_per_hour_rwf || 0,
      });

      carAisleProgress.setValue(0);
      carTurnRotation.setValue(0);
      carStallProgress.setValue(0);
      carOpacity.setValue(1);

      const isRight = spaces.findIndex((s) => s.id === targetSpace.id) % 2 === 1;
      let targetRot = isRight ? 90 : -90;
      const targetSpaceLayout = targetSpace.topology || activeTopology;
      if (targetSpaceLayout === "oblique") {
        targetRot = isRight ? 45 : -45;
      } else if (targetSpaceLayout === "parallel") {
        targetRot = 0;
      }

      Animated.sequence([
        Animated.timing(carAisleProgress, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(carTurnRotation, {
          toValue: targetRot,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(carStallProgress, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(() => {
          setAnimatingCar(false);
          onSelectSpace(targetSpace);
        }, 400);
      });
    },
    [activeTopology, locationName, onSelectSpace, spaces]
  );

  const stallAngle = useMemo(() => {
    switch (activeTopology) {
      case "oblique":
        return -45;
      case "parallel":
        return 90;
      case "wide":
        return 0;
      case "perpendicular":
      default:
        return 0;
    }
  }, [activeTopology]);

  const leftBank = useMemo(() => spaces.filter((_, idx) => idx % 2 === 0), [spaces]);
  const rightBank = useMemo(() => spaces.filter((_, idx) => idx % 2 === 1), [spaces]);

  const selectedSpace = useMemo(
    () => spaces.find((s) => s.id === selectedSpaceId) || null,
    [spaces, selectedSpaceId]
  );

  const renderStall = (space: ParkingSpace, isRightBank: boolean, index: number) => {
    const isSelected = selectedSpaceId === space.id;
    const isVacant = !space.is_occupied;
    const isEvStall = space.space_type === "ev" || lotKind === "charging";

    // Each parking space has its own layout (space.topology), falling back to lot layout
    const spaceLayout: TopologyType = space.topology || activeTopology || "perpendicular";

    let spaceAngle = 0;
    let spaceTransform: any = undefined;

    if (spaceLayout === "oblique") {
      spaceAngle = isRightBank ? 36 : -36;
      spaceTransform = [{ skewX: isRightBank ? "12deg" : "-12deg" }];
    } else if (spaceLayout === "parallel") {
      spaceAngle = 0;
    } else if (spaceLayout === "wide") {
      spaceAngle = 0;
    } else {
      spaceAngle = 0;
    }

    const carVariant =
      space.car_color ||
      resolveParkedCarColor(`${space.location_id}-${space.zone_code}-${space.space_number}`);

    return (
      <TouchableOpacity
        key={space.id}
        activeOpacity={0.8}
        onPress={() => {
          onSelectSpace(space);
          if (isVacant) {
            VoiceGuidance.announceSlotSelected(space.space_number, locationName, {
              isOccupied: false,
              wattPower: space.watt_power_kw,
              price: isEvStall ? 0 : space.price_per_hour_rwf || 0,
            });
          } else {
            VoiceGuidance.speak(
              `Slot ${space.space_number} is currently ${isEvStall ? "charging" : "occupied"}${
                space.current_vehicle_plate ? ` by vehicle ${space.current_vehicle_plate}` : ""
              }.`
            );
          }
        }}
        style={[
          styles.stallBox,
          compact && { width: 90, height: 120, padding: 6 },
          spaceLayout === "oblique" && (spaceTransform ? { transform: spaceTransform } : styles.stallOblique),
          spaceLayout === "parallel" && styles.stallParallel,
          spaceLayout === "wide" && styles.stallWide,
          {
            backgroundColor: isSelected
              ? (isEvStall ? theme.evGreenSoft : theme.accentSoft)
              : isVacant
                ? theme.surface
                : (isEvStall ? "rgba(16, 185, 129, 0.08)" : theme.dangerSoft),
            borderColor: isSelected
              ? (isEvStall ? theme.evGreen : theme.accent)
              : isVacant
                ? (isEvStall ? theme.evGreenBorder : theme.borderStrong)
                : (isEvStall ? theme.evGreen : theme.danger),
            borderWidth: isSelected ? 2.5 : 1.5,
          },
        ]}
      >
        {/* Stall Header */}
        <View style={styles.stallHeader}>
          <Text
            style={[
              styles.stallNumber,
              {
                color: isVacant ? theme.text : isEvStall ? theme.evGreen : theme.danger,
              },
            ]}
          >
            {space.space_number}
          </Text>

          <View style={styles.headerRightTags}>
            {isEvStall && (
              <View style={[styles.evBadgeSmall, { backgroundColor: theme.evGreen }]}>
                <Ionicons name="flash" size={8} color={theme.evGreenText} style={{ marginRight: 2 }} />
                <Text style={[styles.evBadgeSmallText, { color: theme.evGreenText }]}>EV</Text>
              </View>
            )}
            {space.space_type === "handicap" && !isEvStall && (
              <View style={[styles.hBadgeSmall, { backgroundColor: theme.pillInactiveBg }]}>
                <Text style={[styles.hBadgeSmallText, { color: theme.text }]}>HC</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stall Center — Displays authentic realistic car when occupied */}
        <View style={styles.stallCenterContent}>
          {space.is_occupied ? (
            <View style={styles.occupiedCarContainer}>
              {spaceLayout === "parallel" ? (
                <View style={{ alignItems: "center", justifyContent: "center" }}>
                  <HorizontalUltraRealisticCar
                    color={carVariant}
                    width={compact ? 70 : 86}
                    height={compact ? 36 : 44}
                  />
                </View>
              ) : (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    transform: [
                      { rotate: `${spaceAngle}deg` },
                      { scale: compact ? 0.72 : spaceLayout === "wide" ? 0.95 : 0.88 },
                    ],
                  }}
                >
                  <VerticalUltraRealisticCar
                    color={carVariant}
                    width={compact ? 40 : 46}
                    height={compact ? 74 : 88}
                  />
                </View>
              )}
              <View style={[styles.occupiedRibbon, { backgroundColor: isEvStall ? theme.evGreenSoft : theme.dangerSoft }]}>
                <View style={[styles.redDotLive, { backgroundColor: isEvStall ? theme.evGreen : theme.danger }]} />
                <Text style={[styles.occupiedRibbonText, { color: isEvStall ? theme.evGreen : theme.danger }]}>
                  {isEvStall ? "CHARGING" : "OCCUPIED"}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.vacantTarget}>
              <View
                style={[
                  styles.vacantReticle,
                  {
                    borderColor: isSelected
                      ? (isEvStall ? theme.evGreen : theme.accent)
                      : isEvStall
                        ? theme.evGreenBorder
                        : theme.textSecondary,
                  },
                ]}
              >
                <View style={[styles.pulseDot, { backgroundColor: isEvStall ? theme.evGreen : theme.accent }]} />
              </View>
              <Text style={[styles.vacantLabel, { color: isEvStall ? theme.evGreen : theme.text }]}>
                {isEvStall ? "READY" : "AVAILABLE"}
              </Text>

              {isEvStall && space.watt_power_kw ? (
                <View
                  style={[
                    styles.wattBadge,
                    {
                      backgroundColor: theme.evGreenSoft,
                      borderColor: theme.evGreenBorder,
                    },
                  ]}
                >
                  <Text style={[styles.wattBadgeText, { color: theme.evGreen }]}>
                    {space.watt_power_kw} kW
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Stall Footer */}
        <View style={styles.stallFooter}>
          {space.is_occupied ? (
            <Text style={[styles.platePlate, { color: isEvStall ? theme.evGreen : theme.textSecondary }]} numberOfLines={1}>
              {space.current_vehicle_plate || (isEvStall ? "CHARGING" : "OCCUPIED")}
            </Text>
          ) : (
            <View style={styles.priceRow}>
              <Text style={[styles.priceTag, { color: isEvStall ? theme.evGreen : theme.textSecondary }]}>
                {isEvStall
                  ? "9k–10k RWF"
                  : space.price_per_hour_rwf
                    ? `${space.price_per_hour_rwf} RWF/h`
                    : "Vacant"}
              </Text>
            </View>
          )}
        </View>

        {spaceLayout === "wide" && (
          <View style={[styles.wideLoadingStripe, { backgroundColor: theme.borderStrong }]} />
        )}
      </TouchableOpacity>
    );
  };

  if (spaces.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View
          style={[
            styles.asphaltGround,
            { backgroundColor: theme.background, paddingVertical: 32, alignItems: "center" },
          ]}
        >
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "500", marginBottom: 6 }}>
            NO BAYS CONFIGURED IN THIS ZONE
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 11,
              textAlign: "center",
              paddingHorizontal: 20,
              lineHeight: 16,
            }}
          >
            No parking spaces have been added to {currentZone} yet.
          </Text>
        </View>
      </View>
    );
  }

  const animatedCarTranslateX = carAisleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 180],
  });

  const animatedCarTranslateY = carStallProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -45],
  });

  const animatedCarRotation = carTurnRotation.interpolate({
    inputRange: [-90, 0, 90],
    outputRange: ["-90deg", "0deg", "90deg"],
  });

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[styles.asphaltGround, { backgroundColor: theme.background }]}>
        {/* Admin-Configured Facility Architectural Layout Badge */}
        <View style={styles.lotMetaBar}>
          <View
            style={[
              styles.adminLayoutBadge,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.adminLayoutLeft}>
              <Ionicons
                name="shield-checkmark"
                size={13}
                color={lotKind === "charging" ? theme.evGreen : theme.text}
              />
              <Text style={[styles.adminLayoutText, { color: theme.textSecondary }]}>
                Official Layout:{" "}
                <Text style={{ color: theme.text, fontWeight: "600" }}>
                  {activeTopology === "oblique"
                    ? "45° Diagonal Oblique"
                    : activeTopology === "parallel"
                      ? "0° Parallel Curb"
                      : activeTopology === "wide"
                        ? "Wide Pod Bays"
                        : "90° Perpendicular Mall"}
                </Text>
              </Text>
            </View>

            <View
              style={[
                styles.adminBadgeTag,
                {
                  backgroundColor:
                    lotKind === "charging"
                      ? theme.evGreenSoft
                      : theme.isDark
                        ? "#27272A"
                        : "#F4F4F5",
                  borderColor:
                    lotKind === "charging" ? theme.evGreenBorder : theme.border,
                },
              ]}
            >
              <Ionicons
                name="lock-closed"
                size={9}
                color={lotKind === "charging" ? theme.evGreen : theme.textSecondary}
              />
              <Text
                style={[
                  styles.adminBadgeTagText,
                  { color: lotKind === "charging" ? theme.evGreen : theme.textSecondary },
                ]}
              >
                ADMIN CONFIGURED
              </Text>
            </View>
          </View>
        </View>

        {/* Sub-bar: Realtime Zone & Slot Counter */}
        <View style={styles.zoneStatusBar}>
          <View style={styles.zoneStatusLeft}>
            <View style={[styles.liveIndicatorPulse, { backgroundColor: theme.accent }]} />
            <Text style={[styles.zoneActiveText, { color: theme.text }]}>{currentZone}</Text>
            <Text style={[styles.zoneOccupancyCount, { color: theme.textSecondary }]}>
              • {spaces.filter((s) => !s.is_occupied).length} of {spaces.length} Available
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              const vacant = spaces.find((s) => !s.is_occupied);
              if (vacant) {
                triggerDriveCarToSlot(vacant);
              } else {
                VoiceGuidance.speak("All spaces in this zone are currently occupied.");
              }
            }}
            style={[
              styles.voiceAssistantPill,
              { backgroundColor: theme.surface, borderColor: theme.borderStrong },
            ]}
          >
            <Ionicons name="volume-medium" size={13} color={theme.text} />
            <Text style={[styles.voiceAssistantPillText, { color: theme.text }]}>
              Direct to Best Spot
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.aisleContainer}>
            <View style={styles.bankRow}>
              {leftBank.map((s, idx) => renderStall(s, false, idx))}
            </View>

            {/* Central Driving Aisle */}
            <View
              style={[
                styles.drivingAisle,
                {
                  backgroundColor: theme.surfaceMuted,
                  borderColor: theme.borderStrong,
                },
              ]}
            >
              <View style={[styles.aisleDashedLine, { backgroundColor: theme.borderStrong }]} />
              <View style={styles.drivingAisleCenter}>
                <Ionicons name="arrow-forward" size={12} color={theme.textSecondary} />
                <Text style={[styles.aisleDirectionIndicator, { color: theme.textSecondary }]}>
                  DRIVING AISLE • ONE WAY
                </Text>
                <Ionicons name="arrow-forward" size={12} color={theme.textSecondary} />
              </View>
              <View style={[styles.aisleDashedLine, { backgroundColor: theme.borderStrong }]} />

              {animatingCar && (
                <Animated.View
                  style={[
                    styles.animatingCarGhost,
                    {
                      opacity: carOpacity,
                      transform: [
                        { translateX: animatedCarTranslateX },
                        { translateY: animatedCarTranslateY },
                        { rotate: animatedCarRotation },
                      ],
                    },
                  ]}
                >
                  <VerticalUltraRealisticCar
                    color="emerald"
                    width={44}
                    height={84}
                  />
                </Animated.View>
              )}
            </View>

            <View style={styles.bankRow}>
              {rightBank.map((s, idx) => renderStall(s, true, idx))}
            </View>
          </View>
        </ScrollView>

        {/* Hick's Law Slot Selection Card */}
        {selectedSpace && !hideSelectionCard && (
          <View
            style={[
              styles.hickSelectionCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.hickCardHeader}>
              <View style={styles.hickCardHeaderLeft}>
                <Text style={[styles.hickSlotTitle, { color: theme.text }]}>
                  Bay {selectedSpace.space_number}
                  {selectedSpace.zone_code ? ` (${selectedSpace.zone_code})` : ""}
                </Text>
                <View style={styles.hickStatusRow}>
                  <View
                    style={[
                      styles.statusDotSmall,
                      {
                        backgroundColor: selectedSpace.is_occupied
                          ? theme.danger
                          : theme.accent,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.hickStatusText,
                      {
                        color: selectedSpace.is_occupied
                          ? theme.danger
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    {selectedSpace.is_occupied ? "Occupied by Vehicle" : "Ready for Parking"}
                  </Text>
                </View>
              </View>

              <View style={styles.hickPriceBox}>
                <Text style={[styles.hickPriceMain, { color: selectedSpace.space_type === "ev" ? theme.evGreen : theme.text }]}>
                  {selectedSpace.space_type === "ev"
                    ? "EV Hub"
                    : selectedSpace.price_per_hour_rwf
                      ? `${selectedSpace.price_per_hour_rwf} RWF`
                      : "Live Tariff"}
                </Text>
                <Text style={[styles.hickPriceSub, { color: selectedSpace.space_type === "ev" ? theme.evGreen : theme.textSecondary }]}>
                  {selectedSpace.space_type === "ev"
                    ? "charging (0 RWF park)"
                    : "parking / hour"}
                </Text>
              </View>
            </View>

            <View style={styles.hickSpecsGrid}>
              <View
                style={[
                  styles.hickSpecPill,
                  { backgroundColor: theme.background, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.hickSpecLabel, { color: theme.textSecondary }]}>Type</Text>
                <Text style={[styles.hickSpecValue, { color: selectedSpace.space_type === "ev" ? theme.evGreen : theme.text }]}>
                  {selectedSpace.space_type === "ev"
                    ? "EV Fast Charger"
                    : selectedSpace.space_type === "handicap"
                      ? "Accessible Bay"
                      : "Standard Bay"}
                </Text>
              </View>

              {selectedSpace.watt_power_kw ? (
                <View
                  style={[
                    styles.hickSpecPill,
                    { backgroundColor: theme.evGreenSoft, borderColor: theme.evGreenBorder },
                  ]}
                >
                  <Text style={[styles.hickSpecLabel, { color: theme.textSecondary }]}>
                    Watt Power
                  </Text>
                  <Text style={[styles.hickSpecValue, { color: theme.evGreen }]}>
                    {selectedSpace.watt_power_kw} kW Ultra-Fast
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.hickSpecPill,
                  { backgroundColor: theme.background, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.hickSpecLabel, { color: theme.textSecondary }]}>Layout</Text>
                <Text style={[styles.hickSpecValue, { color: theme.text }]}>
                  {activeTopology.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.hickActionRow}>
              {!selectedSpace.is_occupied ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    triggerDriveCarToSlot(selectedSpace);
                    onDirectToSlot?.(selectedSpace);
                  }}
                  style={[styles.hickDirectBtn, { backgroundColor: theme.primaryBtnBg }]}
                >
                  <Ionicons name="navigate" size={16} color={theme.primaryBtnText} />
                  <Text style={[styles.hickDirectBtnText, { color: theme.primaryBtnText }]}>
                    Animate Car to Bay {selectedSpace.space_number}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.hickOccupiedNotice,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={theme.textSecondary}
                  />
                  <Text style={[styles.hickOccupiedNoticeText, { color: theme.textSecondary }]}>
                    {selectedSpace.current_vehicle_plate
                      ? `Plate ${selectedSpace.current_vehicle_plate} is currently parked here.`
                      : "A vehicle is currently parked in this bay."}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    marginVertical: 12,
  },
  asphaltGround: {
    padding: 14,
  },
  lotMetaBar: {
    marginBottom: 10,
  },
  adminLayoutBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  adminLayoutLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  adminLayoutText: {
    fontSize: 11,
    fontWeight: "400",
  },
  adminBadgeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  adminBadgeTagText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  zoneStatusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  zoneStatusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveIndicatorPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zoneActiveText: {
    fontSize: 13,
    fontWeight: "600",
  },
  zoneOccupancyCount: {
    fontSize: 11,
    fontWeight: "400",
  },
  voiceAssistantPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  voiceAssistantPillText: {
    fontSize: 10,
    fontWeight: "500",
  },
  scrollContent: {
    paddingRight: 24,
  },
  aisleContainer: {
    flexDirection: "column",
    gap: 8,
  },
  bankRow: {
    flexDirection: "row",
    gap: 12,
  },
  drivingAisle: {
    height: 48,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    marginVertical: 4,
    position: "relative",
  },
  aisleDashedLine: {
    flex: 1,
    height: 1,
  },
  drivingAisleCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 10,
  },
  aisleDirectionIndicator: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1.5,
  },
  animatingCarGhost: {
    position: "absolute",
    left: 20,
    zIndex: 10,
  },
  stallBox: {
    width: 112,
    height: 154,
    borderRadius: 14,
    padding: 8,
    justifyContent: "space-between",
    position: "relative",
  },
  stallOblique: {
    transform: [{ skewX: "-12deg" }],
  },
  stallParallel: {
    width: 140,
    height: 106,
  },
  stallWide: {
    width: 132,
    height: 160,
  },
  stallHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerRightTags: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stallNumber: {
    fontSize: 12,
    fontWeight: "500",
  },
  evBadgeSmall: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  evBadgeSmallText: {
    fontSize: 8,
    fontWeight: "500",
  },
  hBadgeSmall: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hBadgeSmallText: {
    fontSize: 9,
  },
  stallCenterContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  occupiedCarContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  occupiedRibbon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 3,
  },
  redDotLive: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  occupiedRibbonText: {
    fontSize: 7,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  vacantTarget: {
    alignItems: "center",
    justifyContent: "center",
  },
  vacantReticle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vacantLabel: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  wattBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.8,
    marginTop: 4,
  },
  wattBadgeText: {
    fontSize: 8,
    fontWeight: "500",
  },
  stallFooter: {
    alignItems: "center",
  },
  platePlate: {
    fontSize: 8,
    fontWeight: "500",
  },
  priceRow: {
    alignItems: "center",
  },
  priceTag: {
    fontSize: 9,
    fontWeight: "500",
  },
  wideLoadingStripe: {
    position: "absolute",
    right: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: 2,
    opacity: 0.7,
  },
  hickSelectionCard: {
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
  },
  hickCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  hickCardHeaderLeft: {
    flex: 1,
  },
  hickSlotTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  hickStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  statusDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  hickStatusText: {
    fontSize: 11,
    fontWeight: "500",
  },
  hickPriceBox: {
    alignItems: "flex-end",
  },
  hickPriceMain: {
    fontSize: 16,
    fontWeight: "600",
  },
  hickPriceSub: {
    fontSize: 10,
    fontWeight: "400",
  },
  hickSpecsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  hickSpecPill: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
  },
  hickSpecLabel: {
    fontSize: 9,
    fontWeight: "400",
    marginBottom: 2,
  },
  hickSpecValue: {
    fontSize: 10,
    fontWeight: "500",
  },
  hickActionRow: {
    marginTop: 2,
  },
  hickDirectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
  },
  hickDirectBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  hickOccupiedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  hickOccupiedNoticeText: {
    fontSize: 11,
    fontWeight: "400",
    flex: 1,
  },
  carWrapper: {
    width: 48,
    height: 82,
    justifyContent: "center",
    alignItems: "center",
  },
  carShadow: {
    position: "absolute",
    width: 52,
    height: 86,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 12,
  },
  lightBeamsWrapper: {
    position: "absolute",
    top: -24,
    flexDirection: "row",
    justifyContent: "space-between",
    width: 32,
    height: 24,
  },
  lightBeam: {
    width: 8,
    height: 24,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  carChassis: {
    width: 44,
    height: 78,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3F3F46",
    justifyContent: "space-between",
    paddingVertical: 4,
    alignItems: "center",
  },
  headlightsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "74%",
  },
  headlight: {
    width: 6,
    height: 3,
    backgroundColor: "#E4E4E7",
    borderRadius: 2,
  },
  headlightGlow: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  glassCanopy: {
    width: 32,
    height: 44,
    backgroundColor: "#09090B",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#27272A",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  windshield: {
    width: 26,
    height: 8,
    backgroundColor: "#27272A",
    borderRadius: 2,
  },
  sunroof: {
    width: 22,
    height: 12,
    backgroundColor: "#18181B",
    borderRadius: 2,
  },
  evRoofSolarBadge: {
    backgroundColor: "#10B981",
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  evBadgeGlyph: {
    color: "#FFFFFF",
    fontSize: 7,
    fontWeight: "500",
  },
  rearGlass: {
    width: 24,
    height: 7,
    backgroundColor: "#27272A",
    borderRadius: 2,
  },
  taillightsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "74%",
  },
  taillight: {
    width: 6,
    height: 3,
    backgroundColor: "#EF4444",
    borderRadius: 2,
  },
});
