import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import {
  DbPaymentMethodRecord,
  EvChargerTelemetry,
  fetchAllEvStationsWithChargers,
  fetchSpotsForLocation,
  fetchUserPaymentMethods,
  fetchWalletBalance,
  issueZeroContactCitation,
  ParkingSpace,
  subscribeToEvChargersRealtime,
  subscribeToSpacesRealtime,
  updateWalletBalance,
} from "../services/parking";
import { Icons } from "../../constants/icons";
import { useTheme } from "../../hooks/useTheme";
import { useDriverVehicle } from "../../hooks/useDriverVehicle";
import { HorizontalUltraRealisticCar } from "../../components/UltraRealisticCar";
import { AerialParkingLot3D } from "../../components/AerialParkingLot3D";
import { EvBayDetailModal } from "../../components/EvBayDetailModal";
import { BayGridSkeleton, EvStationsCarouselSkeleton } from "../../components/SkeletonLoader";
import {
  ChargerBayDetails,
  estimateChargingForVehicle,
  formatDurationMins,
  isPlugCompatible,
} from "../services/evCharging";
import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from "../../constants/mapStyles";
import { fetchRealRoadRoute, LatLng } from "../services/roadRouting";
import { initiateMobilePayment } from "../services/mobilePayment";

const { width } = Dimensions.get("window");

