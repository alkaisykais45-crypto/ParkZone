import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../hooks/useTheme";
import { useDriverVehicle } from "../hooks/useDriverVehicle";
import {
  ChargerBayDetails,
  estimateChargingForVehicle,
  fetchChargerBayDetails,
  formatDurationMins,
  isPlugCompatible,
} from "../app/services/evCharging";
import { EvChargerTelemetry, ParkingSpace } from "../app/services/parking";

interface Props {
  locationId: string;
  space: ParkingSpace;
  chargers: EvChargerTelemetry[];
  onStartCharging?: (details: ChargerBayDetails) => void;
  onClose?: () => void;
}

export const EvBayDetailModal: React.FC<Props> = ({
  locationId,
  space,
  chargers,
  onStartCharging,
  onClose,
}) => {
  const theme = useTheme();
  const { vehicle: driverVehicle } = useDriverVehicle();

  const [details, setDetails] = useState<ChargerBayDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchChargerBayDetails({ locationId, space, chargers })
      .then((res: ChargerBayDetails) => {
        if (active) setDetails(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [locationId, space.id, space.space_number, space.is_occupied]);

  const estimate = details && !details.isOccupied
    ? estimateChargingForVehicle({
        chargerKw: details.maxKw,
        connectorType: details.plug,
        batteryCapacityKwh: driverVehicle.batteryCapacityKwh,
        currentSocPercent: driverVehicle.batteryLevelPercent,
      })
    : null;

  const compatible = details
    ? isPlugCompatible(driverVehicle.plugType, details.plug)
    : null;

  return (
    <View style={styles.backdrop}>
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={1}
        onPress={onClose}
      />

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.handleBar} />

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: space.is_occupied ? theme.danger : theme.evGreen,
                  },
                ]}
              />
              <Text style={[styles.title, { color: theme.text }]}>
                Bay {space.space_number}
              </Text>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: space.is_occupied
                      ? theme.dangerSoft
                      : theme.evGreenSoft,
                    borderColor: space.is_occupied ? theme.danger : theme.evGreenBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: space.is_occupied ? theme.danger : theme.evGreen },
                  ]}
                >
                  {space.is_occupied ? "CURRENTLY CHARGING" : "AVAILABLE"}
                </Text>
              </View>
            </View>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {space.zone_code || "EV Hub"} • Electric Vehicle Fast Charging Only
            </Text>
          </View>

          {onClose && (
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator size="small" color={theme.evGreen} />
            <Text style={{ marginTop: 8, fontSize: 11, color: theme.textSecondary }}>
              Connecting to live charger telemetry...
            </Text>
          </View>
        ) : details ? (
          <View>
            {/* OCCUPIED / CURRENTLY CHARGING STATE */}
            {details.isOccupied ? (
              <View style={styles.occupiedBlock}>
                <View
                  style={[
                    styles.sectionCallout,
                    {
                      backgroundColor: "rgba(16, 185, 129, 0.08)",
                      borderColor: theme.evGreenBorder,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Ionicons name="flash" size={15} color={theme.evGreen} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>
                      Active Charging Session
                    </Text>
                  </View>

                  <View style={styles.infoGrid}>
                    <View style={styles.infoCol}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                        VEHICLE CHARGING
                      </Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>
                        {details.occupantPlateMasked || "Electric Vehicle"}
                      </Text>
                      {details.occupantVehicleLabel && (
                        <Text style={[styles.infoSub, { color: theme.textSecondary }]}>
                          {details.occupantVehicleLabel}
                        </Text>
                      )}
                    </View>

                    <View style={styles.infoCol}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                        PLUG CONNECTED
                      </Text>
                      <Text style={[styles.infoValue, { color: theme.evGreen }]}>
                        {details.plug}
                      </Text>
                      <Text style={[styles.infoSub, { color: theme.textSecondary }]}>
                        {details.maxKw} kW {details.isDc ? "DC Fast" : "AC"}
                      </Text>
                    </View>

                    <View style={styles.infoCol}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                        SESSION DURATION
                      </Text>
                      <Text style={[styles.infoValue, { color: theme.text }]}>
                        {details.chargingSince
                          ? formatDurationMins(
                              Math.max(1, (Date.now() - details.chargingSince.getTime()) / 60000)
                            )
                          : details.bookedMinutes
                          ? `${details.bookedMinutes} min booked`
                          : "Active now"}
                      </Text>
                      {details.chargingSince && (
                        <Text style={[styles.infoSub, { color: theme.textSecondary }]}>
                          Started {details.chargingSince.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      )}
                    </View>

                    <View style={styles.infoCol}>
                      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                        ESTIMATED FULL CHARGE
                      </Text>
                      <Text style={[styles.infoValue, { color: theme.evGreen }]}>
                        {details.estimatedFullAt
                          ? details.estimatedFullAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : details.socPercent !== null
                          ? `${details.socPercent}% charged`
                          : "In ~35 mins"}
                      </Text>
                      <Text style={[styles.infoSub, { color: theme.textSecondary }]}>
                        Target {details.targetSocPercent || 100}% SOC
                      </Text>
                    </View>
                  </View>

                  {details.currentPowerKw ? (
                    <View style={[styles.livePowerPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <Ionicons name="pulse-outline" size={12} color={theme.evGreen} />
                      <Text style={{ fontSize: 11, fontWeight: "500", color: theme.text }}>
                        Live Draw: <Text style={{ color: theme.evGreen, fontWeight: "600" }}>{details.currentPowerKw} kW</Text>
                        {details.deliveredKwh ? ` • Delivered: ${details.deliveredKwh.toFixed(2)} kWh` : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, textAlign: "center" }}>
                    This stall will automatically become available once the vehicle unplugs.
                  </Text>
                </View>
              </View>
            ) : (
              /* VACANT CHARGING SLOT — FULL PRE-PAYMENT DETAILS */
              <View style={styles.vacantBlock}>
                {/* Hardware & Plug Specs */}
                <View style={styles.specCardsRow}>
                  <View style={[styles.specCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Ionicons name="flash-outline" size={16} color={theme.evGreen} />
                    <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Output</Text>
                    <Text style={[styles.specValue, { color: theme.text }]}>
                      {details.maxKw} kW
                    </Text>
                    <Text style={[styles.specSub, { color: theme.textSecondary }]}>
                      {details.isDc ? "DC Ultra-Fast" : "AC Level 2"}
                    </Text>
                  </View>

                  <View style={[styles.specCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Ionicons name="hardware-chip-outline" size={16} color={theme.evGreen} />
                    <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Plug</Text>
                    <Text style={[styles.specValue, { color: theme.text }]} numberOfLines={1}>
                      {details.plugStandard !== "Unknown" ? details.plugStandard : details.plug}
                    </Text>
                    <Text style={[styles.specSub, { color: theme.textSecondary }]}>
                      {details.plug}
                    </Text>
                  </View>

                  <View style={[styles.specCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={theme.evGreen} />
                    <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Status</Text>
                    <Text style={[styles.specValue, { color: details.isOperational ? theme.evGreen : theme.danger }]}>
                      {details.isOperational ? "Working" : "Degraded"}
                    </Text>
                    <Text style={[styles.specSub, { color: theme.textSecondary }]}>
                      {details.voltage ? `${details.voltage}V Grid` : "OCPP 2.0.1"}
                    </Text>
                  </View>
                </View>

                {/* Compatibility notice */}
                {compatible !== null && (
                  <View
                    style={[
                      styles.compatibilityBanner,
                      {
                        backgroundColor: compatible ? theme.evGreenSoft : "rgba(239, 68, 68, 0.08)",
                        borderColor: compatible ? theme.evGreenBorder : "rgba(239, 68, 68, 0.3)",
                      },
                    ]}
                  >
                    <Ionicons
                      name={compatible ? "checkmark-circle" : "warning"}
                      size={14}
                      color={compatible ? theme.evGreen : theme.danger}
                    />
                    <Text
                      style={[
                        styles.compatibilityText,
                        { color: compatible ? theme.evGreen : theme.danger },
                      ]}
                    >
                      {compatible
                        ? `Matches your vehicle's inlet (${driverVehicle.plugType || details.plugStandard})`
                        : `Your registered vehicle inlet (${driverVehicle.plugType || "Other"}) may require an adapter for ${details.plug}`}
                    </Text>
                  </View>
                )}

                {/* Estimate for driver vehicle */}
                {estimate && driverVehicle.batteryCapacityKwh > 0 && (
                  <View
                    style={[
                      styles.estimateBox,
                      { backgroundColor: theme.background, borderColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.estimateTitle, { color: theme.text }]}>
                      Charge Time Estimate for {driverVehicle.makeModel || "Your EV"}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 8 }}>
                      Current: {driverVehicle.batteryLevelPercent}% ({driverVehicle.batteryCapacityKwh} kWh pack)
                    </Text>

                    <View style={styles.estimateRow}>
                      <View style={styles.estimateCol}>
                        <Text style={[styles.estimateNumber, { color: theme.evGreen }]}>
                          {formatDurationMins(estimate.minutesTo80)}
                        </Text>
                        <Text style={[styles.estimateSubLabel, { color: theme.textSecondary }]}>
                          to 80% Fast Charge (+{estimate.kwhTo80} kWh)
                        </Text>
                      </View>

                      <View style={styles.estimateCol}>
                        <Text style={[styles.estimateNumber, { color: theme.text }]}>
                          {formatDurationMins(estimate.minutesToFull)}
                        </Text>
                        <Text style={[styles.estimateSubLabel, { color: theme.textSecondary }]}>
                          to 100% Full (+{estimate.kwhToFull} kWh)
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Separated Tariff Disclosure */}
                <View
                  style={[
                    styles.tariffDisclosure,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Ionicons name="pricetag" size={13} color={theme.evGreen} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text }}>
                      EV Flat-Rate Tariff (Strictly Free Parking)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 16 }}>
                    • <Text style={{ fontWeight: "600", color: theme.text }}>9,000 RWF</Text> for sessions under 30 minutes{"\n"}
                    • <Text style={{ fontWeight: "600", color: theme.text }}>10,000 RWF</Text> for sessions ≥ 30 minutes or full charge{"\n"}
                    • <Text style={{ fontWeight: "600", color: theme.text }}>0 RWF</Text> parking fee during active EV charging
                  </Text>
                </View>

                {/* Start Charging CTA */}
                {onStartCharging && (
                  <TouchableOpacity
                    style={[styles.startBtn, { backgroundColor: theme.primaryBtnBg }]}
                    onPress={() => onStartCharging(details)}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="flash" size={15} color={theme.evGreen} />
                    <Text style={[styles.startBtnText, { color: theme.primaryBtnText }]}>
                      Proceed to Connect Plug ({details.plug})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    zIndex: 99,
  },
  card: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#A1A1AA",
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  occupiedBlock: {
    paddingVertical: 4,
  },
  sectionCallout: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
    columnGap: 10,
    marginTop: 6,
  },
  infoCol: {
    width: "48%",
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  infoSub: {
    fontSize: 10,
    marginTop: 1,
  },
  livePowerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
  },
  vacantBlock: {
    gap: 12,
  },
  specCardsRow: {
    flexDirection: "row",
    gap: 8,
  },
  specCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 2,
  },
  specLabel: {
    fontSize: 9.5,
    marginTop: 2,
  },
  specValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  specSub: {
    fontSize: 9,
  },
  compatibilityBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  compatibilityText: {
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
  },
  estimateBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  estimateTitle: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  estimateRow: {
    flexDirection: "row",
    gap: 12,
  },
  estimateCol: {
    flex: 1,
  },
  estimateNumber: {
    fontSize: 18,
    fontWeight: "700",
  },
  estimateSubLabel: {
    fontSize: 9.5,
    marginTop: 1,
  },
  tariffDisclosure: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  startBtn: {
    height: 48,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  startBtnText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
});

export default EvBayDetailModal;
