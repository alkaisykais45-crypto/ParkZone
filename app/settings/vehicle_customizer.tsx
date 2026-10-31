import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import {
  CarColorVariant,
  HorizontalUltraRealisticCar,
  VerticalUltraRealisticCar,
} from "../../components/UltraRealisticCar";
import {
  DriverVehicleSpecs,
  useDriverVehicle,
} from "../../hooks/useDriverVehicle";
import { supabase } from "../lib/supabase";
import { RegisteredVehicle, fetchUserVehicles } from "../services/parking";

const { width } = Dimensions.get("window");

const COLOR_SWATCHES: { id: CarColorVariant; name: string; hex: string }[] = [
  { id: "obsidian", name: "Obsidian Black", hex: "#18181B" },
  { id: "carbon", name: "Carbon Grey", hex: "#27272A" },
  { id: "titanium", name: "Titanium Metal", hex: "#52525B" },
  { id: "silver", name: "Liquid Silver", hex: "#94A3B8" },
  { id: "pearl", name: "Pearl White", hex: "#F8FAFC" },
  { id: "glacier", name: "Glacier White", hex: "#F4F4F5" },
  { id: "crimson", name: "Candy Crimson", hex: "#B91C1C" },
  { id: "sapphire", name: "Royal Sapphire", hex: "#1D4ED8" },
  { id: "emerald", name: "British Emerald", hex: "#15803D" },
  { id: "amber", name: "Sunset Amber", hex: "#C2410C" },
  { id: "champagne", name: "Champagne Gold", hex: "#B45309" },
];