const DEFAULT_REGION = {
  latitude: -1.9536,
  longitude: 30.0606,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const haversineKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getSteppedRoute = (start: { latitude: number; longitude: number }, end: { latitude: number; longitude: number }) => {
  const dLat = end.latitude - start.latitude;
  const dLon = end.longitude - start.longitude;
  return [
    start,
    { latitude: start.latitude + dLat * 0.22, longitude: start.longitude },
    { latitude: start.latitude + dLat * 0.22, longitude: start.longitude + dLon * 0.4 },
    { latitude: start.latitude + dLat * 0.58, longitude: start.longitude + dLon * 0.4 },
    { latitude: start.latitude + dLat * 0.58, longitude: start.longitude + dLon * 0.8 },
    { latitude: start.latitude + dLat * 0.86, longitude: start.longitude + dLon * 0.8 },
    { latitude: start.latitude + dLat * 0.86, longitude: end.longitude },
    end,
  ];
};

export interface StationItem {
  id: string;
  name: string;
  address: string;
  distance: string;
  latitude: number;
  longitude: number;
  tariff: string;
  image?: string;
  chargers: EvChargerTelemetry[];
}

export interface ParkingLotSpot {
  id: string;
  bayNumber: string;
  isOccupied: boolean;
  carColor?: string;
  spotType?: string;
}

type LayoutMode = "grid" | "map" | "list";

const EVChargers = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const router = useRouter();
  const { vehicle: driverVehicle } = useDriverVehicle();

  const [userCoords, setUserCoords] = useState({
    latitude: DEFAULT_REGION.latitude,
    longitude: DEFAULT_REGION.longitude,
  });
  const [stations, setStations] = useState<StationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "fast" | "ac">("all");
  const [activeCategory, setActiveCategory] = useState<string>("car");
  const [bookmarked, setBookmarked] = useState<Record<string, boolean>>({});
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("map");
  const [selectedStation, setSelectedStation] = useState<StationItem | null>(null);
  const [activeRouteCoords, setActiveRouteCoords] = useState<LatLng[]>([]);
  const [activeRouteDistanceKm, setActiveRouteDistanceKm] = useState<number>(0);
  const [activeRouteDurationMin, setActiveRouteDurationMin] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;
    if (selectedStation && userCoords) {
      const dest = {
        latitude: Number(selectedStation.latitude),
        longitude: Number(selectedStation.longitude),
      };
      fetchRealRoadRoute(userCoords, dest).then((res) => {
        if (!isCancelled) {
          setActiveRouteCoords(res.coordinates);
          setActiveRouteDistanceKm(res.distanceKm);
          setActiveRouteDurationMin(res.durationMinutes);
        }
      });
    } else {
      setActiveRouteCoords([]);
      setActiveRouteDistanceKm(0);
      setActiveRouteDurationMin(0);
    }
    return () => {
      isCancelled = true;
    };
  }, [selectedStation, userCoords]);

  // BottomSheet and Charging Spot Selection State (driven by database)
  const [sheetStation, setSheetStation] = useState<StationItem | null>(null);
  const [sheetSpaces, setSheetSpaces] = useState<ParkingSpace[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [selectedBay, setSelectedBay] = useState<string>("");
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<DbPaymentMethodRecord[]>([]);

  // EV Slot Aerial view toggle & Inspection Modal
  const [is3DView, setIs3DView] = useState(false);
  const [inspectedSpace, setInspectedSpace] = useState<ParkingSpace | null>(null);

  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          let coords = (await Location.getLastKnownPositionAsync())?.coords || null;
          if (!coords) {
            try {
              const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              coords = loc?.coords || null;
            } catch {
              // Simulator/GPS unavailable — keep default coordinates
            }
          }
          if (coords) {
            setUserCoords({
              latitude: coords.latitude,
              longitude: coords.longitude,
            });
          }
        }
      } catch {}
    })();
    fetchUserPaymentMethods().then(setPaymentMethods).catch(() => {});
  }, []);

  // Load real bays from Supabase whenever sheetStation changes
  useEffect(() => {
    if (!sheetStation?.id) {
      setSheetSpaces([]);
      return;
    }
    let mounted = true;
    setLoadingSpaces(true);
    fetchSpotsForLocation(sheetStation.id)
      .then((spots) => {
        if (!mounted) return;
        setSheetSpaces(spots);
        const zones = Array.from(new Set(spots.map((s) => s.zone_code || "EV Hub")));
        const firstZone = zones[0] || "";
        setSelectedZone(firstZone);
        const firstFree = spots.find(
          (s) => !s.is_occupied && (!firstZone || (s.zone_code || "EV Hub") === firstZone)
        );
        setSelectedBay(firstFree?.space_number || spots[0]?.space_number || "");
      })
      .finally(() => {
        if (mounted) setLoadingSpaces(false);
      });

    const unsub = subscribeToSpacesRealtime(sheetStation.id, (updated) => {
      setSheetSpaces((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
      );
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [sheetStation?.id]);

  const availableZones = useMemo(() => {
    const zones = Array.from(new Set(sheetSpaces.map((s) => s.zone_code || "EV Hub")));
    return zones;
  }, [sheetSpaces]);

  const handleSelectZone = (zone: string) => {
    setSelectedZone(zone);
    const inZone = sheetSpaces.filter((s) => (s.zone_code || "EV Hub") === zone);
    const firstAvailable = inZone.find((s) => !s.is_occupied);
    if (firstAvailable) {
      setSelectedBay(firstAvailable.space_number);
    } else if (inZone[0]) {
      setSelectedBay(inZone[0].space_number);
    }
  };

  const currentLot = useMemo(() => {
    const filtered = selectedZone
      ? sheetSpaces.filter((s) => (s.zone_code || "EV Hub") === selectedZone)
      : sheetSpaces;
    const mapped: ParkingLotSpot[] = filtered.map((s) => ({
      id: s.id,
      bayNumber: s.space_number,
      isOccupied: s.is_occupied,
      carColor: "obsidian",
      spotType: s.watt_power_kw ? `${s.watt_power_kw}kW` : s.space_type === "ev" ? "EV Charger" : "Bay",
    }));
    const mid = Math.ceil(mapped.length / 2);
    return {
      title: selectedZone || sheetStation?.name || "Charging Zone",
      description:
        mapped.length > 0
          ? `${mapped.filter((m) => !m.isOccupied).length} of ${mapped.length} bays available in database`
          : "No bays configured for this station yet",
      leftColumn: mapped.slice(0, mid),
      rightColumn: mapped.slice(mid),
    };
  }, [sheetSpaces, selectedZone, sheetStation?.name]);

  const [refreshing, setRefreshing] = useState(false);

  const loadChargers = useCallback(async () => {
    setLoading(true);
    try {
      const dbStations = await fetchAllEvStationsWithChargers();
      const withDistances: StationItem[] = dbStations.map((st) => {
        const km = haversineKm(
          userCoords.latitude,
          userCoords.longitude,
          st.latitude,
          st.longitude
        );
        return {
          ...st,
          distance: `${km.toFixed(1)} km`,
        };
      });
      setStations(withDistances);
      setSelectedStation((prev) => {
        if (prev && withDistances.some((s) => s.id === prev.id)) {
          return withDistances.find((s) => s.id === prev.id) || null;
        }
        return withDistances[0] || null;
      });
    } catch (e) {
      console.warn("loadChargers error:", e);
      setStations([]);
      setSelectedStation(null);
    } finally {
      setLoading(false);
    }
  }, [userCoords.latitude, userCoords.longitude]);

  useEffect(() => {
    loadChargers();
  }, [loadChargers]);

  // Real-time Cloud Subscription for EV Charger Hardware Telemetry & Working Status
  useEffect(() => {
    if (!selectedStation?.id) return;
    const unsubscribe = subscribeToEvChargersRealtime(selectedStation.id, (updatedCharger) => {
      setStations((prev) =>
        prev.map((st) => {
          if (st.id === updatedCharger.location_id) {
            return {
              ...st,
              chargers: st.chargers.map((c) =>
                c.id === updatedCharger.id ? { ...c, ...updatedCharger } : c
              ),
            };
          }
          return st;
        })
      );
    });
    return () => {
      unsubscribe();
    };
  }, [selectedStation?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChargers();
    setRefreshing(false);
  };

  const filteredStations = stations.filter((st) => {
    const matchesSearch =
      st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.address.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeCategory === "fast") {
      return st.chargers.some((c) => c.max_output_kw >= 100);
    }
    if (activeCategory === "ac") {
      return st.chargers.some((c) => c.max_output_kw <= 22);
    }
    return true;
  });

  const handleReservePlug = (stationName: string, charger: EvChargerTelemetry) => {
    if (charger.status !== "available") {
      Alert.alert(
        "Plug In-Use",
        `This ${charger.connector_type} charger is currently drawing ${charger.current_power_draw_kw} kW. Estimated free in ~14 minutes.`
      );
      return;
    }

    Alert.alert(
      "Reserve EV Charger",
      `Station: ${stationName}\nPlug: ${charger.station_identifier} (${charger.connector_type})\nOutput: ${charger.max_output_kw} kW\nCharging Tariff: 9,000 RWF (<30 min) • 10,000 RWF (≥30 min / Full)\nParking Fee: 0 RWF (Separated from Parking)\n\n15-minute arrival hold will be activated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Hold (100 RWF)",
          onPress: () => {
            Alert.alert("Plug Reserved", "Charger bay locked for 15 minutes. Follow turn-by-turn navigation upon arrival.");
          },
        },
      ]
    );
  };

  const handleFocusRoute = (station: StationItem) => {
    setSelectedStation(station);
    mapRef.current?.animateToRegion(
      {
        latitude: (userCoords.latitude + station.latitude) / 2,
        longitude: (userCoords.longitude + station.longitude) / 2,
        latitudeDelta: Math.max(Math.abs(userCoords.latitude - station.latitude) * 2.4, 0.035),
        longitudeDelta: Math.max(Math.abs(userCoords.longitude - station.longitude) * 2.4, 0.035),
      },
      450
    );
  };

  const handleSelectLocation = (station: StationItem) => {
    setSelectedStation(station);
    setSheetStation(station);
    mapRef.current?.animateToRegion(
      {
        latitude: station.latitude,
        longitude: station.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      400
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Edge-to-Edge Map: Full Screen with rate bubbles, route polyline, and user radar */}
      <View style={StyleSheet.absoluteFillObject}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={DEFAULT_REGION}
          showsUserLocation={false}
          customMapStyle={theme.isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
        >
          {/* User Location Radar Marker in App Colors */}
          <Marker coordinate={userCoords} anchor={{ x: 0.5, y: 0.5 }}>
            <View
              style={[
                styles.radarOuterCircle,
                {
                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(9, 9, 11, 0.10)",
                },
              ]}
            >
              <View
                style={[
                  styles.radarInnerCircle,
                  {
                    backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(9, 9, 11, 0.22)",
                  },
                ]}
              >
                <View
                  style={[
                    styles.userDotCenter,
                    {
                      backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B",
                      borderColor: theme.surface,
                    },
                  ]}
                />
              </View>
            </View>
          </Marker>

          {/* Real Road Route to Selected Station (Actual Streets & Turns) */}
          {selectedStation && activeRouteCoords.length > 0 && (
            <>
              {/* Outer shadow/glow stroke */}
              <Polyline
                coordinates={activeRouteCoords}
                strokeColor={theme.isDark ? "rgba(16, 185, 129, 0.28)" : "rgba(16, 185, 129, 0.2)"}
                strokeWidth={7}
                lineCap="round"
                lineJoin="round"
              />
              {/* Inner road route stroke in EV Emerald Green */}
              <Polyline
                coordinates={activeRouteCoords}
                strokeColor={theme.evGreen}
                strokeWidth={4.2}
                lineCap="round"
                lineJoin="round"
              />

              {/* Distance & Driving Duration Badge at Road Midpoint */}
              <Marker
                coordinate={
                  activeRouteCoords[Math.floor(activeRouteCoords.length / 2)] || {
                    latitude: (userCoords.latitude + selectedStation.latitude) / 2,
                    longitude: (userCoords.longitude + selectedStation.longitude) / 2,
                  }
                }
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  style={{
                    backgroundColor: theme.isDark ? "#18181B" : "#09090B",
                    borderColor: theme.evGreenBorder,
                    borderWidth: 1,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 10,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 4,
                    elevation: 5,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF" }}>
                    {(activeRouteDistanceKm || haversineKm(
                      userCoords.latitude,
                      userCoords.longitude,
                      selectedStation.latitude,
                      selectedStation.longitude
                    )).toFixed(1)}{" "}
                    km
                    {activeRouteDurationMin > 0 ? ` • ${activeRouteDurationMin}m` : ""}
                  </Text>
                </View>
              </Marker>

              {/* Start / Origin Marker (black circle with inner white dot) */}
              <Marker coordinate={userCoords} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.originMarkerBadge}>
                  <View style={[styles.originMarkerOuter, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" }]}>
                    <View style={[styles.originMarkerInner, { backgroundColor: theme.isDark ? "#09090B" : "#FFFFFF" }]} />
                  </View>
                </View>
              </Marker>

              {/* Destination Marker (circular halo with green EV navigation chevron badge) */}
              <Marker
                coordinate={{
                  latitude: selectedStation.latitude,
                  longitude: selectedStation.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.destMarkerHaloWrap}>
                  <View
                    style={[
                      styles.destMarkerHaloCircle,
                      {
                        backgroundColor: "rgba(16, 185, 129, 0.22)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.destMarkerInnerCircle,
                        { backgroundColor: theme.evGreen },
                      ]}
                    >
                      <Ionicons
                        name="navigate"
                        size={14}
                        color="#FFFFFF"
                      />
                    </View>
                  </View>
                </View>
              </Marker>
            </>
          )}

          {/* EV Station Badges (Black & Green EV pump/bolt icon & anchor dot beneath) */}
          {filteredStations.map((st) => {
            const isSelected = selectedStation?.id === st.id;

            return (
              <Marker
                key={st.id}
                coordinate={{ latitude: st.latitude, longitude: st.longitude }}
                onPress={() => handleSelectLocation(st)}
                anchor={{ x: 0.5, y: 0.9 }}
              >
                <View style={styles.evPinWrapper}>
                  <View
                    style={[
                      styles.evPinBadge,
                      {
                        backgroundColor: isSelected
                          ? theme.evGreen
                          : "#09090B",
                        borderColor: isSelected ? "#FFFFFF" : theme.evGreenBorder,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="ev-station"
                      size={17}
                      color={isSelected ? "#FFFFFF" : theme.evGreen}
                    />
                  </View>
                  <View
                    style={[
                      styles.evPinStemDot,
                      {
                        backgroundColor: isSelected
                          ? theme.evGreen
                          : "#09090B",
                      },
                    ]}
                  />
                </View>
              </Marker>
            );
          })}
        </MapView>
      </View>

      {/* Top Floating Bar: Back Button on left, Search Pill with Pin & Target on right */}
      <View
        style={[
          styles.floatingTopBar,
          {
            top: insets.top > 0 ? insets.top + 6 : (Platform.OS === "ios" ? 48 : 16),
          },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={[styles.topBackCircleBtn, { backgroundColor: theme.isDark ? "#27272A" : "#09090B" }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View
          style={[
            styles.topSearchCapsule,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.cardShadow,
            },
          ]}
        >
          <Ionicons name="location-outline" size={18} color={theme.text} />
          <TextInput
            style={[styles.topSearchCapsuleInput, { color: theme.text }]}
            placeholder="Search EV charging stations..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity
            style={styles.gpsCrosshairBtn}
            onPress={() => {
              mapRef.current?.animateToRegion(
                {
                  ...userCoords,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                },
                500
              );
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="navigate-circle-outline" size={21} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Section: Nearby Station header + Horizontal Carousel */}
      <View
        style={[
          styles.bottomCarouselContainer,
          {
            paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 24,
          },
        ]}
      >
        <Text style={[styles.nearbySectionTitle, { color: theme.text }]}>
          Nearby Station
        </Text>

        {loading ? (
          <EvStationsCarouselSkeleton />
        ) : filteredStations.length === 0 ? (
          <View
            style={{
              marginHorizontal: 20,
              padding: 18,
              borderRadius: 18,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: "center",
            }}
          >
            <MaterialCommunityIcons name="ev-station" size={26} color={theme.textSecondary} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text, marginTop: 6 }}>
              No EV stations found in database
            </Text>
            <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2, textAlign: "center" }}>
              Add EV charging locations and chargers to view live telemetry.
            </Text>
          </View>
        ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filteredStations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.nearbyCarouselList}
          snapToInterval={width * 0.82 + 14}
          decelerationRate="fast"
          renderItem={({ item }) => {
            const isSelected = selectedStation?.id === item.id;
            return (
              <TouchableOpacity
                style={[
                  styles.nearbyStationCard,
                  {
                    width: width * 0.82,
                    backgroundColor: theme.surface,
                    borderColor: isSelected
                      ? theme.evGreen
                      : theme.border,
                    borderWidth: isSelected ? 1.8 : 1,
                    shadowColor: theme.cardShadow,
                  },
                ]}
                onPress={() => handleSelectLocation(item)}
                activeOpacity={0.88}
              >
                {/* Station Thumbnail Image */}
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.nearbyThumbImg} />
                ) : (
                  <View
                    style={[
                      styles.nearbyThumbImg,
                      {
                        backgroundColor: theme.evGreenSoft,
                        borderWidth: 1,
                        borderColor: theme.evGreenBorder,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="ev-station" size={32} color={theme.evGreen} />
                  </View>
                )}

                {/* Right Info Column */}
                <View style={styles.nearbyInfoCol}>
                  <Text style={[styles.nearbyTitleText, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>

                  <View style={styles.nearbyMetricsRow}>
                    <View style={styles.metricItemCol}>
                      <Text style={[styles.metricLabelText, { color: theme.textSecondary }]}>
                        Distance
                      </Text>
                      <Text style={[styles.metricValText, { color: theme.text }]}>
                        {item.distance || "-"}
                      </Text>
                    </View>

                    <View style={styles.metricItemCol}>
                      <Text style={[styles.metricLabelText, { color: theme.textSecondary }]}>
                        Power
                      </Text>
                      <Text style={[styles.metricValText, { color: theme.evGreen }]}>
                        {item.chargers[0]?.max_output_kw || 0} kW
                      </Text>
                    </View>

                    <View style={styles.metricItemCol}>
                      <Text style={[styles.metricLabelText, { color: theme.textSecondary }]}>
                        Charge Rate
                      </Text>
                      <Text style={[styles.metricValText, { color: theme.evGreen }]}>
                        {item.tariff || "9k–10k RWF"}
                      </Text>
                    </View>
                  </View>

                  {/* Realtime API & Hardware Working Status Badge */}
                  <View style={styles.cardHardwareStatusRow}>
                    <View
                      style={[
                        styles.hardwareStatusDot,
                        {
                          backgroundColor: item.chargers.some((c) => c.operational_status === "faulted")
                            ? theme.danger
                            : theme.evGreen,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.hardwareStatusText,
                        {
                          color: item.chargers.some((c) => c.operational_status === "faulted")
                            ? theme.danger
                            : theme.evGreen,
                        },
                      ]}
                    >
                      {item.chargers.some(c => c.operational_status === "faulted")
                        ? "Faulted (Offline)"
                        : item.chargers.length > 0
                        ? `Working • ${item.chargers[0]?.api_provider || "OCPP 2.0.1"}`
                        : "Station Active"}
                    </Text>
                  </View>

                  {/* Black Pill Button: Map Direction */}
                  <TouchableOpacity
                    style={[
                      styles.mapDirectionBtn,
                      { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" },
                    ]}
                    onPress={() => handleFocusRoute(item)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.mapDirectionBtnText,
                        { color: theme.isDark ? "#09090B" : "#FFFFFF" },
                      ]}
                    >
                      Map Direction
                    </Text>
                    <Ionicons
                      name="git-branch-outline"
                      size={14}
                      color={theme.isDark ? "#09090B" : "#FFFFFF"}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
        )}
      </View>

      {/* BottomSheet Modal for Location Charging Spots (matching user screenshot) */}
      <Modal
        visible={!!sheetStation}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setSheetStation(null);
          setConfirmModalVisible(false);
        }}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => {
              setSheetStation(null);
              setConfirmModalVisible(false);
            }}
          />

          <View style={[styles.sheetModalContainer, { backgroundColor: theme.surface }]}>
            {/* Drag Handle */}
            <View style={styles.sheetHandleBar} />

            {/* Header: Title, Address, and Circular Close Button ( X ) */}
            <View style={styles.sheetHeaderRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.sheetStationTitle, { color: theme.text }]} numberOfLines={1}>
                    {sheetStation?.name || "EV Charging Station"}
                  </Text>
                  <View style={[styles.liveFeedBadge, { backgroundColor: theme.evGreenSoft, borderColor: theme.evGreenBorder }]}>
                    <View style={[styles.liveDot, { backgroundColor: theme.evGreen }]} />
                    <Text style={[styles.liveFeedText, { color: theme.evGreen }]}>LIVE OCPP</Text>
                  </View>
                </View>
                <Text style={[styles.sheetStationAddress, { color: theme.textSecondary }]} numberOfLines={1}>
                  {sheetStation?.address || "Kigali, Rwanda"}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.sheetCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                onPress={() => {
                  setSheetStation(null);
                  setConfirmModalVisible(false);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Horizontal Zone Selector Pills from Database */}
            {availableZones.length > 0 && (
              <View style={styles.zonePillsWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zonePillsContainer}>
                  {availableZones.map((zone) => {
                    const isActive = selectedZone === zone;
                    return (
                      <TouchableOpacity
                        key={zone}
                        style={[
                          styles.zonePill,
                          {
                            backgroundColor: "transparent",
                            borderColor: isActive ? theme.text : theme.border,
                            borderWidth: isActive ? 2 : 1,
                          },
                        ]}
                        onPress={() => handleSelectZone(zone)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.zonePillText,
                            {
                              color: isActive ? theme.text : theme.textSecondary,
                              fontWeight: isActive ? "600" : "400",
                            },
                          ]}
                        >
                          {zone}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Zone Description Subheader & 2D / 3D Aerial View Switcher */}
            <View style={{ paddingHorizontal: 20, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: theme.text }}>
                  {currentLot.title}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                  {currentLot.description}
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 14,
                  borderWidth: 1,
                  backgroundColor: is3DView ? theme.evGreen : theme.background,
                  borderColor: is3DView ? theme.evGreen : theme.border,
                }}
                onPress={() => setIs3DView(!is3DView)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={is3DView ? "cube" : "cube-outline"}
                  size={13}
                  color={is3DView ? theme.evGreenText : theme.text}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: is3DView ? theme.evGreenText : theme.text,
                  }}
                >
                  {is3DView ? "3D Aerial" : "2D Grid"}
                </Text>
              </TouchableOpacity>
            </View>

            {is3DView ? (
              <View style={{ maxHeight: 380, paddingHorizontal: 16 }}>
                <AerialParkingLot3D
                  topology={(sheetStation as any)?.layout_topology || "perpendicular"}
                  spaces={
                    sheetSpaces.length > 0
                      ? (selectedZone ? sheetSpaces.filter((s) => (s.zone_code || "EV Hub") === selectedZone) : sheetSpaces)
                      : (sheetStation?.chargers || []).map((ch) => ({
                          id: ch.id,
                          location_id: sheetStation?.id || "",
                          space_number: ch.station_identifier,
                          zone_code: selectedZone || "EV Hub",
                          space_type: "ev" as const,
                          is_occupied: ch.status !== "available",
                          qr_code_token: `QR-${ch.station_identifier}`,
                          watt_power_kw: ch.max_output_kw,
                        }))
                  }
                  selectedSpaceId={
                    sheetSpaces.find((s) => s.space_number === selectedBay)?.id || null
                  }
                  onSelectSpace={(sp) => {
                    setSelectedBay(sp.space_number);
                    setInspectedSpace(sp);
                  }}
                  currentZone={selectedZone || "EV Hub"}
                  locationName={sheetStation?.name || "EV Charging Station"}
                  lotKind="charging"
                  hideSelectionCard={true}
                  compact={true}
                />
              </View>
            ) : (
            /* 2-Column Slot Grid showing Available Spots and Parked Cars in this Zone */
            <ScrollView
              style={styles.spotsScroll}
              contentContainerStyle={styles.spotsContent}
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
              {loadingSpaces ? (
                <BayGridSkeleton count={6} />
              ) : sheetSpaces.length === 0 && (!sheetStation?.chargers || sheetStation.chargers.length === 0) ? (
                <View style={{ paddingVertical: 32, alignItems: "center" }}>
                  <Ionicons name="flash-outline" size={28} color={theme.textSecondary} />
                  <Text style={{ fontSize: 13, fontWeight: "500", color: theme.text, marginTop: 8 }}>
                    No bays registered yet
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4, textAlign: "center" }}>
                    No charging bays currently registered for this station.
                  </Text>
                </View>
              ) : (
              <View style={styles.spotsTwoColGrid}>
                {/* Left Column */}
                <View style={styles.spotsColumn}>
                  {currentLot.leftColumn.map((spot) => {
                    const matchedSpace = sheetSpaces.find((s) => s.space_number === spot.bayNumber) || {
                      id: spot.id,
                      location_id: sheetStation?.id || "",
                      space_number: spot.bayNumber,
                      zone_code: selectedZone || "EV Hub",
                      space_type: "ev" as const,
                      is_occupied: spot.isOccupied,
                      qr_code_token: `QR-${spot.bayNumber}`,
                      watt_power_kw: parseInt(spot.spotType || "120", 10) || 120,
                    };

                    if (spot.isOccupied) {
                      return (
                        <TouchableOpacity
                          key={spot.id}
                          activeOpacity={0.8}
                          onPress={() => setInspectedSpace(matchedSpace)}
                          style={[
                            styles.spotOccupiedBox,
                            { backgroundColor: theme.background, borderColor: theme.border },
                          ]}
                        >
                          <HorizontalUltraRealisticCar color={spot.carColor} />
                          <View style={{ position: "absolute", bottom: 2, right: 6, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                            <Ionicons name="flash" size={8} color="#10B981" />
                            <Text style={{ fontSize: 8, fontWeight: "700", color: "#10B981" }}>CHARGING</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }
                    const isSelected = selectedBay === spot.bayNumber;
                    return (
                      <TouchableOpacity
                        key={spot.id}
                        style={[
                          styles.spotAvailableCard,
                          {
                            backgroundColor: theme.background,
                            borderColor: isSelected ? theme.evGreen : theme.evGreenBorder,
                            borderWidth: isSelected ? 2.5 : 1,
                          },
                        ]}
                        onPress={() => {
                          setSelectedBay(spot.bayNumber);
                          setInspectedSpace(matchedSpace);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                          <Text style={[styles.spotNumberText, { color: theme.text }]}>
                            Bay {spot.bayNumber}
                          </Text>
                          <View style={[styles.livePulseMiniDot, { backgroundColor: theme.evGreen }]} />
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
                          <Ionicons name="flash" size={10} color={theme.evGreen} />
                          <Text style={{ fontSize: 10, fontWeight: "500", color: theme.evGreen }}>
                            {spot.spotType || "DC Fast"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 9.5, fontWeight: "500", color: theme.textSecondary, marginTop: 2 }}>
                          9k–10k RWF • 0 Park
                        </Text>
                        {isSelected && (
                          <View style={[styles.selectedCheckDot, { backgroundColor: theme.evGreen }]}>
                            <Ionicons name="checkmark" size={10} color={theme.evGreenText} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Right Column */}
                <View style={styles.spotsColumn}>
                  {currentLot.rightColumn.map((spot) => {
                    const matchedSpace = sheetSpaces.find((s) => s.space_number === spot.bayNumber) || {
                      id: spot.id,
                      location_id: sheetStation?.id || "",
                      space_number: spot.bayNumber,
                      zone_code: selectedZone || "EV Hub",
                      space_type: "ev" as const,
                      is_occupied: spot.isOccupied,
                      qr_code_token: `QR-${spot.bayNumber}`,
                      watt_power_kw: parseInt(spot.spotType || "120", 10) || 120,
                    };

                    if (spot.isOccupied) {
                      return (
                        <TouchableOpacity
                          key={spot.id}
                          activeOpacity={0.8}
                          onPress={() => setInspectedSpace(matchedSpace)}
                          style={[
                            styles.spotOccupiedBox,
                            { backgroundColor: theme.background, borderColor: theme.border },
                          ]}
                        >
                          <HorizontalUltraRealisticCar color={spot.carColor} />
                          <View style={{ position: "absolute", bottom: 2, right: 6, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                            <Ionicons name="flash" size={8} color="#10B981" />
                            <Text style={{ fontSize: 8, fontWeight: "700", color: "#10B981" }}>CHARGING</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }
                    const isSelected = selectedBay === spot.bayNumber;
                    return (
                      <TouchableOpacity
                        key={spot.id}
                        style={[
                          styles.spotAvailableCard,
                          {
                            backgroundColor: theme.background,
                            borderColor: isSelected ? theme.evGreen : theme.evGreenBorder,
                            borderWidth: isSelected ? 2.5 : 1,
                          },
                        ]}
                        onPress={() => {
                          setSelectedBay(spot.bayNumber);
                          setInspectedSpace(matchedSpace);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                          <Text style={[styles.spotNumberText, { color: theme.text }]}>
                            Bay {spot.bayNumber}
                          </Text>
                          <View style={[styles.livePulseMiniDot, { backgroundColor: theme.evGreen }]} />
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
                          <Ionicons name="flash" size={10} color={theme.evGreen} />
                          <Text style={{ fontSize: 10, fontWeight: "500", color: theme.evGreen }}>
                            {spot.spotType || "DC Fast"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 9.5, fontWeight: "500", color: theme.textSecondary, marginTop: 2 }}>
                          9k–10k RWF • 0 Park
                        </Text>
                        {isSelected && (
                          <View style={[styles.selectedCheckDot, { backgroundColor: theme.evGreen }]}>
                            <Ionicons name="checkmark" size={10} color={theme.evGreenText} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              )}
            </ScrollView>
            )}

            {/* Bottom Sticky Continue Button with Right Arrow Circle */}
            <View style={[styles.sheetStickyBottomBar, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
              <TouchableOpacity
                disabled={!selectedBay && (!sheetStation?.chargers || sheetStation.chargers.length === 0)}
                style={[
                  styles.sheetContinuePillBtn,
                  {
                    backgroundColor: theme.primaryBtnBg,
                    opacity: !selectedBay && (!sheetStation?.chargers || sheetStation.chargers.length === 0) ? 0.5 : 1,
                  },
                ]}
                onPress={() => {
                  if (!selectedBay && sheetStation?.chargers?.[0]?.station_identifier) {
                    setSelectedBay(sheetStation.chargers[0].station_identifier);
                  }
                  setConfirmModalVisible(true);
                }}
                activeOpacity={0.88}
              >
                <Text style={[styles.sheetContinueBtnText, { color: theme.primaryBtnText }]}>Continue</Text>
                <View style={[styles.circleArrowBtnBox, { backgroundColor: theme.background }]}>
                  <Ionicons name="arrow-forward" size={16} color={theme.text} />
                </View>
              </TouchableOpacity>
            </View>

            {/* EV Stall Telemetry & Pre-payment Inspection Modal */}
            {inspectedSpace && sheetStation && (
              <EvBayDetailModal
                locationId={sheetStation.id}
                space={inspectedSpace}
                chargers={sheetStation.chargers || []}
                onClose={() => setInspectedSpace(null)}
                onStartCharging={(details) => {
                  setInspectedSpace(null);
                  setSelectedBay(details.bayNumber);
                  setConfirmModalVisible(true);
                }}
              />
            )}

            {/* Sub-sheet / Nested Confirm Booking Sheet */}
            {confirmModalVisible && (
              <View style={styles.confirmSubSheetOverlay}>
                <View style={[styles.confirmSubSheetCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.sheetHandleBar} />

                  <View style={styles.confirmHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.confirmHeaderTitle, { color: theme.text }]}>Confirm booking</Text>
                      <Text style={[styles.confirmHeaderSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                        {sheetStation?.name}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.sheetCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                      onPress={() => setConfirmModalVisible(false)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close" size={18} color={theme.text} />
                    </TouchableOpacity>
                  </View>

                  {/* Two Badges: Charging zone & Charging bay */}
                  <View style={styles.confirmBadgesRow}>
                    <View style={[styles.confirmBadgeBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <Text style={[styles.confirmBadgeLabel, { color: theme.textSecondary }]}>Charging zone</Text>
                      <Text style={[styles.confirmBadgeValue, { color: theme.text }]}>{selectedZone || "EV Hub"}</Text>
                    </View>

                    <View style={[styles.confirmBadgeBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <Text style={[styles.confirmBadgeLabel, { color: theme.textSecondary }]}>Charging bay</Text>
                      <Text style={[styles.confirmBadgeValue, { color: theme.text }]}>{selectedBay || "-"}</Text>
                    </View>
                  </View>

                  {/* Charger Hardware & Plug Specification Details */}
                  {(() => {
                    const matchedCharger =
                      sheetStation?.chargers?.find((c) => c.station_identifier === selectedBay) ||
                      sheetStation?.chargers?.[0];
                    const plug = matchedCharger?.connector_type || "CCS2 DC Fast";
                    const kw = matchedCharger?.max_output_kw || 120;
                    const compatible = isPlugCompatible(driverVehicle.plugType, plug);

                    const est = estimateChargingForVehicle({
                      chargerKw: kw,
                      connectorType: plug,
                      batteryCapacityKwh: driverVehicle.batteryCapacityKwh,
                      currentSocPercent: driverVehicle.batteryLevelPercent,
                    });

                    return (
                      <View style={{ gap: 8, marginBottom: 14 }}>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <View style={{ flex: 1, padding: 8, borderRadius: 10, borderWidth: 1, backgroundColor: theme.background, borderColor: theme.border, alignItems: "center" }}>
                            <Text style={{ fontSize: 9.5, color: theme.textSecondary }}>Plug Type</Text>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text, marginTop: 2 }}>{plug}</Text>
                          </View>
                          <View style={{ flex: 1, padding: 8, borderRadius: 10, borderWidth: 1, backgroundColor: theme.background, borderColor: theme.border, alignItems: "center" }}>
                            <Text style={{ fontSize: 9.5, color: theme.textSecondary }}>Peak Output</Text>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text, marginTop: 2 }}>{kw} kW</Text>
                          </View>
                          <View style={{ flex: 1, padding: 8, borderRadius: 10, borderWidth: 1, backgroundColor: theme.background, borderColor: theme.border, alignItems: "center" }}>
                            <Text style={{ fontSize: 9.5, color: theme.textSecondary }}>Est. to 80%</Text>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text, marginTop: 2 }}>
                              {driverVehicle.batteryCapacityKwh > 0 ? formatDurationMins(est.minutesTo80) : "~25m"}
                            </Text>
                          </View>
                        </View>

                        {compatible === false && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, padding: 6, borderRadius: 8, backgroundColor: "rgba(239, 68, 68, 0.08)", borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.3)" }}>
                            <Ionicons name="warning-outline" size={12} color="#EF4444" />
                            <Text style={{ fontSize: 10, color: "#EF4444", flex: 1 }}>
                              Plug mismatch: car has {driverVehicle.plugType}, bay has {plug}. An adapter is required.
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Separated Charging vs Parking Breakdown Banner */}
                  <View style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Ionicons name="flash" size={13} color={theme.evGreen} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text }}>
                        EV Charging (Separated from Parking)
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 16 }}>
                      • <Text style={{ fontWeight: "600", color: theme.text }}>9,000 RWF</Text> session charging fee{"\n"}
                      • <Text style={{ fontWeight: "500", color: theme.textSecondary }}>Mobile Money (0790889899)</Text>{"\n"}
                      • <Text style={{ fontWeight: "500", color: theme.text }}>0 RWF</Text> parking fee for active EV charging
                    </Text>
                  </View>

                  {/* Payment Row */}
                  <View style={styles.confirmPaymentSection}>
                    <Text style={[styles.confirmPaymentLabel, { color: theme.textSecondary }]}>Direct Payment</Text>
                    <View
                      style={[styles.confirmPaymentCard, { backgroundColor: theme.background, borderColor: theme.border }]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Ionicons name="phone-portrait-outline" size={20} color={theme.text} />
                        <Text style={[styles.confirmPaymentText, { color: theme.text }]}>
                          Mobile Payment (0790889899)
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Price & Confirm Button Row */}
                  <View style={styles.confirmBottomActionRow}>
                    <View>
                      <Text style={[styles.confirmPriceNumber, { color: theme.text }]}>9,000 RWF</Text>
                      <Text style={[styles.confirmPriceUnit, { color: theme.textSecondary, fontWeight: "500" }]}>Session charging fee (0 RWF Park)</Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.confirmFinalBtn, { backgroundColor: theme.primaryBtnBg, flexDirection: "row", alignItems: "center", gap: 6 }]}
                      onPress={async () => {
                        const sName = sheetStation?.name || "";
                        const sLocId = sheetStation?.id || "";
                        const sBay = selectedBay || sheetStation?.chargers?.[0]?.station_identifier || "";
                        const matchedCharger =
                          sheetStation?.chargers?.find((c) => c.station_identifier === sBay) ||
                          sheetStation?.chargers?.[0];
                        const isElectric = driverVehicle.vehicleType === "ev";

                        if (!isElectric) {
                          Alert.alert(
                            "Unauthorized EV Bay Parking",
                            `Your active vehicle (${driverVehicle.makeModel || "Combustion"} • ${driverVehicle.plateNumber || "No plate"}) is not an electric vehicle.\n\nParking in an EV charging stall while not an EV incurs a 5,000 RWF municipal contravention fine.`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Accept Fine (5,000 RWF)",
                                style: "destructive",
                                onPress: async () => {
                                  await issueZeroContactCitation({
                                    plateNumber: driverVehicle.plateNumber || "UNREGISTERED",
                                    locationId: sLocId,
                                    reason: "unauthorized_ev",
                                    fineAmount: 5000,
                                  });
                                  setConfirmModalVisible(false);
                                  setSheetStation(null);
                                  Alert.alert(
                                    "Citation Issued",
                                    `A 5,000 RWF fine has been recorded against ${driverVehicle.plateNumber || "your vehicle"} for unauthorized EV stall occupancy.`
                                  );
                                },
                              },
                            ]
                          );
                          return;
                        }

                        setConfirmModalVisible(false);
                        const maxKw = matchedCharger?.max_output_kw || 120;
                        const evBill = 9000;

                        // Automatically initiate payment in background
                        initiateMobilePayment(evBill).catch(() => {});

                        setSheetStation(null);
                        router.push({
                          pathname: "/charging_receipt",
                          params: {
                            locationId: sLocId,
                            chargerId: matchedCharger?.id || "",
                            name: sName,
                            bayNumber: sBay,
                            plate: driverVehicle.plateNumber || "EV",
                            powerKw: String(maxKw),
                            soc: String(driverVehicle.batteryLevelPercent || 20),
                            currency: "RWF",
                            durationHours: "1",
                            durationMinutes: "60",
                            durationSeconds: "3600",
                            billAmount: String(evBill),
                            receiptNumber: `PZ-EV-${Date.now().toString().slice(-4)}`,
                          },
                        });
                      }}
                      activeOpacity={0.88}
                    >
                      <Ionicons name="card-outline" size={15} color={theme.primaryBtnText} />
                      <Text style={[styles.confirmFinalBtnText, { color: theme.primaryBtnText }]}>Pay Now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default EVChargers;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingHeaderContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  floatingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 10,
    backgroundColor: "transparent",
  },
  headerTitleCenter: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "transparent",
  },
  headerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBrandLogo: {
    width: 26,
    height: 26,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "400",
  },
  liveFeedBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  livePulseMiniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveFeedText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  cardHardwareStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    marginBottom: 8,
  },
  hardwareStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  hardwareStatusText: {
    fontSize: 10,
    fontWeight: "400",
  },

  /* View Mode Switcher */
  layoutToggleWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  layoutToggleContainer: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
  },
  layoutToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 11,
    gap: 6,
  },
  layoutToggleBtnActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  layoutToggleText: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* Search */
  searchWrapper: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  searchInner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },

  /* Filters */
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "500",
  },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Map Mode */
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  evMapPin: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 4,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  evMapPinText: {
    fontSize: 11,
    fontWeight: "500",
  },
  evPinCountBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  evPinCountText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "500",
  },
  mapBottomCard: {
    position: "absolute",
    bottom: 28,
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  mapCardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  mapCardTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  mapCardAddress: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "400",
  },
  mapCardTariffBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mapCardTariffText: {
    fontSize: 10,
    fontWeight: "500",
  },
  mapPlugsScroll: {
    flexDirection: "row",
  },
  mapPlugItem: {
    width: 145,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    marginRight: 10,
  },
  mapPlugId: {
    fontSize: 12,
    fontWeight: "500",
  },
  mapPlugStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  mapPlugSpecs: {
    fontSize: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  mapPlugReserveBtn: {
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  mapPlugReserveText: {
    fontSize: 10,
    fontWeight: "500",
  },

  /* Grid Layout Mode */
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 110,
  },
  gridRow: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  gridCard: {
    width: (width - 44) / 2,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  gridCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  gridPowerBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  gridPowerText: {
    fontSize: 10,
    fontWeight: "500",
  },
  gridStatusPill: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gridStatusPillText: {
    fontSize: 9,
    fontWeight: "500",
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: "600",
    minHeight: 34,
    marginBottom: 2,
  },
  gridAddress: {
    fontSize: 10,
    marginBottom: 8,
  },
  gridMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  gridDistance: {
    fontSize: 10,
    fontWeight: "400",
  },
  gridTariff: {
    fontSize: 9,
    fontWeight: "500",
  },
  gridPlugsRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  gridPlugChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  gridPlugChipText: {
    fontSize: 8,
    fontWeight: "500",
  },
  gridCtaBtn: {
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: "center",
  },
  gridCtaBtnText: {
    fontSize: 11,
    fontWeight: "500",
  },

  /* List Mode */
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 110,
  },
  stationCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  stationName: {
    fontSize: 15,
    fontWeight: "600",
  },
  stationAddress: {
    fontSize: 11,
    marginTop: 2,
  },
  stationKwhBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  stationKwhText: {
    fontSize: 10,
    fontWeight: "500",
  },
  chargersContainer: {
    flexDirection: "row",
    gap: 8,
  },
  chargerBox: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
  },
  chargerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  chargerIdentifier: {
    fontSize: 11,
    fontWeight: "500",
  },
  statusIndicator: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "500",
  },
  chargerSpecs: {
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 2,
  },
  chargerTelemetry: {
    fontSize: 9,
    marginBottom: 8,
  },
  reserveBtn: {
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  reserveBtnText: {
    fontSize: 10,
    fontWeight: "500",
  },

  emptyContainer: {
    marginTop: 50,
    alignItems: "center",
    paddingHorizontal: 30,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "400",
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
  },

  /* Header Back Button */
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Horizontal Top Down Car Vector */
  horizCarBox: {
    width: 78,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  horizCarWheelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 60,
  },
  horizWheel: {
    width: 12,
    height: 6,
    borderRadius: 3,
  },
  horizCarBody: {
    width: 72,
    height: 30,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    marginVertical: -1,
  },
  horizCarGlass: {
    width: 7,
    height: 22,
    borderRadius: 2,
  },
  horizCarRoof: {
    width: 28,
    height: 22,
    borderRadius: 4,
  },

  /* BottomSheet Modal Styles */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetModalContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "88%",
    minHeight: "65%",
    paddingTop: 12,
    position: "relative",
  },
  sheetHandleBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#A1A1AA",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sheetStationTitle: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  sheetStationAddress: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "400",
  },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Zone Pills */
  zonePillsWrapper: {
    marginBottom: 14,
  },
  zonePillsContainer: {
    paddingHorizontal: 20,
    gap: 8,
  },
  zonePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  zonePillText: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* 2-Column Slot Grid */
  spotsScroll: {
    flexGrow: 0,
    maxHeight: 340,
    paddingHorizontal: 20,
  },
  spotsContent: {
    paddingBottom: 16,
  },
  spotsTwoColGrid: {
    flexDirection: "row",
    gap: 14,
  },
  spotsColumn: {
    flex: 1,
    gap: 12,
  },
  spotAvailableCard: {
    height: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  selectedCheckDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  spotNumberText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  spotAvailableText: {
    fontSize: 10,
    fontWeight: "400",
    marginTop: 1,
  },
  spotOccupiedBox: {
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Bottom Sticky Continue Bar */
  sheetStickyBottomBar: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 34 : 18,
  },
  sheetContinuePillBtn: {
    height: 54,
    borderRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    position: "relative",
  },
  sheetContinueBtnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  circleArrowBtnBox: {
    position: "absolute",
    right: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Nested Confirm Booking Sub-sheet */
  confirmSubSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  confirmSubSheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  confirmHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  confirmHeaderTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  confirmHeaderSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  confirmBadgesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  confirmBadgeBox: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
  },
  confirmBadgeLabel: {
    fontSize: 11,
    fontWeight: "400",
    marginBottom: 4,
  },
  confirmBadgeValue: {
    fontSize: 18,
    fontWeight: "500",
  },
  confirmPaymentSection: {
    marginBottom: 20,
  },
  confirmPaymentLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 8,
  },
  confirmPaymentCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  confirmPaymentText: {
    fontSize: 13,
    fontWeight: "500",
  },
  confirmBottomActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  confirmPriceNumber: {
    fontSize: 22,
    fontWeight: "600",
  },
  confirmPriceUnit: {
    fontSize: 11,
    fontWeight: "400",
  },
  confirmFinalBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmFinalBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  /* Screenshot Map Styles */
  radarOuterCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(9, 9, 11, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  radarInnerCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(9, 9, 11, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  userDotCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#09090B",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  distanceBadgePill: {
    backgroundColor: "#09090B",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  distanceBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "500",
  },
  markerContainer: {
    alignItems: "center",
  },
  rateBubble: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  rateBubbleActive: {
    backgroundColor: "#09090B",
  },
  rateBubbleInactive: {
    backgroundColor: "#18181B",
  },
  rateBubbleText: {
    fontSize: 12,
    fontWeight: "500",
  },
  rateBubbleTextActive: {
    color: "#FFFFFF",
  },
  rateBubbleTextInactive: {
    color: "#FFFFFF",
  },
  pinStemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },
  pinStemDotActive: {
    backgroundColor: "#09090B",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  pinStemDotInactive: {
    backgroundColor: "#71717A",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  floatingTopContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 20,
  },
  screenshotSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  searchBackBtn: {
    padding: 6,
    marginRight: 6,
  },
  screenshotSearchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "400",
  },
  searchIconBtn: {
    padding: 6,
  },
  categoryPillsScroll: {
    marginTop: 10,
  },
  categoryPillsContent: {
    gap: 8,
    paddingRight: 10,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryPillText: {
    fontSize: 13,
  },
  screenshotBottomCard: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 34 : 20,
    left: 16,
    right: 16,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 20,
  },
  bottomCardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bottomCardTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  bottomCardAddress: {
    fontSize: 12,
    marginTop: 3,
  },
  bookmarkBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 12,
    gap: 8,
  },
  statBadgeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statBadgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  statDotSeparator: {
    color: "#A1A1AA",
    fontSize: 12,
  },
  aerialPhotoContainer: {
    height: 125,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  aerialPhotoImg: {
    width: "100%",
    height: "100%",
  },
  carouselDotsContainer: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  carouselDotActive: {
    backgroundColor: "#FFFFFF",
    width: 14,
  },
  choosePlaceBtn: {
    backgroundColor: "#09090B",
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    shadowColor: "rgba(0, 0, 0, 0.25)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  choosePlaceBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  /* Reference Screenshot Map UI Styles */
  originMarkerBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  originMarkerOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  originMarkerInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  destMarkerHaloWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  destMarkerHaloCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  destMarkerInnerCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  evPinWrapper: {
    alignItems: "center",
  },
  evPinBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  evPinStemDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 2,
  },
  floatingTopBar: {
    position: "absolute",
    left: 18,
    right: 18,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  topBackCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  topSearchCapsule: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  topSearchCapsuleInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
  },
  gpsCrosshairBtn: {
    padding: 4,
  },
  bottomCarouselContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  nearbySectionTitle: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.4,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  nearbyCarouselList: {
    paddingHorizontal: 20,
    gap: 14,
  },
  nearbyStationCard: {
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  nearbyThumbImg: {
    width: 90,
    height: 90,
    borderRadius: 18,
  },
  nearbyInfoCol: {
    flex: 1,
    justifyContent: "space-between",
  },
  nearbyTitleText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  nearbyMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 10,
  },
  metricItemCol: {
    minWidth: 50,
  },
  metricLabelText: {
    fontSize: 11,
    fontWeight: "400",
    marginBottom: 2,
  },
  metricValText: {
    fontSize: 12,
    fontWeight: "500",
  },
  mapDirectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  mapDirectionBtnText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