export default function VehicleCustomizer() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { vehicle, updateVehicle } = useDriverVehicle();

  // Local editable form state synced from Supabase vehicle
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicle.id);
  const [selectedColor, setSelectedColor] = useState<CarColorVariant>(vehicle.colorVariant);
  const [plateNumber, setPlateNumber] = useState(vehicle.plateNumber);
  const [makeModel, setMakeModel] = useState(vehicle.makeModel);
  const [vehicleType, setVehicleType] = useState<DriverVehicleSpecs["vehicleType"]>(vehicle.vehicleType);
  const [bodyStyle, setBodyStyle] = useState<DriverVehicleSpecs["bodyStyle"]>(vehicle.bodyStyle);
  const [plugType, setPlugType] = useState<DriverVehicleSpecs["plugType"]>(vehicle.plugType);
  const [batteryCapacity, setBatteryCapacity] = useState(
    vehicle.batteryCapacityKwh > 0 ? String(vehicle.batteryCapacityKwh) : ""
  );
  const [batteryLevel, setBatteryLevel] = useState(vehicle.batteryLevelPercent);
  const [driveMode, setDriveMode] = useState<DriverVehicleSpecs["driveMode"]>(vehicle.driveMode);
  const [permitType, setPermitType] = useState<DriverVehicleSpecs["parkingPermitType"]>(vehicle.parkingPermitType);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [headlightsOn, setHeadlightsOn] = useState(vehicle.headlightsActive);
  const [registeredFleet, setRegisteredFleet] = useState<RegisteredVehicle[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadRegisteredFleet = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const list = await fetchUserVehicles(user.id);
        setRegisteredFleet(list);
      } else {
        setRegisteredFleet([]);
      }
    } catch {
      setRegisteredFleet([]);
    }
  }, []);

  useEffect(() => {
    loadRegisteredFleet();
  }, [loadRegisteredFleet]);

  useEffect(() => {
    if (vehicle) {
      setSelectedVehicleId(vehicle.id);
      setSelectedColor(vehicle.colorVariant);
      setPlateNumber(vehicle.plateNumber);
      setMakeModel(vehicle.makeModel);
      setVehicleType(vehicle.vehicleType);
      setBodyStyle(vehicle.bodyStyle);
      setPlugType(vehicle.plugType);
      setBatteryCapacity(vehicle.batteryCapacityKwh > 0 ? String(vehicle.batteryCapacityKwh) : "");
      setBatteryLevel(vehicle.batteryLevelPercent);
      setDriveMode(vehicle.driveMode);
      setPermitType(vehicle.parkingPermitType);
      setHeadlightsOn(vehicle.headlightsActive);
    }
  }, [vehicle]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRegisteredFleet();
    setRefreshing(false);
  };

  const handleSelectRegisteredVehicle = (v: RegisteredVehicle) => {
    setSelectedVehicleId(v.id);
    const raw = v as any;
    setPlateNumber(v.plate_number || "");
    setMakeModel(v.make_model || "");
    setVehicleType(v.vehicle_type === "ev" ? "ev" : "gasoline");
    if (raw.body_style) {
      setBodyStyle(raw.body_style);
    }
    if (raw.plug_type) {
      setPlugType(raw.plug_type);
    } else {
      setPlugType(v.vehicle_type === "ev" ? "CCS2 Combo" : "None");
    }
    if (raw.battery_capacity_kwh) {
      setBatteryCapacity(String(raw.battery_capacity_kwh));
    } else {
      setBatteryCapacity("");
    }
    if (raw.battery_level_percent !== undefined && raw.battery_level_percent !== null) {
      setBatteryLevel(Number(raw.battery_level_percent));
    }
    const matchedSwatch = COLOR_SWATCHES.find(
      (s) => s.id === v.color?.toLowerCase() || s.name.toLowerCase() === v.color?.toLowerCase()
    );
    if (matchedSwatch) {
      setSelectedColor(matchedSwatch.id);
    }
  };

  const handleSave = async () => {
    if (!plateNumber.trim()) {
      Alert.alert("Missing Plate", "Please enter a valid license plate number.");
      return;
    }

    setIsSaving(true);
    try {
      const activeColorObj = COLOR_SWATCHES.find((s) => s.id === selectedColor);
      const parsedCap = parseFloat(batteryCapacity) || (vehicleType === "ev" ? 75 : 0);
      await updateVehicle({
        id: selectedVehicleId || undefined,
        plateNumber: plateNumber.trim().toUpperCase(),
        makeModel: makeModel.trim(),
        vehicleType,
        colorVariant: selectedColor,
        colorName: activeColorObj ? activeColorObj.name : "Custom Finish",
        bodyStyle,
        plugType,
        batteryCapacityKwh: parsedCap,
        batteryLevelPercent: batteryLevel,
        estimatedRangeKm: vehicleType === "ev" ? Math.round((batteryLevel / 100) * parsedCap * 5.2) : 0,
        parkingPermitType: permitType,
        driveMode,
        headlightsActive: headlightsOn,
      });

      await loadRegisteredFleet();

      Alert.alert(
        "Vehicle Profile Updated",
        `Your ${makeModel || "vehicle"} (${plateNumber.toUpperCase()}) specifications have been saved to the database.`,
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not update vehicle profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerBackBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Vehicle Customizer</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Live 3D telemetry & technical specs
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.headerActionBtn, { backgroundColor: theme.primaryBtnBg }]}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Text style={[styles.headerActionBtnText, { color: theme.primaryBtnText }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text}
            colors={[theme.text]}
          />
        }
      >
        {/* =========================================================================
            STAGE 1: INTERACTIVE REAL-TIME VEHICLE SHOWCASE
        ========================================================================== */}
        <View style={[styles.stageCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
          {/* Top Stage Indicators */}
          <View style={styles.stageTopRow}>
            <View style={[styles.liveSyncBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View style={[styles.livePulseDot, { backgroundColor: theme.accent }]} />
              <Text style={[styles.liveSyncText, { color: theme.text }]}>LIVE TELEMETRY</Text>
            </View>

            <View style={styles.stageControlsRow}>
              {/* Headlights Toggle */}
              <TouchableOpacity
                style={[
                  styles.stageControlBtn,
                  {
                    backgroundColor: headlightsOn ? theme.pillActiveBg : theme.background,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setHeadlightsOn(!headlightsOn)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={headlightsOn ? "flash" : "flash-outline"}
                  size={15}
                  color={headlightsOn ? theme.pillActiveText : theme.text}
                />
              </TouchableOpacity>

              {/* Rotate View Orientation */}
              <TouchableOpacity
                style={[styles.stageControlBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                onPress={() => setOrientation(orientation === "horizontal" ? "vertical" : "horizontal")}
                activeOpacity={0.75}
              >
                <Ionicons name="refresh-outline" size={16} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Vehicle Stage Area */}
          <View style={styles.carStageArea}>
            {/* Grid Floor Lines */}
            <View style={styles.stageGridLines}>
              <View style={[styles.gridLineH, { borderColor: theme.border }]} />
              <View style={[styles.gridLineH, { borderColor: theme.border }]} />
              <View style={[styles.gridLineV, { borderColor: theme.border }]} />
            </View>

            {/* Glowing Xenon Light Beams (when headlights are ON) */}
            {headlightsOn && (
              <View
                style={[
                  orientation === "horizontal" ? styles.horizontalLightBeam : styles.verticalLightBeam,
                  {
                    backgroundColor: theme.isDark
                      ? "rgba(255, 255, 255, 0.12)"
                      : "rgba(0, 0, 0, 0.05)",
                  },
                ]}
              />
            )}

            {/* Live Vehicle Graphic */}
            <View style={styles.carRendererBox}>
              {orientation === "horizontal" ? (
                <HorizontalUltraRealisticCar color={selectedColor} scale={1.25} />
              ) : (
                <VerticalUltraRealisticCar
                  color={selectedColor}
                  model={bodyStyle?.toLowerCase() === "hatchback" ? "hatchback" : "sedan"}
                  scale={1.25}
                />
              )}
            </View>
          </View>

          {/* Identity HUD Footer */}
          <View style={[styles.stageHudFooter, { borderTopColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.hudPlateText, { color: theme.text }]}>
                {plateNumber.trim() ? plateNumber.toUpperCase() : "UNREGISTERED PLATE"}
              </Text>
              <Text style={[styles.hudModelText, { color: theme.textSecondary }]}>
                {makeModel.trim() || "Vehicle Not Configured"} • {bodyStyle}
              </Text>
            </View>

            <View style={[styles.hudBatteryBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons
                name={vehicleType === "ev" ? "battery-charging" : "speedometer"}
                size={16}
                color={theme.text}
              />
              <Text style={[styles.hudBatteryText, { color: theme.text }]}>
                {vehicleType === "ev" ? `${batteryLevel}%` : bodyStyle}
              </Text>
            </View>
          </View>
        </View>

        {/* =========================================================================
            SECTION 2: EXTERIOR PAINT FINISH CUSTOMIZER
        ========================================================================== */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Exterior Finish & Color</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            High-gloss automotive powder coat finish
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.swatchesScroll}
        >
          {COLOR_SWATCHES.map((swatch) => {
            const isSelected = selectedColor === swatch.id;
            return (
              <TouchableOpacity
                key={swatch.id}
                style={[
                  styles.swatchCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: isSelected ? theme.text : theme.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedColor(swatch.id)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.swatchCircle,
                    {
                      backgroundColor: swatch.hex,
                      borderColor: theme.border,
                      borderWidth: swatch.id === "pearl" || swatch.id === "glacier" ? 1 : 0,
                    },
                  ]}
                >
                  {isSelected && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={swatch.id === "pearl" || swatch.id === "glacier" ? "#09090B" : "#FFFFFF"}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.swatchLabel,
                    {
                      color: isSelected ? theme.text : theme.textSecondary,
                      fontWeight: isSelected ? "600" : "400",
                    },
                  ]}
                  numberOfLines={1}
                >
                  {swatch.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* =========================================================================
            SECTION 3: REGISTERED VEHICLES IN DATABASE
        ========================================================================== */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Your Registered Vehicles</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            Select a registered plate from your database fleet or add a new vehicle
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetsScroll}
        >
          {registeredFleet.map((v) => {
            const isCurrent = plateNumber.trim().toUpperCase() === v.plate_number?.toUpperCase();
            return (
              <TouchableOpacity
                key={v.id}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isCurrent ? theme.pillActiveBg : theme.surface,
                    borderColor: isCurrent ? theme.pillActiveBg : theme.border,
                  },
                ]}
                onPress={() => handleSelectRegisteredVehicle(v)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    { color: isCurrent ? theme.pillActiveText : theme.text },
                  ]}
                >
                  {v.plate_number}
                </Text>
                <Text
                  style={[
                    styles.presetChipSub,
                    { color: isCurrent ? theme.pillActiveText : theme.textSecondary },
                  ]}
                >
                  {v.make_model || "Vehicle"} • {v.vehicle_type.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[
              styles.presetChip,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                justifyContent: "center",
              },
            ]}
            onPress={() => router.push("/(tabs)/vehicles")}
            activeOpacity={0.8}
          >
            <Text style={[styles.presetChipText, { color: theme.text }]}>
              + Register Vehicle
            </Text>
            <Text style={[styles.presetChipSub, { color: theme.textSecondary }]}>
              {registeredFleet.length === 0 ? "No vehicles saved yet" : "Manage fleet"}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* =========================================================================
            SECTION 4: VEHICLE SPECIFICATIONS FORM
        ========================================================================== */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Driver Vehicle Specifications</Text>
          <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            RURA & City of Kigali parking verification details
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* License Plate Number */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>License Plate Number</Text>
            <View style={[styles.plateInputBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View style={styles.rwandaFlagPill}>
                <Text style={styles.flagText}>RW</Text>
                <Text style={styles.flagSub}>RW</Text>
              </View>
              <TextInput
                style={[styles.plateTextInput, { color: theme.text }]}
                value={plateNumber}
                onChangeText={setPlateNumber}
                placeholder="Enter license plate"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="characters"
              />
            </View>
          </View>

          {/* Make & Model */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Vehicle Make & Model</Text>
            <TextInput
              style={[styles.standardInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={makeModel}
              onChangeText={setMakeModel}
              placeholder="Enter make and model"
              placeholderTextColor={theme.textMuted}
            />
          </View>

          {/* Vehicle Powertrain Type */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Powertrain Architecture</Text>
            <View style={styles.segmentRow}>
              {[
                { id: "ev", label: "Electric (EV)", icon: "flash" },
                { id: "hybrid", label: "Hybrid", icon: "leaf" },
                { id: "gasoline", label: "Gasoline", icon: "speedometer" },
                { id: "diesel", label: "Diesel", icon: "flame" },
              ].map((item) => {
                const isActive = vehicleType === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.segmentBtn,
                      {
                        backgroundColor: isActive ? theme.pillActiveBg : theme.background,
                        borderColor: isActive ? theme.pillActiveBg : theme.border,
                      },
                    ]}
                    onPress={() => setVehicleType(item.id as any)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={14}
                      color={isActive ? theme.pillActiveText : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: isActive ? theme.pillActiveText : theme.text,
                          fontWeight: isActive ? "600" : "400",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Body Style */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Body Classification</Text>
            <View style={styles.segmentRow}>
              {["Sedan", "SUV", "Coupe", "Hatchback", "Truck"].map((b) => {
                const isActive = bodyStyle === b;
                return (
                  <TouchableOpacity
                    key={b}
                    style={[
                      styles.segmentBtn,
                      {
                        backgroundColor: isActive ? theme.pillActiveBg : theme.background,
                        borderColor: isActive ? theme.pillActiveBg : theme.border,
                      },
                    ]}
                    onPress={() => setBodyStyle(b as any)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: isActive ? theme.pillActiveText : theme.text,
                          fontWeight: isActive ? "600" : "400",
                        },
                      ]}
                    >
                      {b}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* EV Plug Type (if EV or Hybrid) */}
          {(vehicleType === "ev" || vehicleType === "hybrid") && (
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Charging Connector Standard</Text>
              <View style={styles.segmentRow}>
                {["CCS2 Combo", "Type 2 Mennekes", "Supercharger", "CHAdeMO"].map((p) => {
                  const isActive = plugType === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.segmentBtn,
                        {
                          backgroundColor: isActive ? theme.pillActiveBg : theme.background,
                          borderColor: isActive ? theme.pillActiveBg : theme.border,
                        },
                      ]}
                      onPress={() => setPlugType(p as any)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="battery-charging-outline"
                        size={13}
                        color={isActive ? theme.pillActiveText : theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isActive ? theme.pillActiveText : theme.text,
                            fontWeight: isActive ? "600" : "400",
                          },
                        ]}
                      >
                        {p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Real-time Battery Capacity & Simulated SoC */}
          {vehicleType === "ev" && (
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Battery Capacity (kWh)</Text>
              <TextInput
                style={[styles.standardInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                value={batteryCapacity}
                onChangeText={setBatteryCapacity}
                keyboardType="decimal-pad"
                placeholder="e.g. 93.4"
                placeholderTextColor={theme.textMuted}
              />
            </View>
          )}

          {/* Parking Permit Tier */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Parking Access Concession</Text>
            <View style={styles.segmentRow}>
              {[
                { id: "Standard", label: "Standard" },
                { id: "EV Priority", label: "EV Priority" },
                { id: "Handicap Concession", label: "Accessible (RWA-DIS)" },
              ].map((tier) => {
                const isActive = permitType === tier.id;
                return (
                  <TouchableOpacity
                    key={tier.id}
                    style={[
                      styles.segmentBtn,
                      {
                        backgroundColor: isActive ? theme.pillActiveBg : theme.background,
                        borderColor: isActive ? theme.pillActiveBg : theme.border,
                      },
                    ]}
                    onPress={() => setPermitType(tier.id as any)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: isActive ? theme.pillActiveText : theme.text,
                          fontWeight: isActive ? "600" : "400",
                        },
                      ]}
                    >
                      {tier.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Drive Mode Profile */}
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Active Drive Dynamics</Text>
            <View style={styles.segmentRow}>
              {["Eco Range", "Normal Balanced", "Sport Dynamic"].map((m) => {
                const isActive = driveMode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.segmentBtn,
                      {
                        backgroundColor: isActive ? theme.pillActiveBg : theme.background,
                        borderColor: isActive ? theme.pillActiveBg : theme.border,
                      },
                    ]}
                    onPress={() => setDriveMode(m as any)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: isActive ? theme.pillActiveText : theme.text,
                          fontWeight: isActive ? "600" : "400",
                        },
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Primary Save Button */}
        <TouchableOpacity
          style={[styles.saveActionBtn, { backgroundColor: theme.primaryBtnBg, shadowColor: theme.cardShadow }]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.88}
        >
          <Text style={[styles.saveActionBtnText, { color: theme.primaryBtnText }]}>
            {isSaving ? "Synchronizing Telemetry..." : "Save Vehicle Specifications"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 2,
  },
  headerActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  /* Stage Showcase */
  stageCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 22,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6,
  },
  stageTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  liveSyncBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveSyncText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  stageControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stageControlBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  carStageArea: {
    height: 170,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  stageGridLines: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.35,
  },
  gridLineH: {
    width: "80%",
    borderBottomWidth: 1,
    borderStyle: "dashed",
    marginVertical: 20,
  },
  gridLineV: {
    height: "80%",
    borderRightWidth: 1,
    borderStyle: "dashed",
    position: "absolute",
  },
  horizontalLightBeam: {
    position: "absolute",
    left: width * 0.1,
    width: 60,
    height: 80,
    borderRadius: 40,
  },
  verticalLightBeam: {
    position: "absolute",
    top: 10,
    width: 80,
    height: 60,
    borderRadius: 40,
  },
  carRendererBox: {
    zIndex: 10,
  },
  stageHudFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  hudPlateText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 1,
  },
  hudModelText: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 2,
  },
  hudBatteryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  hudBatteryText: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* Sections */
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 2,
  },
  swatchesScroll: {
    gap: 10,
    paddingBottom: 22,
  },
  swatchCard: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
    minWidth: 84,
  },
  swatchCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchLabel: {
    fontSize: 11,
  },
  presetsScroll: {
    gap: 8,
    paddingBottom: 22,
  },
  presetChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  presetChipSub: {
    fontSize: 10,
    fontWeight: "400",
  },

  /* Form */
  formCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 16,
    marginBottom: 24,
  },
  fieldRow: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  plateInputBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  rwandaFlagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 6,
    marginRight: 10,
  },
  flagText: {
    fontSize: 14,
  },
  flagSub: {
    fontSize: 11,
    fontWeight: "400",
  },
  plateTextInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "400",
    letterSpacing: 1,
  },
  standardInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "400",
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 12,
  },

  /* Save Action */
  saveActionBtn: {
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 20,
  },
  saveActionBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
