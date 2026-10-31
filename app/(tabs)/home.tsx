import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons, Feather } from "@expo/vector-icons";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import ConfettiCannon from "react-native-confetti-cannon";
import { supabase } from "../lib/supabase";
import {
  AgentAuditResponse,
  calculateParkingFee,
  completeParkingSession,
  DbEvStationItem,
  DbPaymentMethodRecord,
  dismissUserNotification,
  EvChargerTelemetry,
  fetchActiveParkingTicket,
  fetchAllEvStationsWithChargers,
  fetchEvChargers,
  fetchLocationReviews,
  fetchParkingLocations,
  fetchSpotsForLocation,
  fetchUserNotifications,
  fetchUserParkingHistory,
  fetchUserPaymentMethods,
  fetchUserVehicles,
  fetchWalletBalance,
  flagOverdueInvoice,
  issueZeroContactCitation,
  LocationReview,
  lookupSpaceByQrOrNumber,
  markAllNotificationsRead,
  ParkingLocation,
  ParkingSpace,
  RegisteredVehicle,
  startParkingSession,
  submitLocationReview,
  TopologyType,
  updateWalletBalance,
  verifyPlateStatus,
  subscribeToSpacesRealtime,
  resolveParkedCarColor,
} from "../services/parking";
import { VoiceGuidance } from "../services/voiceGuidance";
import { initiateMobilePayment } from "../services/mobilePayment";
import { useDriverVehicle } from "../../hooks/useDriverVehicle";
import { useTheme } from "../../hooks/useTheme";
import {
  HorizontalUltraRealisticCar,
  VerticalUltraRealisticCar,
} from "../../components/UltraRealisticCar";
import { AerialParkingLot3D } from "../../components/AerialParkingLot3D";
import { DynamicIslandParking } from "../../components/DynamicIslandParking";
import { BayGridSkeleton, HomeDiscoverySkeleton } from "../../components/SkeletonLoader";
import { EvBayDetailModal } from "../../components/EvBayDetailModal";
import { evaluateBayAccess } from "../services/bayPolicy";
import {
  ChargerBayDetails,
  estimateChargingForVehicle,
  formatDurationMins,
  isPlugCompatible,
} from "../services/evCharging";
import { notifyParkingStarted, clearParkingNotifications } from "../services/notifications";
import { ParkingHistoryRecord } from "../recent_parkings";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const width = SCREEN_WIDTH;

const KIGALI_REGION = {
  latitude: -1.9536,
  longitude: 30.0606,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const USER_COORDS = {
  latitude: -1.9575,
  longitude: 30.0580,
};

const getSteppedRoute = (start: { latitude: number; longitude: number }, end: { latitude: number; longitude: number }) => {
  const dLat = end.latitude - start.latitude;
  const dLon = end.longitude - start.longitude;
  return [
    start,
    { latitude: start.latitude + dLat * 0.25, longitude: start.longitude },
    { latitude: start.latitude + dLat * 0.25, longitude: start.longitude + dLon * 0.5 },
    { latitude: start.latitude + dLat * 0.75, longitude: start.longitude + dLon * 0.5 },
    { latitude: start.latitude + dLat * 0.75, longitude: end.longitude },
    end,
  ];
};

import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from "../../constants/mapStyles";
import { fetchRealRoadRoute, LatLng } from "../services/roadRouting";

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Google Gemini signature 4-color aurora palette (Blue, Violet, Coral-Rose, Sky-Cyan)
const GEMINI_AI_COLORS = ["#4285F4", "#9B72CB", "#D96570", "#38BDF8"] as const;
const AI_BW_BORDER_COLORS_DARK = GEMINI_AI_COLORS;
const AI_BW_BORDER_COLORS_LIGHT = GEMINI_AI_COLORS;

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface AnimatedBwGradientCardProps {
  active: boolean;
  isThinking?: boolean;
  borderRadius?: number;
  borderWidth?: number;
  style?: any;
  contentStyle?: any;
  animValue?: Animated.Value;
  colorAnimValue?: Animated.Value;
  onPress?: () => void;
  activeOpacity?: number;
  children: React.ReactNode;
}

const AnimatedBwGradientCard: React.FC<AnimatedBwGradientCardProps> = ({
  active,
  isThinking = false,
  borderRadius = 20,
  borderWidth = 2,
  style,
  animValue,
  colorAnimValue,
  onPress,
  activeOpacity = 0.88,
  children,
}) => {
  const uid = useRef(`gem_${Math.random().toString(36).slice(2, 8)}`).current;
  const localAnim = useRef(new Animated.Value(0)).current;
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!active || animValue) return;
    const loop = Animated.loop(
      Animated.timing(localAnim, {
        toValue: 1,
        duration: isThinking ? 1800 : 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, animValue, isThinking, localAnim]);

  if (!active) {
    if (onPress) {
      return (
        <TouchableOpacity style={style} onPress={onPress} activeOpacity={activeOpacity}>
          {children}
        </TouchableOpacity>
      );
    }
    return <View style={style}>{children}</View>;
  }

  const effectiveBorderWidth = isThinking ? Math.max(borderWidth + 0.8, 2.6) : borderWidth;
  const driver = animValue || localAnim;

  const layerBOpacity = driver.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0, 1, 0.25, 0],
  });

  const layerCOpacity = driver.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0, 0.25, 1, 0],
  });

  const fallbackBorderColor = colorAnimValue
    ? colorAnimValue.interpolate({
        inputRange: [0, 0.25, 0.5, 0.75, 1],
        outputRange: [
          GEMINI_AI_COLORS[0],
          GEMINI_AI_COLORS[1],
          GEMINI_AI_COLORS[2],
          GEMINI_AI_COLORS[3],
          GEMINI_AI_COLORS[0],
        ],
      })
    : GEMINI_AI_COLORS[0];

  const Component = onPress ? TouchableOpacity : View;
  const touchProps = onPress ? { onPress, activeOpacity } : {};
  const halfStroke = effectiveBorderWidth / 2;
  const rectW = Math.max(0, cardSize.width - effectiveBorderWidth);
  const rectH = Math.max(0, cardSize.height - effectiveBorderWidth);
  const rectRx = Math.max(0, borderRadius - halfStroke);

  return (
    <Component
      {...touchProps}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (Math.abs(w - cardSize.width) > 0.5 || Math.abs(h - cardSize.height) > 0.5) {
          setCardSize({ width: w, height: h });
        }
      }}
      style={[
        style,
        {
          position: "relative",
          borderColor: "transparent",
          shadowColor: "#9B72CB",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isThinking ? 0.48 : 0.22,
          shadowRadius: isThinking ? 14 : 7,
          elevation: isThinking ? 7 : 3,
        },
      ]}
    >
      {children}

      {cardSize.width > 0 && cardSize.height > 0 ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          {/* Base Gemini Multi-Color Layer A */}
          <Svg width={cardSize.width} height={cardSize.height} style={StyleSheet.absoluteFillObject}>
            <Defs>
              <LinearGradient id={`${uid}_a`} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#4285F4" />
                <Stop offset="34%" stopColor="#9B72CB" />
                <Stop offset="68%" stopColor="#D96570" />
                <Stop offset="100%" stopColor="#38BDF8" />
              </LinearGradient>
            </Defs>
            <Rect
              x={halfStroke}
              y={halfStroke}
              width={rectW}
              height={rectH}
              rx={rectRx}
              ry={rectRx}
              fill="none"
              stroke={`url(#${uid}_a)`}
              strokeWidth={effectiveBorderWidth}
            />
          </Svg>

          {/* Animated Flowing Gemini Layer B */}
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: layerBOpacity }]}>
            <Svg width={cardSize.width} height={cardSize.height}>
              <Defs>
                <LinearGradient id={`${uid}_b`} x1="100%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor="#9B72CB" />
                  <Stop offset="34%" stopColor="#D96570" />
                  <Stop offset="68%" stopColor="#38BDF8" />
                  <Stop offset="100%" stopColor="#4285F4" />
                </LinearGradient>
              </Defs>
              <Rect
                x={halfStroke}
                y={halfStroke}
                width={rectW}
                height={rectH}
                rx={rectRx}
                ry={rectRx}
                fill="none"
                stroke={`url(#${uid}_b)`}
                strokeWidth={effectiveBorderWidth}
              />
            </Svg>
          </Animated.View>

          {/* Animated Flowing Gemini Layer C */}
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: layerCOpacity }]}>
            <Svg width={cardSize.width} height={cardSize.height}>
              <Defs>
                <LinearGradient id={`${uid}_c`} x1="0%" y1="100%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor="#38BDF8" />
                  <Stop offset="34%" stopColor="#4285F4" />
                  <Stop offset="68%" stopColor="#9B72CB" />
                  <Stop offset="100%" stopColor="#D96570" />
                </LinearGradient>
              </Defs>
              <Rect
                x={halfStroke}
                y={halfStroke}
                width={rectW}
                height={rectH}
                rx={rectRx}
                ry={rectRx}
                fill="none"
                stroke={`url(#${uid}_c)`}
                strokeWidth={effectiveBorderWidth}
              />
            </Svg>
          </Animated.View>
        </View>
      ) : (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius,
              borderWidth: effectiveBorderWidth,
              borderColor: fallbackBorderColor,
            },
          ]}
        />
      )}
    </Component>
  );
};

export interface AppNotificationItem {
  id: string;
  category: "Parking" | "AI Radar" | "Billing" | "System";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  actionText?: string;
  actionType?: "active_session" | "ai_lot" | "receipt";
}

type RecentParkingItem = ParkingHistoryRecord;

/**
 * Top-down horizontal car graphic matching parking bays in user screenshot
 */
const HorizontalCarGraphic = () => {
  return (
    <View style={styles.horizCarBox}>
      {/* Top Wheels */}
      <View style={styles.horizCarWheelsRow}>
        <View style={styles.horizWheel} />
        <View style={styles.horizWheel} />
      </View>
      {/* Car Body */}
      <View style={styles.horizCarBody}>
        <View style={styles.horizCarGlassLeft} />
        <View style={styles.horizCarRoof} />
        <View style={styles.horizCarGlassRight} />
      </View>
      {/* Bottom Wheels */}
      <View style={styles.horizCarWheelsRow}>
        <View style={styles.horizWheel} />
        <View style={styles.horizWheel} />
      </View>
    </View>
  );
};

/**
 * Top-down sleek aero car vector for parking bays matching reference
 */
const TopDownCarGraphic = ({ isDark = false }: { isDark?: boolean }) => {
  const carBg = isDark ? "#2A2A30" : "#D4D4D8";
  const glassBg = isDark ? "#121214" : "#71717A";
  const roofBg = isDark ? "#1F1F24" : "#A1A1AA";

  return (
    <View style={styles.topDownCarBox}>
      <View style={styles.carWheelRow}>
        <View style={styles.carWheel} />
        <View style={styles.carWheel} />
      </View>
      <View style={[styles.carBodyMain, { backgroundColor: carBg }]}>
        <View style={[styles.carGlassFront, { backgroundColor: glassBg }]} />
        <View style={[styles.carRoof, { backgroundColor: roofBg }]} />
        <View style={[styles.carGlassRear, { backgroundColor: glassBg }]} />
      </View>
      <View style={styles.carWheelRow}>
        <View style={styles.carWheel} />
        <View style={styles.carWheel} />
      </View>
    </View>
  );
};

export default function Home() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { vehicle: driverVehicle } = useDriverVehicle();

  // Real-time GPS Location & Voice State
  const [userLocationName, setUserLocationName] = useState("Locating...");
  const [userCoordinates, setUserCoordinates] = useState(USER_COORDS);
  const [isVoiceMuted, setIsVoiceMuted] = useState(VoiceGuidance.getIsMuted());
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [evStations, setEvStations] = useState<DbEvStationItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<DbPaymentMethodRecord[]>([]);

  // GPS Location Fetching (with graceful fallback when Simulator/GPS has no fix)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        let coords = (await Location.getLastKnownPositionAsync())?.coords || null;
        if (!coords) {
          try {
            const current = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            coords = current?.coords || null;
          } catch {
            // Simulator or indoor GPS fix unavailable (kCLErrorDomain error 0) — keep default Kigali coords silently
          }
        }

        if (coords) {
          setUserCoordinates({
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          try {
            const reverse = await Location.reverseGeocodeAsync({
              latitude: coords.latitude,
              longitude: coords.longitude,
            });
            if (reverse && reverse.length > 0) {
              const place = reverse[0];
              const addr = [place.street, place.district || place.city].filter(Boolean).join(", ");
              if (addr) setUserLocationName(addr);
            }
          } catch {
            // Ignore reverse geocode failure when offline or unsupported
          }
        }
      } catch {
        // Permission or location provider unavailable — keep default coordinates silently
      }
    })();
  }, []);

  // Core Data (100% Database-driven)
  const [locations, setLocations] = useState<ParkingLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<ParkingLocation | null>(null);
  const [currentFloor, setCurrentFloor] = useState("All ˅");
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<ParkingSpace | null>(null);

  // Navigation View Modes: "discovery" (Home Screen) | "park_details" (Screen 3) | "slot_selection" (Screen 1)
  const [viewMode, setViewMode] = useState<"discovery" | "park_details" | "slot_selection">("discovery");
  const [selectedCategory, setSelectedCategory] = useState<"car" | "ev" | "truck" | "scooter">("car");
  const [detailsTab, setDetailsTab] = useState<"about" | "slots" | "reviews">("about");
  const [durationHours, setDurationHours] = useState(2);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMapView, setShowMapView] = useState(false);

  // Live Location Reviews State
  const [locationReviews, setLocationReviews] = useState<LocationReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewComment, setNewReviewComment] = useState("");
  const [selectedReviewTags, setSelectedReviewTags] = useState<string[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Active Ticket & Session
  const [activeTicket, setActiveTicket] = useState<{
    id: string;
    spaceId?: string;
    plate: string;
    entryTime: Date;
    spaceNumber: string;
    locationName: string;
    durationHours: number;
    hourlyRate: number;
    violationFine?: number;
    violationReason?: string;
    isPrepaid?: boolean;
    paidAmount?: number;
    prepaidHours?: number;
  } | null>(null);
  const [currentTick, setCurrentTick] = useState(Date.now());
  const [ParkingBalance, setParkingBalance] = useState("0");
  const params = useLocalSearchParams<{ scannedBay?: string; scannedLocation?: string }>();

  // Dynamic Parking Time calculations based on user's active session
  const totalParkingSeconds = activeTicket ? Math.max(1, (activeTicket.durationHours || 1) * 3600) : 3600;
  const elapsedSeconds = activeTicket
    ? Math.max(0, Math.floor((currentTick - new Date(activeTicket.entryTime).getTime()) / 1000))
    : 0;
  const remainingSeconds = Math.max(0, totalParkingSeconds - elapsedSeconds);
  const isOverdue = elapsedSeconds > totalParkingSeconds;
  const progressPercent = Math.min(100, Math.max(0, (elapsedSeconds / totalParkingSeconds) * 100));

  // Live timer interval that runs only when parking is active
  useEffect(() => {
    if (!activeTicket) return;
    const timer = setInterval(() => {
      setCurrentTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [activeTicket]);

  // Real-time Subscription for Selected Location Parking Spaces
  useEffect(() => {
    if (!selectedLocation?.id) {
      setSpaces([]);
      setSelectedSpace(null);
      return;
    }

    let active = true;
    setLoadingSpaces(true);
    fetchSpotsForLocation(selectedLocation.id)
      .then((liveSpots) => {
        if (!active) return;
        setSpaces(liveSpots);
        const firstFree = liveSpots.find((s) => !s.is_occupied);
        setSelectedSpace(firstFree || liveSpots[0] || null);
      })
      .finally(() => {
        if (active) setLoadingSpaces(false);
      });

    const unsubscribe = subscribeToSpacesRealtime(selectedLocation.id, (updatedSpace) => {
      setSpaces((prev) =>
        prev.map((s) => (s.id === updatedSpace.id ? { ...s, ...updatedSpace } : s))
      );
      if (updatedSpace.is_occupied) {
        VoiceGuidance.announceRealtimeOccupancyChange(updatedSpace.space_number || "Bay", true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [selectedLocation?.id]);

  // Registered Vehicles
  const [selectedVehicle, setSelectedVehicle] = useState<RegisteredVehicle | null>(null);

  // Vehicle eligibility determinations
  const isVehicleElectric =
    selectedVehicle?.vehicle_type === "ev" ||
    driverVehicle?.vehicleType === "ev" ||
    Boolean(selectedVehicle?.brand?.toLowerCase().includes("tesla")) ||
    Boolean(selectedVehicle?.brand?.toLowerCase().includes("byd"));

  const isVehicleHandicap =
    selectedVehicle?.vehicle_type === "handicap" ||
    driverVehicle?.parkingPermitType === "Handicap Concession" ||
    Boolean(selectedVehicle?.handicap_permit_number);

  // Details View in-lot search query
  const [detailsSearchQuery, setDetailsSearchQuery] = useState("");

  // Strict Vehicle Eligibility Filter
  const eligibleLocations: ParkingLocation[] = React.useMemo(() => {
    return locations.filter((loc) => {
      if (loc.is_electric_station && !isVehicleElectric) return false;
      if (loc.is_handicap_facility && !isVehicleHandicap) return false;
      return true;
    });
  }, [locations, isVehicleElectric, isVehicleHandicap]);

  // Zone filter, interactive spot selection bottom sheet & confirm modal
  const [activeZoneFilter, setActiveZoneFilter] = useState("All zones");

  // Dynamic Parking History state
  const [recentParkingsList, setRecentParkingsList] = useState<ParkingHistoryRecord[]>([]);

  // AI Mode State & Multi-Second AI Thinking & Scan Animation
  const [isAiMode, setIsAiMode] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const aiScanAnim = useRef(new Animated.Value(0)).current;
  const aiOverlayOpacity = useRef(new Animated.Value(0)).current;
  const aiBorderRotateAnim = useRef(new Animated.Value(0)).current;
  const aiBorderColorAnim = useRef(new Animated.Value(0)).current;

  // Animate gradient black and white borders when AI mode or thinking is engaged
  useEffect(() => {
    if (isAiMode || isAiThinking) {
      const rotateAnim = Animated.loop(
        Animated.timing(aiBorderRotateAnim, {
          toValue: 1,
          duration: isAiThinking ? 2000 : 3500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      const colorAnim = Animated.loop(
        Animated.timing(aiBorderColorAnim, {
          toValue: 1,
          duration: isAiThinking ? 1600 : 3200,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      );
      rotateAnim.start();
      colorAnim.start();
      return () => {
        rotateAnim.stop();
        colorAnim.stop();
      };
    } else {
      aiBorderRotateAnim.setValue(0);
      aiBorderColorAnim.setValue(0);
    }
  }, [isAiMode, isAiThinking]);

  // Dynamic Google Gemini color interpolation for the AI Mode button & accents
  const animatedAiBtnBorderColor = aiBorderColorAnim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ["#4285F4", "#9B72CB", "#D96570", "#38BDF8", "#4285F4"],
  });

  // Previous average parking rate computed from user history
  const previousAverageRate = useMemo(() => {
    if (!recentParkingsList || recentParkingsList.length === 0) return 300;
    const rates = recentParkingsList
      .map((r: any) => r.hourly_rate || (r.amount && r.amount > 0 ? Math.round(r.amount / 2) : 300))
      .filter((n: number) => Boolean(n) && n > 0);
    if (rates.length === 0) return 300;
    const sum = rates.reduce((a: number, b: number) => a + b, 0);
    return Math.round(sum / rates.length);
  }, [recentParkingsList]);

  // Trigger AI Thinking phase lasting ~3 seconds with active border animations indicating AI calculation
  const handleToggleAiMode = () => {
    if (isAiMode || isAiThinking) {
      setIsAiMode(false);
      setIsAiThinking(false);
      setIsAiScanning(false);
      return;
    }

    // Step 1: Engage AI Thinking & Deciding state with animated borders across cards
    setIsAiThinking(true);
    setIsAiScanning(true);
    aiScanAnim.setValue(0);
    aiOverlayOpacity.setValue(1);
    VoiceGuidance.speak("AI Mode engaged. Analyzing vehicle specifications and real-time bay telemetry.", "high");

    // Dynamic 3-second thinking & holographic scan wave
    Animated.parallel([
      Animated.timing(aiScanAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(aiOverlayOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setIsAiScanning(false);
      setIsAiThinking(false);
      setIsAiMode(true);
      const targetModel = driverVehicle?.makeModel || selectedVehicle?.model || "vehicle";
      const isEV = driverVehicle?.vehicleType === "ev" || isVehicleElectric;
      const rec = isEV
        ? `Tuned for ${targetModel}. Recommend EV Superhub with 120 kilowatt fast charging.`
        : `Tuned for ${targetModel}. Recommend closest low-cost bay.`;
      VoiceGuidance.speak(rec, "high");
    });
  };

  // Functional Zone & Search Filtering + AI Recommendation Sorting
  const displayedParkingLocations: ParkingLocation[] = React.useMemo(() => {
    const filtered = locations.filter((loc) => {
      // Zone Filter Check
      if (activeZoneFilter !== "All zones") {
        const zoneLower = activeZoneFilter.toLowerCase();
        const locZoneLower = (loc.zone_code || "").toLowerCase();
        const locNameLower = (loc.name || "").toLowerCase();
        const locAddrLower = (loc.address || "").toLowerCase();

        const matchesZone =
          locZoneLower === zoneLower ||
          (zoneLower === "zone a" && (loc.is_electric_station || locZoneLower.includes("a"))) ||
          (zoneLower === "zone b" && locZoneLower.includes("b")) ||
          (zoneLower === "zone c" && locZoneLower.includes("c")) ||
          (zoneLower === "zone d" && locZoneLower.includes("d")) ||
          (zoneLower === "zone e" && (loc.is_handicap_facility || locZoneLower.includes("e")));
        if (!matchesZone) return false;
      }

      // Search Query Check
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = loc.name?.toLowerCase().includes(q);
        const matchesAddr = loc.address?.toLowerCase().includes(q);
        const matchesCity = loc.city?.toLowerCase().includes(q);
        const matchesZone = loc.zone_code?.toLowerCase().includes(q);
        const matchesRate = `${loc.hourly_rate || ""}`.includes(q);
        if (!matchesName && !matchesAddr && !matchesCity && !matchesZone && !matchesRate) {
          return false;
        }
      }

      return true;
    });

    if (!isAiMode) return filtered;

    // AI Mode Active: Score and sort based on vehicle specifications, previous parking amount & cheap AI balances
    return [...filtered].sort((a, b) => {
      const rateA = a.hourly_rate || 300;
      const rateB = b.hourly_rate || 300;

      // Base scoring: cheaper rates get highest points
      let scoreA = 100 - (rateA / 10);
      let scoreB = 100 - (rateB / 10);

      // Cheap AI Balances bonus
      if (rateA <= 250) scoreA += 45;
      else if (rateA <= 300) scoreA += 35;
      else if (rateA <= 350) scoreA += 20;

      if (rateB <= 250) scoreB += 45;
      else if (rateB <= 300) scoreB += 35;
      else if (rateB <= 350) scoreB += 20;

      // Previous parking amount match (reward rates equal to or cheaper than user's historic average)
      if (rateA <= previousAverageRate) scoreA += 30;
      if (rateB <= previousAverageRate) scoreB += 30;

      // Vehicle specifications match
      if (isVehicleElectric) {
        if (a.is_electric_station) scoreA += 60;
        if (b.is_electric_station) scoreB += 60;
      } else if (isVehicleHandicap) {
        if (a.is_handicap_facility) scoreA += 60;
        if (b.is_handicap_facility) scoreB += 60;
      } else {
        // Standard gasoline / sedan / SUV: penalize restricted bays
        if (a.is_electric_station || a.is_handicap_facility) scoreA -= 70;
        if (b.is_electric_station || b.is_handicap_facility) scoreB -= 70;
      }

      return scoreB - scoreA;
    });
  }, [locations, activeZoneFilter, searchQuery, isAiMode, isVehicleElectric, isVehicleHandicap, previousAverageRate]);

  // Functional Search Filtering for Recent Parkings:
  const filteredRecentParkings: ParkingHistoryRecord[] = React.useMemo(() => {
    if (!searchQuery.trim()) return recentParkingsList;
    const q = searchQuery.toLowerCase().trim();
    return recentParkingsList.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.address.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        item.bayNumber.toLowerCase().includes(q) ||
        item.plate.toLowerCase().includes(q)
    );
  }, [recentParkingsList, searchQuery]);

  // Camera & Scanner State
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [scannerTorch, setScannerTorch] = useState(false);
  const [scannedSpaceInfo, setScannedSpaceInfo] = useState<{
    spaceId?: string;
    locationId?: string;
    spaceType?: "regular" | "ev" | "handicap";
    wattPowerKw?: number;
    spaceNumber: string;
    zoneName: string;
    locationName: string;
    imageUrl?: string;
    status: "available" | "occupied" | "reserved";
    hourlyRate: number;
    token: string;
  } | null>(null);

  // Bottom sheet spot selection & confirm modal
  const [selectedParkForSheet, setSelectedParkForSheet] = useState<ParkingLocation | null>(null);
  const [sheetSpaces, setSheetSpaces] = useState<ParkingSpace[]>([]);
  const [loadingSheetSpaces, setLoadingSheetSpaces] = useState(false);
  const [selectedSheetZone, setSelectedSheetZone] = useState<string>("");
  const [selectedSheetBay, setSelectedSheetBay] = useState<string>("");
  const [sheetIs3DView, setSheetIs3DView] = useState(false);
  const [inspectedSheetSpace, setInspectedSheetSpace] = useState<ParkingSpace | null>(null);

  useEffect(() => {
    if (!selectedParkForSheet?.id) {
      setSheetSpaces([]);
      return;
    }
    let mounted = true;
    setLoadingSheetSpaces(true);
    fetchSpotsForLocation(selectedParkForSheet.id)
      .then((spots) => {
        if (!mounted) return;
        setSheetSpaces(spots);
        const zones = Array.from(new Set(spots.map((s) => s.zone_code || "Zone A")));
        const preferredZone =
          selectedParkForSheet.zone_code && zones.includes(selectedParkForSheet.zone_code)
            ? selectedParkForSheet.zone_code
            : zones[0] || "";
        setSelectedSheetZone(preferredZone);
        const firstFree = spots.find(
          (s) => !s.is_occupied && (!preferredZone || (s.zone_code || "Zone A") === preferredZone)
        );
        setSelectedSheetBay(firstFree?.space_number || spots[0]?.space_number || "");
      })
      .finally(() => {
        if (mounted) setLoadingSheetSpaces(false);
      });

    const unsub = subscribeToSpacesRealtime(selectedParkForSheet.id, (updated) => {
      setSheetSpaces((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
      );
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [selectedParkForSheet?.id]);

  const sheetAvailableZones = useMemo(() => {
    return Array.from(new Set(sheetSpaces.map((s) => s.zone_code || "Zone A")));
  }, [sheetSpaces]);

  const handleSelectSheetZone = (zone: string) => {
    setSelectedSheetZone(zone);
    const inZone = sheetSpaces.filter((s) => (s.zone_code || "Zone A") === zone);
    const firstAvailable = inZone.find((s) => !s.is_occupied);
    if (firstAvailable) {
      setSelectedSheetBay(firstAvailable.space_number);
    } else if (inZone[0]) {
      setSelectedSheetBay(inZone[0].space_number);
    }
  };

  const currentSheetLot = useMemo(() => {
    const filtered = selectedSheetZone
      ? sheetSpaces.filter((s) => (s.zone_code || "Zone A") === selectedSheetZone)
      : sheetSpaces;
    const mapped = filtered.map((s) => ({
      id: s.id,
      bayNumber: s.space_number,
      isOccupied: s.is_occupied,
      spaceType: s.space_type,
      topology: s.topology || (s.space_type === "handicap" ? "wide" : selectedParkForSheet?.layout_topology || "perpendicular"),
      carColor: s.car_color || resolveParkedCarColor(`${selectedParkForSheet?.id}-${s.zone_code}-${s.space_number}`),
      spotType:
        s.spot_label ||
        (s.space_type === "ev"
          ? `${s.watt_power_kw || 120}kW EV`
          : s.space_type === "handicap"
          ? "Accessible"
          : "Available"),
    }));
    const mid = Math.ceil(mapped.length / 2);
    return {
      title: selectedSheetZone || selectedParkForSheet?.name || "Parking Bays",
      description:
        mapped.length > 0
          ? `${mapped.filter((m) => !m.isOccupied).length} of ${mapped.length} bays vacant`
          : "No bays registered for this facility yet",
      leftColumn: mapped.slice(0, mid),
      rightColumn: mapped.slice(mid),
    };
  }, [sheetSpaces, selectedSheetZone, selectedParkForSheet?.name, selectedParkForSheet?.id]);

  interface BookingSuccessDetails {
    locationName: string;
    bayNumber: string;
    zone: string;
    durationHours: number;
    totalCost: number;
    hourlyRate: number;
    fineAmount?: number;
    fineReason?: string;
    ticketId?: string;
    isEv?: boolean;
  }

  const [confirmBookingSheetVisible, setConfirmBookingSheetVisible] = useState(false);
  const [bookingSuccessModalVisible, setBookingSuccessModalVisible] = useState(false);
  const [bookingSuccessData, setBookingSuccessData] = useState<BookingSuccessDetails | null>(null);

  // Success Celebration Animation Values
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successFadeAnim = useRef(new Animated.Value(0)).current;
  const successPulseAnim = useRef(new Animated.Value(0)).current;
  const successCheckAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (bookingSuccessModalVisible) {
      successScaleAnim.setValue(0);
      successFadeAnim.setValue(0);
      successPulseAnim.setValue(0);
      successCheckAnim.setValue(0);

      Animated.parallel([
        Animated.timing(successFadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(successScaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(120),
          Animated.spring(successCheckAnim, {
            toValue: 1,
            friction: 4,
            tension: 55,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(successPulseAnim, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(successPulseAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      return () => {
        pulseLoop.stop();
      };
    }
  }, [bookingSuccessModalVisible]);
  const [mapStationSheetVisible, setMapStationSheetVisible] = useState(false);
  const [selectedMapLocation, setSelectedMapLocation] = useState<ParkingLocation | null>(null);
  const [activeRouteCoords, setActiveRouteCoords] = useState<LatLng[]>([]);
  const [activeRouteDistanceKm, setActiveRouteDistanceKm] = useState<number>(0);
  const [activeRouteDurationMin, setActiveRouteDurationMin] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;
    if (selectedMapLocation && userCoordinates) {
      const dest = {
        latitude: Number(selectedMapLocation.latitude),
        longitude: Number(selectedMapLocation.longitude),
      };
      fetchRealRoadRoute(userCoordinates, dest).then((res) => {
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
  }, [selectedMapLocation, userCoordinates]);

  const [mapCategory, setMapCategory] = useState<string>("car");
  const [mapSearch, setMapSearch] = useState<string>("");
  const [mapBookmarked, setMapBookmarked] = useState<Record<string, boolean>>({});

  // Aux Modals
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [manualQrCode, setManualQrCode] = useState("");
  const [agentModalVisible, setAgentModalVisible] = useState(false);
  const [agentPlateInput, setAgentPlateInput] = useState("");
  const [agentAudit, setAgentAudit] = useState<AgentAuditResponse | null>(null);
  const [agentSearching, setAgentSearching] = useState(false);

  // Notifications Modal State (Full Screen)
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [notificationsList, setNotificationsList] = useState<AppNotificationItem[]>([]);
  const [notifFilter, setNotifFilter] = useState<"All" | "Parking" | "AI Radar" | "Billing" | "System">("All");

  const unreadNotifsCount = useMemo(() => {
    return notificationsList.filter((n) => !n.read).length;
  }, [notificationsList]);

  const filteredNotifications = useMemo(() => {
    if (notifFilter === "All") return notificationsList;
    return notificationsList.filter((n) => n.category === notifFilter);
  }, [notificationsList, notifFilter]);

  const handleMarkAllNotifsAsRead = async () => {
    setNotificationsList((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead();
  };

  const handleDismissNotification = async (id: string) => {
    setNotificationsList((prev) => prev.filter((n) => n.id !== id));
    await dismissUserNotification(id);
  };

  const handleNotificationAction = (item: AppNotificationItem) => {
    setNotificationsList((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
    setNotificationsModalVisible(false);

    if (item.actionType === "active_session") {
      // Keep discovery view with active session visible
    } else if (item.actionType === "ai_lot") {
      setIsAiMode(true);
      const targetLot = locations[0];
      if (targetLot) {
        setSelectedParkForSheet(targetLot);
      }
    } else if (item.actionType === "receipt") {
      router.push("/recent_parkings");
    }
  };

  const navigation = useNavigation();

  // Hide bottom tabs whenever any bottom sheet, modal, or non-discovery view is active
  useEffect(() => {
    const isSheetOrModalActive =
      Boolean(selectedParkForSheet) ||
      confirmBookingSheetVisible ||
      bookingSuccessModalVisible ||
      mapStationSheetVisible ||
      qrScannerVisible ||
      qrModalVisible ||
      agentModalVisible ||
      notificationsModalVisible ||
      reviewModalVisible ||
      showMapView ||
      viewMode !== "discovery";

    if (isSheetOrModalActive) {
      navigation.setOptions({ tabBarStyle: { display: "none" } });
      navigation.getParent()?.setOptions({ tabBarStyle: { display: "none" } });
    } else {
      navigation.setOptions({ tabBarStyle: undefined });
      navigation.getParent()?.setOptions({ tabBarStyle: undefined });
    }

    return () => {
      navigation.setOptions({ tabBarStyle: undefined });
      navigation.getParent()?.setOptions({ tabBarStyle: undefined });
    };
  }, [
    navigation,
    selectedParkForSheet,
    confirmBookingSheetVisible,
    bookingSuccessModalVisible,
    mapStationSheetVisible,
    qrScannerVisible,
    qrModalVisible,
    agentModalVisible,
    notificationsModalVisible,
    reviewModalVisible,
    showMapView,
    viewMode,
  ]);

  const [refreshing, setRefreshing] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const initData = useCallback(async () => {
    try {
      const [fetchedLocs, fetchedEvStations] = await Promise.all([
        fetchParkingLocations(),
        fetchAllEvStationsWithChargers(),
      ]);
      setLocations(fetchedLocs);
      setEvStations(fetchedEvStations);
      setSelectedLocation((prev) => {
        if (prev && fetchedLocs.some((l) => l.id === prev.id)) {
          return fetchedLocs.find((l) => l.id === prev.id) || null;
        }
        return fetchedLocs[0] || null;
      });
      setSelectedMapLocation((prev) => {
        if (prev && fetchedLocs.some((l) => l.id === prev.id)) {
          return fetchedLocs.find((l) => l.id === prev.id) || null;
        }
        return fetchedLocs[0] || null;
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const [vehicles, balance, liveTicket, history, notifs, methods, profileRes, cachedAvatar] = await Promise.all([
          fetchUserVehicles(user.id),
          fetchWalletBalance(user.id),
          fetchActiveParkingTicket(user.id),
          fetchUserParkingHistory(user.id),
          fetchUserNotifications(user.id),
          fetchUserPaymentMethods(user.id),
          supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle(),
          AsyncStorage.getItem("@parkzone_avatar_uri"),
        ]);

        const resolvedAvatar = cachedAvatar || profileRes?.data?.avatar_url || "";
        setAvatarUrl(resolvedAvatar);
        setSelectedVehicle(vehicles[0] || null);
        setParkingBalance(balance.toLocaleString());
        setRecentParkingsList(history as ParkingHistoryRecord[]);
        setNotificationsList(
          notifs.map((n) => ({
            ...n,
            icon: (n.icon as keyof typeof Ionicons.glyphMap) || "notifications-outline",
          }))
        );
        setPaymentMethods(methods);

        if (liveTicket) {
          const loc = Array.isArray(liveTicket.parking_locations)
            ? liveTicket.parking_locations[0]
            : liveTicket.parking_locations;
          const sp = Array.isArray(liveTicket.parking_spaces)
            ? liveTicket.parking_spaces[0]
            : liveTicket.parking_spaces;
          const rate = Number(liveTicket.hourly_rate) || Number(loc?.hourly_rate) || 300;
          const total = Number(liveTicket.total_amount) || rate;
          const hrs = Number(liveTicket.hours_elapsed) > 0
            ? Number(liveTicket.hours_elapsed)
            : Math.max(1, Math.round((Number(liveTicket.amount_paid) || total) / rate));
          setActiveTicket({
            id: liveTicket.id,
            spaceId: liveTicket.space_id || sp?.id,
            plate: liveTicket.vehicle_plate,
            entryTime: new Date(liveTicket.entry_time),
            spaceNumber: sp?.space_number || "-",
            locationName: loc?.name || "Parking Facility",
            durationHours: hrs,
            hourlyRate: rate,
            isPrepaid: true,
            paidAmount: total,
            prepaidHours: hrs,
          });
          setCurrentTick(Date.now());
        } else {
          setActiveTicket(null);
        }
      } else {
        setSelectedVehicle(null);
        setParkingBalance("0");
        setRecentParkingsList([]);
        setNotificationsList([]);
        setPaymentMethods([]);
        setActiveTicket(null);
      }
    } catch (e) {
      console.warn("initData error:", e);
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      initData();
    }, [initData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await initData();
    setRefreshing(false);
  }, [initData]);

  const formatTimerDigits = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")} Hrs`;
  };

  const loadLocationReviews = useCallback(async (locId: string) => {
    setLoadingReviews(true);
    try {
      const list = await fetchLocationReviews(locId);
      setLocationReviews(list);
    } catch {
      setLocationReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  }, []);

  const handleOpenParkDetails = (loc: ParkingLocation) => {
    setSelectedLocation(loc);
    setViewMode("park_details");
    loadLocationReviews(loc.id);
  };

  useEffect(() => {
    if (selectedLocation?.id && detailsTab === "reviews") {
      loadLocationReviews(selectedLocation.id);
    }
  }, [selectedLocation?.id, detailsTab, loadLocationReviews]);

  const handleSubmitReview = async () => {
    if (!newReviewComment.trim()) {
      Alert.alert("Missing Review", "Please write a brief comment describing your parking experience.");
      return;
    }
    if (!selectedLocation?.id) return;

    setSubmittingReview(true);
    try {
      const res = await submitLocationReview({
        locationId: selectedLocation.id,
        rating: newReviewRating,
        comment: newReviewComment.trim(),
        tags: selectedReviewTags,
      });

      if (res.error) {
        Alert.alert("Review Error", res.error);
      } else {
        Alert.alert("Review Published", "Thank you! Your verified motorist review has been saved to the database.");
        setNewReviewComment("");
        setSelectedReviewTags([]);
        setNewReviewRating(5);
        setReviewModalVisible(false);
        await loadLocationReviews(selectedLocation.id);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not publish review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleProceedToSlots = () => {
    setViewMode("slot_selection");
  };

  const handleSelectSlot = (sp: ParkingSpace) => {
    if (sp.space_type === "ev" && !isVehicleElectric) {
      Alert.alert(
        "EV Lot Restricted",
        `Bay ${sp.space_number} is strictly reserved for Electric Vehicles (EV). Your vehicle (${selectedVehicle?.brand || "Car"}) is non-electric.\n\nUnauthorized parking in this EV lot incurs an immediate 5,000 RWF Municipal Contravention Fine. Do you want to select this bay anyway and accept the fine?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Accept 5,000 RWF Fine",
            style: "destructive",
            onPress: () => setSelectedSpace(sp),
          },
        ]
      );
      return;
    }
    if (sp.space_type === "handicap" && !isVehicleHandicap) {
      Alert.alert(
        "Accessible Lot Restricted",
        `Bay ${sp.space_number} is strictly reserved for drivers with an authorized handicap permit.\n\nUnauthorized parking in this handicap lot incurs an immediate 10,000 RWF Municipal Citation. Do you want to select this bay anyway and accept the fine?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Accept 10,000 RWF Fine",
            style: "destructive",
            onPress: () => setSelectedSpace(sp),
          },
        ]
      );
      return;
    }
    setSelectedSpace(sp);
  };

  const handleConfirmPayment = async () => {
    if (!selectedSpace || !selectedLocation) {
      Alert.alert("Select Spot", "Please tap an available spot.");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in to start a parking session.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/sign-in") },
      ]);
      return;
    }

    const activePlate =
      selectedVehicle?.plate_number || driverVehicle?.plateNumber || "";
    if (!activePlate) {
      Alert.alert("Vehicle Required", "Please register a vehicle before booking a bay.", [
        { text: "Cancel", style: "cancel" },
        { text: "Add Vehicle", onPress: () => router.push("/(tabs)/vehicles") },
      ]);
      return;
    }

    let fineAmount = 0;
    let fineReason = "";
    if (selectedSpace.space_type === "ev" && !isVehicleElectric) {
      fineAmount = 5000;
      fineReason = "Unauthorized Non-EV in EV Bay";
    } else if (selectedSpace.space_type === "handicap" && !isVehicleHandicap) {
      fineAmount = 10000;
      fineReason = "Unauthorized Vehicle in Accessible Bay";
    }

    const isEvSpot = selectedSpace.space_type === "ev";

    if (isEvSpot && isVehicleElectric) {
      setViewMode("discovery");
      const evBill = 9000;
      initiateMobilePayment(evBill).catch(() => {});
      router.push({
        pathname: "/charging_receipt",
        params: {
          locationId: selectedLocation.id,
          chargerId: selectedSpace.id,
          name: selectedLocation.name,
          bayNumber: selectedSpace.space_number,
          plate: activePlate,
          powerKw: String(selectedSpace.watt_power_kw || 120),
          soc: String(driverVehicle?.batteryLevelPercent || 20),
          flatRateFull: "10000",
          flatRateQuick: "9000",
          currency: "RWF",
          billAmount: String(evBill),
          isPaid: "true",
          receiptNumber: `PZ-EV-${Date.now().toString().slice(-4)}`,
        },
      });
      return;
    }

    const exactHours = durationHours || 2;
    const baseCost = (selectedLocation.hourly_rate || 300) * exactHours;
    const totalCost = baseCost + fineAmount;

    // Trigger mobile payment in the background for standard parking
    initiateMobilePayment(totalCost).catch(() => {});

    const sessionRes = await startParkingSession({
      userId: user.id,
      vehicleId: selectedVehicle?.id,
      vehiclePlate: activePlate,
      locationId: selectedLocation.id,
      spaceId: selectedSpace.id,
      qrToken: selectedSpace.qr_code_token || `QR-${selectedSpace.space_number}`,
      hourlyRate: selectedLocation.hourly_rate || 300,
      durationHours: exactHours,
      totalAmount: totalCost,
      paymentStatus: "paid",
    });

    if (sessionRes.error || !sessionRes.data) {
      Alert.alert("Booking Failed", sessionRes.error || "Unable to create ticket in database.");
      return;
    }

    await supabase
      .from("parking_tickets")
      .update({
        total_amount: totalCost,
        hourly_rate: selectedLocation.hourly_rate || 300,
        amount_paid: totalCost,
        payment_status: "paid",
        hours_elapsed: exactHours,
      })
      .eq("id", sessionRes.data.id);

    if (fineAmount > 0) {
      await issueZeroContactCitation({
        plateNumber: activePlate,
        locationId: selectedLocation.id,
        spaceId: selectedSpace.id,
        reason: fineReason,
      });
    }

    const currentNum = parseInt(ParkingBalance.replace(/,/g, ""), 10) || 0;
    const updatedBalance = Math.max(0, currentNum - totalCost);
    await updateWalletBalance(updatedBalance, user.id);
    setParkingBalance(updatedBalance.toLocaleString());

    notifyParkingStarted(selectedSpace.space_number, selectedLocation.name, durationHours || 2);
    await initData();
    setViewMode("discovery");

    if (fineAmount > 0) {
      Alert.alert(
        "Contravention Fine Applied",
        `Spot ${selectedSpace.space_number} reserved. A ${fineAmount.toLocaleString()} RWF fine (${fineReason}) has been recorded.`
      );
    } else {
      Alert.alert(
        "Parking Started",
        `Spot ${selectedSpace.space_number} at ${selectedLocation.name} is reserved for ${durationHours} hours (${totalCost.toLocaleString()} RWF).`
      );
    }
  };

  const handleEndParkingSession = () => {
    if (!activeTicket) return;
    const prepaidHours = activeTicket.prepaidHours || activeTicket.durationHours || 1;
    const elapsedHours = Math.ceil(elapsedSeconds / 3600);
    const extraHours = Math.max(0, elapsedHours - prepaidHours);
    const overdueCost = extraHours * (activeTicket.hourlyRate || 300);

    if (overdueCost === 0) {
      Alert.alert(
        "Close Booking",
        `Spot: ${activeTicket.spaceNumber} (${activeTicket.locationName})\nElapsed Time: ${formatTimerDigits(elapsedSeconds)}\nBooked Duration: ${prepaidHours} Hour(s)\nTotal Extra Due: 0 RWF`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Close Booking",
            onPress: async () => {
              clearParkingNotifications();
              const finalCost = activeTicket.paidAmount || prepaidHours * (activeTicket.hourlyRate || 300);
              await completeParkingSession({
                ticketId: activeTicket.id,
                spaceId: activeTicket.spaceId,
                paymentMethod: "wallet",
                amount: finalCost,
              });
              setActiveTicket(null);
              await initData();
              Alert.alert("Booking Closed", "Parking session finished and synced to database.");
            },
          },
        ]
      );
    } else {
      Alert.alert(
        "Overdue Booking",
        `Spot: ${activeTicket.spaceNumber} (${activeTicket.locationName})\nElapsed Time: ${formatTimerDigits(elapsedSeconds)}\nPre-paid Duration: ${prepaidHours} Hour(s)\nOverstay: +${extraHours} Hour(s)\nTotal Extra Due: ${overdueCost.toLocaleString()} RWF`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Pay ${overdueCost.toLocaleString()} RWF & Close`,
            style: "destructive",
            onPress: async () => {
              const currentNum = parseInt(ParkingBalance.replace(/,/g, ""), 10) || 0;
              const updated = Math.max(0, currentNum - overdueCost);
              await updateWalletBalance(updated);
              setParkingBalance(updated.toLocaleString());
              clearParkingNotifications();
              const finalCost = (activeTicket.paidAmount || 0) + overdueCost;
              await completeParkingSession({
                ticketId: activeTicket.id,
                spaceId: activeTicket.spaceId,
                paymentMethod: "wallet",
                amount: finalCost,
              });
              setActiveTicket(null);
              await initData();
              Alert.alert("Booking Closed", `Parking session finished. ${overdueCost.toLocaleString()} RWF overdue fee settled.`);
            },
          },
        ]
      );
    }
  };

  const handleExtendParkingTime = async (addedHours: number = 1) => {
    if (!activeTicket) return;
    const newHours = activeTicket.durationHours + addedHours;
    const newTotal = newHours * (activeTicket.hourlyRate || 300);
    await supabase
      .from("parking_tickets")
      .update({ total_amount: newTotal })
      .eq("id", activeTicket.id);
    setActiveTicket((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        durationHours: newHours,
        prepaidHours: (prev.prepaidHours || prev.durationHours) + addedHours,
      };
    });
    Alert.alert("Time Extended", `Added ${addedHours} hour(s) to your parking time.`);
  };

  const handleBarcodeScanned = async (result: { data?: string }) => {
    const rawData = result?.data?.trim();
    if (!rawData) return;

    const found = await lookupSpaceByQrOrNumber(rawData);
    if (!found) {
      Alert.alert("Bay Not Found", `No parking bay matching "${rawData}" was found in the database.`);
      return;
    }

    const loc = Array.isArray((found as any).parking_locations)
      ? (found as any).parking_locations[0]
      : (found as any).parking_locations;

    setScannedSpaceInfo({
      spaceId: found.id,
      locationId: found.location_id,
      spaceType: found.space_type,
      wattPowerKw: found.watt_power_kw,
      spaceNumber: found.space_number,
      zoneName: found.zone_code || "Zone A",
      locationName: loc?.name || "Parking Facility",
      imageUrl: found.image_url || loc?.image_url || undefined,
      status: found.is_occupied ? "occupied" : "available",
      hourlyRate: Number(loc?.hourly_rate) || 300,
      token: found.qr_code_token || rawData,
    });
  };

  const handleParkScannedSpot = async () => {
    if (!scannedSpaceInfo) return;
    if (scannedSpaceInfo.status === "occupied") {
      Alert.alert("Bay Occupied", `Bay ${scannedSpaceInfo.spaceNumber} is currently occupied.`);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in to start a parking session.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/sign-in") },
      ]);
      return;
    }

    const activePlate = selectedVehicle?.plate_number || driverVehicle?.plateNumber || "";
    if (!activePlate) {
      Alert.alert("Vehicle Required", "Please register a vehicle before booking a bay.", [
        { text: "Cancel", style: "cancel" },
        { text: "Add Vehicle", onPress: () => router.push("/(tabs)/vehicles") },
      ]);
      return;
    }

    let fineAmount = 0;
    let fineReason = "";
    const isEvSpot = scannedSpaceInfo.spaceType === "ev";
    const isHandicapSpot = scannedSpaceInfo.spaceType === "handicap";

    if (isEvSpot && !isVehicleElectric) {
      fineAmount = 5000;
      fineReason = "Unauthorized Non-EV in EV Bay";
    } else if (isHandicapSpot && !isVehicleHandicap) {
      fineAmount = 10000;
      fineReason = "Unauthorized Vehicle in Accessible Bay";
    }

    if (isEvSpot && isVehicleElectric) {
      const targetName = scannedSpaceInfo.locationName;
      const targetBay = scannedSpaceInfo.spaceNumber;
      const targetLocId = scannedSpaceInfo.locationId || "";
      const kw = scannedSpaceInfo.wattPowerKw || 120;
      setScannedSpaceInfo(null);
      setQrScannerVisible(false);
      router.push({
        pathname: "/ev_charging",
        params: {
          locationId: targetLocId,
          name: targetName,
          bayNumber: targetBay,
          plate: activePlate,
          powerKw: String(kw),
          soc: String(driverVehicle?.batteryLevelPercent || 20),
          flatRateFull: "10000",
          flatRateQuick: "9000",
          currency: "RWF",
        },
      });
      return;
    }

    const baseCost = (scannedSpaceInfo.hourlyRate || 300) * (durationHours || 2);
    const totalCost = baseCost + fineAmount;

    // Trigger mobile payment in the background for scanned parking check-in
    initiateMobilePayment(totalCost).catch(() => {});

    if (!scannedSpaceInfo.locationId) {
      Alert.alert("Invalid Location", "Scanned bay has no linked parking location.");
      return;
    }

    const exactHours = durationHours || 2;
    const sessionRes = await startParkingSession({
      userId: user.id,
      vehicleId: selectedVehicle?.id,
      vehiclePlate: activePlate,
      locationId: scannedSpaceInfo.locationId,
      spaceId: scannedSpaceInfo.spaceId,
      qrToken: scannedSpaceInfo.token,
      hourlyRate: scannedSpaceInfo.hourlyRate || 300,
      durationHours: exactHours,
      totalAmount: totalCost,
      paymentStatus: "paid",
    });

    if (sessionRes.error || !sessionRes.data) {
      Alert.alert("Booking Failed", sessionRes.error || "Unable to start session in database.");
      return;
    }

    await supabase
      .from("parking_tickets")
      .update({
        total_amount: totalCost,
        hourly_rate: scannedSpaceInfo.hourlyRate || 300,
        amount_paid: totalCost,
        payment_status: "paid",
        hours_elapsed: exactHours,
      })
      .eq("id", sessionRes.data.id);

    if (fineAmount > 0) {
      await issueZeroContactCitation({
        plateNumber: activePlate,
        locationId: scannedSpaceInfo.locationId,
        spaceId: scannedSpaceInfo.spaceId,
        reason: fineReason,
      });
    }

    const currentNum = parseInt(ParkingBalance.replace(/,/g, ""), 10) || 0;
    const updatedBalance = Math.max(0, currentNum - totalCost);
    await updateWalletBalance(updatedBalance, user.id);
    setParkingBalance(updatedBalance.toLocaleString());

    notifyParkingStarted(scannedSpaceInfo.spaceNumber, scannedSpaceInfo.locationName, durationHours || 2);
    setScannedSpaceInfo(null);
    setQrScannerVisible(false);
    await initData();

    if (fineAmount > 0) {
      Alert.alert(
        "Contravention Fine Applied",
        `Spot ${scannedSpaceInfo.spaceNumber} reserved at ${scannedSpaceInfo.locationName}.\n\nA ${fineAmount.toLocaleString()} RWF Municipal Fine (${fineReason}) has been added.`
      );
    } else {
      Alert.alert(
        "Parking Started",
        `Spot ${scannedSpaceInfo.spaceNumber} reserved at ${scannedSpaceInfo.locationName} (${totalCost.toLocaleString()} RWF).`
      );
    }
  };

  const handleConfirmSheetBooking = async () => {
    if (!selectedParkForSheet) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in to start a parking session.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/sign-in") },
      ]);
      return;
    }

    const activePlate = selectedVehicle?.plate_number || driverVehicle?.plateNumber || "";
    if (!activePlate) {
      Alert.alert("Vehicle Required", "Please register a vehicle before booking a bay.", [
        { text: "Cancel", style: "cancel" },
        { text: "Add Vehicle", onPress: () => router.push("/(tabs)/vehicles") },
      ]);
      return;
    }

    const matchedSpace = sheetSpaces.find((s) => s.space_number === selectedSheetBay);

    let fineAmount = 0;
    let fineReason = "";
    const isEvSpot =
      matchedSpace?.space_type === "ev" ||
      Boolean(selectedParkForSheet.is_electric_station);
    const isHandicapSpot =
      matchedSpace?.space_type === "handicap" ||
      Boolean(selectedParkForSheet.is_handicap_facility);

    if (isEvSpot && !isVehicleElectric) {
      fineAmount = 5000;
      fineReason = "Unauthorized Non-EV in EV Bay";
    } else if (isHandicapSpot && !isVehicleHandicap) {
      fineAmount = 10000;
      fineReason = "Unauthorized Vehicle in Accessible Bay";
    }

    if (isEvSpot && isVehicleElectric) {
      const targetName = selectedParkForSheet.name;
      const targetBay = selectedSheetBay;
      const targetLocId = selectedParkForSheet.id;
      const kw = matchedSpace?.watt_power_kw || 120;
      const selectedHrs = durationHours || 1;
      const evBill = 9000;

      // Automatically initiate payment in the background
      initiateMobilePayment(evBill).catch(() => {});

      setConfirmBookingSheetVisible(false);
      setSelectedParkForSheet(null);
      router.push({
        pathname: "/charging_receipt",
        params: {
          locationId: targetLocId,
          name: targetName,
          bayNumber: targetBay,
          plate: activePlate,
          powerKw: String(kw),
          soc: String(driverVehicle?.batteryLevelPercent || 20),
          currency: "RWF",
          durationHours: String(selectedHrs),
          durationMinutes: String(selectedHrs * 60),
          durationSeconds: String(selectedHrs * 3600),
          billAmount: String(evBill),
          receiptNumber: `PZ-EV-${Date.now().toString().slice(-4)}`,
        },
      });
      return;
    }

    const exactHours = durationHours || 2;
    const baseCost = (selectedParkForSheet.hourly_rate || 300) * exactHours;
    const totalCost = baseCost + fineAmount;

    // Trigger mobile payment in the background for parking session
    initiateMobilePayment(totalCost).catch(() => {});

    const sessionRes = await startParkingSession({
      userId: user.id,
      vehicleId: selectedVehicle?.id,
      vehiclePlate: activePlate,
      locationId: selectedParkForSheet.id,
      spaceId: matchedSpace?.id,
      qrToken: matchedSpace?.qr_code_token || `QR-${selectedSheetBay}`,
      hourlyRate: selectedParkForSheet.hourly_rate || 300,
      durationHours: exactHours,
      totalAmount: totalCost,
      paymentStatus: "paid",
    });

    if (sessionRes.error || !sessionRes.data) {
      Alert.alert("Booking Failed", sessionRes.error || "Unable to create ticket in database.");
      return;
    }

    await supabase
      .from("parking_tickets")
      .update({
        total_amount: totalCost,
        hourly_rate: selectedParkForSheet.hourly_rate || 300,
        amount_paid: totalCost,
        payment_status: "paid",
        hours_elapsed: exactHours,
      })
      .eq("id", sessionRes.data.id);

    if (fineAmount > 0) {
      await issueZeroContactCitation({
        plateNumber: activePlate,
        locationId: selectedParkForSheet.id,
        spaceId: matchedSpace?.id,
        reason: fineReason,
        fineAmount: fineAmount,
      });
    }

    const currentNum = parseInt(ParkingBalance.replace(/,/g, ""), 10) || 0;
    const updatedBalance = Math.max(0, currentNum - totalCost);
    await updateWalletBalance(updatedBalance, user.id);
    setParkingBalance(updatedBalance.toLocaleString());

    notifyParkingStarted(selectedSheetBay, selectedParkForSheet.name, durationHours || 2);
    setConfirmBookingSheetVisible(false);
    setSelectedParkForSheet(null);
    await initData();

    // Trigger Success Animation Modal
    setBookingSuccessData({
      locationName: selectedParkForSheet.name,
      bayNumber: selectedSheetBay,
      zone: selectedSheetZone || "Zone A",
      durationHours: durationHours || 2,
      totalCost: totalCost,
      hourlyRate: selectedParkForSheet.hourly_rate || 300,
      fineAmount: fineAmount > 0 ? fineAmount : undefined,
      fineReason: fineAmount > 0 ? fineReason : undefined,
      ticketId: sessionRes.data.id,
      isEv: isEvSpot && isVehicleElectric,
    });
    setBookingSuccessModalVisible(true);
  };

  const handleTopUpWallet = () => {
    Alert.alert(
      "Top-Up Wallet",
      "Reload wallet balance in database:\n• 5,000 RWF\n• 10,000 RWF\n• 25,000 RWF",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "+10,000 RWF",
          onPress: async () => {
            const currentNum = parseInt(ParkingBalance.replace(/,/g, ""), 10) || 0;
            const next = currentNum + 10000;
            await updateWalletBalance(next);
            setParkingBalance(next.toLocaleString());
            Alert.alert("Success", "10,000 RWF credited to your ParkZone Wallet.");
          },
        },
      ]
    );
  };

  const [selectedTopology, setSelectedTopology] = useState<TopologyType>("perpendicular");
  const [is3DView, setIs3DView] = useState(false);
  const [isFlaggingOverdue, setIsFlaggingOverdue] = useState(false);
  const [isIssuingFine, setIsIssuingFine] = useState(false);

  // Synchronize layout topology strictly with the system-admin-configured layout for this lot
  useEffect(() => {
    if (selectedLocation?.layout_topology) {
      setSelectedTopology(selectedLocation.layout_topology);
    }
  }, [selectedLocation?.id, selectedLocation?.layout_topology]);

  const handleAgentAuditSearch = async () => {
    if (!agentPlateInput.trim()) return;
    setAgentSearching(true);
    try {
      const result = await verifyPlateStatus(agentPlateInput);
      setAgentAudit(result);
    } catch (e) {
      console.warn("Audit error:", e);
    } finally {
      setAgentSearching(false);
    }
  };

  const handleFlagOverdue = async () => {
    if (!agentAudit || !agentPlateInput) return;
    setIsFlaggingOverdue(true);
    try {
      await flagOverdueInvoice({
        ticketId: agentAudit.ticket_id || `t-${Date.now()}`,
        plateNumber: agentPlateInput.trim().toUpperCase(),
        overdueAmount: agentAudit.overdue_amount || 1200,
      });
      Alert.alert(
        "Overdue Flag Dispatched",
        `Invoice for plate ${agentAudit.masked_plate} flagged in central registry.\n\n• Automated MoMo push prompt triggered\n• Barrier lots will require settlement on exit\n• Zero physical contact enforced.`,
        [{ text: "Done", onPress: () => setAgentAudit(null) }]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to flag invoice.");
    } finally {
      setIsFlaggingOverdue(false);
    }
  };

  const handleIssueCitation = async () => {
    if (!agentPlateInput) return;
    setIsIssuingFine(true);
    try {
      const res = await issueZeroContactCitation({
        plateNumber: agentPlateInput.trim().toUpperCase(),
        locationId: selectedLocation?.id || locations[0]?.id || "",
      });
      Alert.alert(
        "Digital Citation Issued",
        `Fine of 3,000 RWF issued to plate ${agentPlateInput.toUpperCase()}.\n\n• Reference: ${res.data?.irembo_reference_code || "Pending Registry Sync"}\n• Synced with contravention registry\n• No vehicle contact or physical paper ticket issued.`,
        [{ text: "Understood", onPress: () => setAgentAudit(null) }]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to issue citation.");
    } finally {
      setIsIssuingFine(false);
    }
  };

  const visibleSpaces: ParkingSpace[] = useMemo(() => {
    return spaces.filter((sp: ParkingSpace) => {
      // Non-electric vehicles never see EV bays
      if (sp.space_type === "ev" && !isVehicleElectric) return false;
      // Non-handicap vehicles never see handicap bays
      if (sp.space_type === "handicap" && !isVehicleHandicap) return false;

      // In-lot search filter
      if (detailsSearchQuery.trim().length > 0) {
        const q = detailsSearchQuery.toLowerCase().trim();
        const matchesBay = sp.space_number.toLowerCase().includes(q);
        const matchesZone = sp.zone_code.toLowerCase().includes(q);
        if (!matchesBay && !matchesZone) return false;
      }

      return true;
    });
  }, [spaces, isVehicleElectric, isVehicleHandicap, detailsSearchQuery]);

  const leftColumnSpaces: ParkingSpace[] = visibleSpaces.filter((_: ParkingSpace, idx: number) => idx % 2 === 0);
  const rightColumnSpaces: ParkingSpace[] = visibleSpaces.filter((_: ParkingSpace, idx: number) => idx % 2 === 1);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: theme.background }]} edges={["top"]}>

        {/* =========================================================================
          SCREEN 1: PARKING SPOT / SLOT SELECTION (Left screen in reference)
      ========================================================================== */}
        {viewMode === "slot_selection" ? (
          <View style={styles.screenWrapper}>
            {/* Header */}
            <View style={styles.spotHeader}>
              <TouchableOpacity
                style={[styles.circularNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => setViewMode("park_details")}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={20} color={theme.text} />
              </TouchableOpacity>

              <Text style={[styles.spotHeaderTitle, { color: theme.text }]}>Parking Spot</Text>

              <TouchableOpacity
                style={[styles.circularNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => Alert.prompt ? Alert.prompt("Search Spot", "Enter Bay ID:") : setQrModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="search-outline" size={19} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Floor Selector Pills */}
            <View style={styles.floorPillsRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.floorPillsScroll}>
                {["1st floor", "2nd floor", "3rd floor", "4th floor", "All ˅"].map((fl) => {
                  const isActive = currentFloor === fl;
                  return (
                    <TouchableOpacity
                      key={fl}
                      style={[
                        styles.floorPill,
                        {
                          backgroundColor: isActive ? theme.pillActiveBg : theme.surface,
                          borderColor: isActive ? theme.pillActiveBg : theme.border,
                        },
                      ]}
                      onPress={() => setCurrentFloor(fl)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.floorPillText,
                          { color: isActive ? theme.pillActiveText : theme.textSecondary },
                        ]}
                      >
                        {fl}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Facility Architectural Layout & 3D Aerial View Toggle */}
            <View style={styles.topologySwitcherRow}>
              <View
                style={[
                  styles.adminLayoutPillHome,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons name="shield-checkmark" size={13} color={theme.text} />
                <Text style={[styles.adminLayoutTextHome, { color: theme.textSecondary }]}>
                  Layout:{" "}
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    {selectedTopology === "oblique"
                      ? "45° Diagonal"
                      : selectedTopology === "parallel"
                      ? "0° Parallel"
                      : selectedTopology === "wide"
                      ? "Wide Pod"
                      : "90° Perpendicular"}
                  </Text>
                </Text>
                <View
                  style={[
                    styles.adminLockTagHome,
                    { backgroundColor: theme.isDark ? "#27272A" : "#F4F4F5" },
                  ]}
                >
                  <Ionicons name="lock-closed" size={8} color={theme.textSecondary} />
                  <Text style={[styles.adminLockTagTextHome, { color: theme.textSecondary }]}>Admin Set</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.aerial3DToggleBtn,
                  {
                    backgroundColor: is3DView ? theme.primaryBtnBg : theme.surface,
                    borderColor: is3DView ? theme.primaryBtnBg : theme.border,
                  },
                ]}
                onPress={() => setIs3DView(!is3DView)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={is3DView ? "cube" : "cube-outline"}
                  size={14}
                  color={is3DView ? theme.primaryBtnText : theme.text}
                />
                <Text
                  style={[
                    styles.aerial3DToggleText,
                    { color: is3DView ? theme.primaryBtnText : theme.text },
                  ]}
                >
                  {is3DView ? "3D Aerial" : "2D Grid"}
                </Text>
              </TouchableOpacity>
            </View>

            {is3DView ? (
              <View style={{ flex: 1, paddingBottom: 160 }}>
                <AerialParkingLot3D
                  topology={selectedTopology}
                  spaces={visibleSpaces}
                  selectedSpaceId={selectedSpace?.id || null}
                  onSelectSpace={(sp) => handleSelectSlot(sp)}
                  currentZone={currentFloor}
                  onDirectToSlot={(sp) => handleSelectSlot(sp)}
                  locationName={selectedLocation?.name || "Parking Facility"}
                />
              </View>
            ) : (
              /* Parking Bay Layout Grid */
              <ScrollView style={styles.slotGridScroll} contentContainerStyle={styles.slotGridContent} showsVerticalScrollIndicator={false}>
                {/* Section A Indicator & Entry Arrow */}
                <View style={styles.bayIndicatorsRow}>
                  <View style={[styles.sectionPillBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.sectionPillText, { color: theme.text }]}>A</Text>
                  </View>

                  <View style={styles.entryArrowBox}>
                    <Text style={[styles.entryArrowText, { color: theme.textSecondary }]}>ENTRY</Text>
                    <Ionicons name="chevron-down" size={16} color={theme.text} style={{ marginTop: -2 }} />
                    <Ionicons name="chevron-down" size={16} color={theme.text} style={{ marginTop: -10 }} />
                  </View>
                </View>

                {/* Parking Layout 2-Columns */}
                {loadingSpaces ? (
                  <BayGridSkeleton count={8} />
                ) : (
                <View style={styles.bayLayoutTwoCols}>
                  {/* Left Column */}
                  <View style={styles.bayColumn}>
                    {leftColumnSpaces.map((sp) => {
                      const isSelected = selectedSpace?.id === sp.id;
                      const isEV = sp.space_type === "ev";
                      const isHC = sp.space_type === "handicap";
                      const isSlotDisabled = (isEV && !isVehicleElectric) || (isHC && !isVehicleHandicap);
                      const spaceTopo = sp.topology || selectedTopology || "perpendicular";
                      const skewTransform = spaceTopo === "oblique" ? [{ skewX: "-8deg" }] : [];

                      if (sp.is_occupied) {
                        const carHex = sp.car_color || resolveParkedCarColor(`${selectedLocation?.id}-${sp.zone_code}-${sp.space_number}`);
                        return (
                          <View key={sp.id} style={[styles.occupiedBayWrapper, { transform: skewTransform }, spaceTopo === "wide" && { borderWidth: 1.5, borderColor: theme.borderStrong }]}>
                            <Text style={[styles.bayLabelMuted, { color: theme.textSecondary }]}>{sp.space_number}</Text>
                            {spaceTopo === "parallel" ? (
                              <HorizontalUltraRealisticCar color={carHex} width={76} height={38} />
                            ) : (
                              <VerticalUltraRealisticCar color={carHex} width={42} height={80} />
                            )}
                          </View>
                        );
                      }
                      return (
                        <TouchableOpacity
                          key={sp.id}
                          style={[
                            styles.freeBaySlot,
                            spaceTopo === "parallel" && { minHeight: 64 },
                            {
                              backgroundColor: theme.surface,
                              borderColor: isSelected
                                ? (isEV ? theme.evGreen : theme.accent)
                                : isSlotDisabled
                                  ? "rgba(239, 68, 68, 0.45)"
                                  : isEV
                                    ? theme.evGreenBorder
                                    : isHC
                                      ? theme.borderStrong
                                      : theme.border,
                              borderWidth: isSelected ? 2.5 : 1,
                              opacity: isSlotDisabled ? 0.55 : 1,
                              transform: skewTransform,
                            },
                          ]}
                          onPress={() => handleSelectSlot(sp)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.freeBaySlotText, { color: theme.text }]}>{sp.space_number}</Text>
                          {isSlotDisabled && (
                            <View style={styles.disabledBayBadge}>
                              <Ionicons name="lock-closed" size={8} color={theme.danger} />
                              <Text style={styles.disabledBayBadgeText}>{isEV ? "EV ONLY" : "PERMIT REQ"}</Text>
                            </View>
                          )}
                          {isEV && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
                              <Ionicons name="flash" size={10} color={theme.evGreen} />
                              <Text style={{ fontSize: 9, fontWeight: "500", color: theme.evGreen }}>EV</Text>
                            </View>
                          )}
                          {isHC && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
                              <Ionicons name="body" size={10} color={theme.textSecondary} />
                              <Text style={{ fontSize: 9, fontWeight: "500", color: theme.textSecondary }}>ACCESSIBLE</Text>
                            </View>
                          )}
                          {isSelected && (
                            <View style={[styles.selectedCheckDot, { backgroundColor: isEV ? theme.evGreen : theme.accent }]}>
                              <Ionicons name="checkmark" size={12} color={isEV ? theme.evGreenText : theme.accentText} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Center Drive Aisle */}
                  <View style={styles.driveAisle}>
                    <View style={[styles.driveAisleDashedLine, { borderColor: theme.borderStrong }]} />
                  </View>

                  {/* Right Column */}
                  <View style={styles.bayColumn}>
                    {rightColumnSpaces.map((sp) => {
                      const isSelected = selectedSpace?.id === sp.id;
                      const isEV = sp.space_type === "ev";
                      const isHC = sp.space_type === "handicap";
                      const isSlotDisabled = (isEV && !isVehicleElectric) || (isHC && !isVehicleHandicap);
                      const spaceTopo = sp.topology || selectedTopology || "perpendicular";
                      const skewTransform = spaceTopo === "oblique" ? [{ skewX: "8deg" }] : [];

                      if (sp.is_occupied) {
                        const carHex = sp.car_color || resolveParkedCarColor(`${selectedLocation?.id}-${sp.zone_code}-${sp.space_number}`);
                        return (
                          <View key={sp.id} style={[styles.occupiedBayWrapper, { transform: skewTransform }, spaceTopo === "wide" && { borderWidth: 1.5, borderColor: theme.borderStrong }]}>
                            <Text style={[styles.bayLabelMuted, { color: theme.textSecondary }]}>{sp.space_number}</Text>
                            {spaceTopo === "parallel" ? (
                              <HorizontalUltraRealisticCar color={carHex} width={76} height={38} />
                            ) : (
                              <VerticalUltraRealisticCar color={carHex} width={42} height={80} />
                            )}
                          </View>
                        );
                      }
                      return (
                        <TouchableOpacity
                          key={sp.id}
                          style={[
                            styles.freeBaySlot,
                            {
                              backgroundColor: theme.surface,
                              borderColor: isSelected
                                ? (isEV ? theme.evGreen : theme.accent)
                                : isSlotDisabled
                                  ? "rgba(239, 68, 68, 0.45)"
                                  : isEV
                                    ? theme.evGreenBorder
                                    : isHC
                                      ? theme.borderStrong
                                      : theme.border,
                              borderWidth: isSelected ? 2.5 : 1,
                              opacity: isSlotDisabled ? 0.55 : 1,
                              transform: skewTransform,
                            },
                          ]}
                          onPress={() => handleSelectSlot(sp)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.freeBaySlotText, { color: theme.text }]}>{sp.space_number}</Text>
                          {isSlotDisabled && (
                            <View style={styles.disabledBayBadge}>
                              <Ionicons name="lock-closed" size={8} color={theme.danger} />
                              <Text style={styles.disabledBayBadgeText}>{isEV ? "EV ONLY" : "PERMIT REQ"}</Text>
                            </View>
                          )}
                          {isEV && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
                              <Ionicons name="flash" size={10} color={theme.evGreen} />
                              <Text style={{ fontSize: 9, fontWeight: "500", color: theme.evGreen }}>EV</Text>
                            </View>
                          )}
                          {isHC && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
                              <Ionicons name="body" size={10} color={theme.textSecondary} />
                              <Text style={{ fontSize: 9, fontWeight: "500", color: theme.textSecondary }}>ACCESSIBLE</Text>
                            </View>
                          )}
                          {isSelected && (
                            <View style={[styles.selectedCheckDot, { backgroundColor: isEV ? theme.evGreen : theme.accent }]}>
                              <Ionicons name="checkmark" size={12} color={isEV ? theme.evGreenText : theme.accentText} />
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

            {/* Bottom Floating Sheet */}
            <View style={[styles.spotBottomCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}>
              <View style={styles.sheetHandleBar} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                {(selectedSpace?.image_url || selectedLocation?.image_url) ? (
                  <Image
                    source={{ uri: selectedSpace?.image_url || selectedLocation?.image_url }}
                    style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.spotSheetTitle, { color: theme.text, marginBottom: 2 }]}>
                    Spot {selectedSpace ? selectedSpace.space_number : "-"}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: "400" }} numberOfLines={1}>
                    {selectedSpace?.zone_code || "Zone A"} • {selectedLocation?.name || "Parking Facility"}
                  </Text>
                </View>
              </View>

              {/* Time Selectors Row */}
              <View style={styles.timeSelectorRow}>
                <View style={styles.timeCol}>
                  <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>Arrive after</Text>
                  <TouchableOpacity
                    style={[styles.timeChip, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => Alert.alert("Arrive After", "Select check-in hour:")}
                  >
                    <Text style={[styles.timeChipText, { color: theme.text }]}>08:00 AM ˅</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.durationCenterPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <TouchableOpacity onPress={() => setDurationHours((h) => Math.max(1, h - 1))}>
                    <Ionicons name="remove-circle-outline" size={18} color={theme.text} />
                  </TouchableOpacity>
                  <Ionicons name="time-outline" size={14} color={theme.text} />
                  <Text style={[styles.durationCenterText, { color: theme.text }]}>
                    {durationHours} Hours
                  </Text>
                  <TouchableOpacity onPress={() => setDurationHours((h) => h + 1)}>
                    <Ionicons name="add-circle-outline" size={18} color={theme.text} />
                  </TouchableOpacity>
                </View>

                <View style={styles.timeCol}>
                  <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>Exit after</Text>
                  <TouchableOpacity
                    style={[styles.timeChip, { backgroundColor: theme.background, borderColor: theme.border }]}
                    onPress={() => Alert.alert("Exit After", "Select check-out hour:")}
                  >
                    <Text style={[styles.timeChipText, { color: theme.text }]}>
                      {`${(8 + durationHours) % 12 || 12}:00 ${8 + durationHours >= 12 ? "PM" : "AM"} ˅`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Full Width Pill Button */}
              <TouchableOpacity
                style={[styles.fullWidthPillBtn, { backgroundColor: theme.primaryBtnBg }]}
                onPress={handleConfirmPayment}
                activeOpacity={0.88}
              >
                <View style={styles.fullWidthPillInner}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name="card-outline" size={20} color={theme.primaryBtnText} />
                    <Text style={[styles.fullWidthPillBtnText, { color: theme.primaryBtnText }]}>
                      Confirm Payment
                    </Text>
                  </View>
                  <View style={[styles.circleArrowIcon, { backgroundColor: theme.background }]}>
                    <Ionicons name="arrow-forward" size={16} color={theme.text} />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        ) : viewMode === "park_details" ? (
          /* =========================================================================
              SCREEN 3: PARK DETAILS (Right screen in reference)
          ========================================================================== */
          <ScrollView
            style={styles.screenWrapper}
            contentContainerStyle={styles.detailsContent}
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
            {/* Top Bar with Search & Car Selector */}
            <View style={styles.detailsTopBar}>
              <TouchableOpacity
                style={[styles.circularNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => setViewMode("discovery")}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={20} color={theme.text} />
              </TouchableOpacity>

              <View style={[styles.detailsSearchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="search-outline" size={16} color={theme.textSecondary} />
                <TextInput
                  style={[styles.detailsSearchInput, { color: theme.text }]}
                  placeholder="Search bay (e.g. 125)..."
                  placeholderTextColor={theme.textMuted}
                  value={detailsSearchQuery}
                  onChangeText={setDetailsSearchQuery}
                  clearButtonMode="while-editing"
                />
                {detailsSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setDetailsSearchQuery("")} style={{ paddingHorizontal: 4 }}>
                    <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
                <View style={[styles.detailsCarPill, { backgroundColor: theme.background }]}>
                  <Ionicons name="car" size={13} color={theme.text} />
                  <Text style={[styles.detailsCarPillText, { color: theme.text }]}>Car ˅</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.circularNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => Alert.alert("Notifications", "No active fines. Sensor active.")}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-outline" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Park Profile Header */}
            <View style={[styles.parkCardHead, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.parkProfileRow}>
                {selectedLocation?.image_url ? (
                  <Image
                    source={{ uri: selectedLocation.image_url }}
                    style={styles.parkAvatarImg}
                  />
                ) : (
                  <View style={[styles.parkAvatarImg, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border }]}>
                    <Ionicons name="car-sport-outline" size={24} color={theme.textSecondary} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.parkProfileTitle, { color: theme.text, flexShrink: 1, minWidth: 0 }]} numberOfLines={1}>
                      {selectedLocation?.name || "Parking Facility"}
                    </Text>
                    <Ionicons name="checkmark-circle" size={16} color={theme.text} style={{ flexShrink: 0 }} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Ionicons name="car-outline" size={13} color={theme.textSecondary} />
                    <Text style={[styles.parkReviewsText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {selectedLocation?.available_spots ?? 0} of {selectedLocation?.total_spots ?? 0} bays open
                    </Text>
                  </View>
                </View>

                <View style={[styles.verifiedPill, { backgroundColor: theme.background, borderColor: theme.border, flexShrink: 0 }]}>
                  <Ionicons name="checkmark-outline" size={13} color={theme.text} />
                  <Text style={[styles.verifiedPillText, { color: theme.text }]}>Verified</Text>
                </View>
              </View>

              {/* Address Row with Navigation Action (Context of ParkZone) */}
              <View style={styles.addressCallRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <Ionicons name="location-outline" size={18} color={theme.textSecondary} style={{ flexShrink: 0 }} />
                  <Text style={[styles.addressText, { color: theme.textSecondary, flex: 1, minWidth: 0 }]} numberOfLines={2}>
                    {selectedLocation?.address || ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.callBtn, { backgroundColor: theme.background, borderColor: theme.border, flexShrink: 0 }]}
                  onPress={() => {
                    if (selectedLocation) {
                      VoiceGuidance.speak(`Starting route navigation to ${selectedLocation.name}.`);
                      setSelectedMapLocation(selectedLocation);
                      setShowMapView(true);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="navigate-outline" size={18} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Segmented Tabs: About Park / Slot Details / Reviews */}
            <View style={styles.segmentedTabsRow}>
              {(["About Park", "Slot Details", "Reviews"] as const).map((tab) => {
                const active =
                  (tab === "About Park" && detailsTab === "about") ||
                  (tab === "Slot Details" && detailsTab === "slots") ||
                  (tab === "Reviews" && detailsTab === "reviews");
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.segmentedTabBtn,
                      {
                        backgroundColor: active ? theme.pillActiveBg : theme.surface,
                        borderColor: active ? theme.pillActiveBg : theme.border,
                      },
                    ]}
                    onPress={() => {
                      if (tab === "About Park") setDetailsTab("about");
                      if (tab === "Slot Details") {
                        setDetailsTab("slots");
                        setViewMode("slot_selection");
                      }
                      if (tab === "Reviews") setDetailsTab("reviews");
                    }}
                  >
                    <Text
                      style={[
                        styles.segmentedTabText,
                        { color: active ? theme.pillActiveText : theme.textSecondary },
                      ]}
                    >
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Conditional Tab Body: Reviews vs About */}
            {detailsTab === "reviews" ? (
              <View style={{ marginTop: 14 }}>
                {/* Rating Overview Card */}
                <View style={[styles.reviewsHeaderCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.reviewsScoreRow}>
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                        <Text style={[styles.reviewsAvgScore, { color: theme.text }]}>
                          {locationReviews.length > 0
                            ? (locationReviews.reduce((acc, r) => acc + r.rating, 0) / locationReviews.length).toFixed(1)
                            : "5.0"}
                        </Text>
                        <Text style={{ fontSize: 13, color: theme.textSecondary }}>/ 5.0</Text>
                      </View>
                      <View style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map((starIdx) => {
                          const avg = locationReviews.length > 0
                            ? locationReviews.reduce((acc, r) => acc + r.rating, 0) / locationReviews.length
                            : 5;
                          return (
                            <Ionicons
                              key={starIdx}
                              name={starIdx <= Math.round(avg) ? "star" : "star-outline"}
                              size={15}
                              color="#EAB308"
                            />
                          );
                        })}
                      </View>
                      <Text style={[styles.reviewsCountText, { color: theme.textSecondary }]}>
                        {locationReviews.length} {locationReviews.length === 1 ? "verified motorist review" : "verified motorist reviews"}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.writeReviewBtn, { backgroundColor: theme.primaryBtnBg }]}
                      onPress={() => setReviewModalVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="create-outline" size={15} color={theme.primaryBtnText} />
                      <Text style={[styles.writeReviewBtnText, { color: theme.primaryBtnText }]}>
                        Write Review
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Reviews List */}
                {loadingReviews ? (
                  <View style={{ paddingVertical: 40, alignItems: "center" }}>
                    <ActivityIndicator color={theme.text} />
                  </View>
                ) : locationReviews.length === 0 ? (
                  <View style={[styles.emptyReviewsBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={32} color={theme.textSecondary} style={{ marginBottom: 10 }} />
                    <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 4 }}>
                      No Reviews Yet
                    </Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary, textAlign: "center", maxWidth: 280, marginBottom: 14 }}>
                      Be the first motorist to share your feedback about parking at {selectedLocation?.name}.
                    </Text>
                    <TouchableOpacity
                      style={[styles.writeReviewBtn, { backgroundColor: theme.primaryBtnBg }]}
                      onPress={() => setReviewModalVisible(true)}
                    >
                      <Ionicons name="create-outline" size={14} color={theme.primaryBtnText} />
                      <Text style={[styles.writeReviewBtnText, { color: theme.primaryBtnText }]}>
                        Add First Review
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  locationReviews.map((rev) => (
                    <View
                      key={rev.id}
                      style={[styles.reviewCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    >
                      <View style={styles.reviewAuthorRow}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 17,
                              backgroundColor: theme.background,
                              borderWidth: 1,
                              borderColor: theme.border,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Ionicons name="person" size={16} color={theme.text} />
                          </View>
                          <View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Text style={[styles.reviewAuthorName, { color: theme.text }]}>
                                {rev.user_name}
                              </Text>
                              <Ionicons name="checkmark-circle" size={12} color={theme.accent} />
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 }}>
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Ionicons
                                  key={s}
                                  name={s <= rev.rating ? "star" : "star-outline"}
                                  size={11}
                                  color="#EAB308"
                                />
                              ))}
                            </View>
                          </View>
                        </View>
                        <Text style={[styles.reviewDateText, { color: theme.textMuted }]}>
                          {new Date(rev.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                        </Text>
                      </View>

                      <Text style={[styles.reviewCommentText, { color: theme.text }]}>
                        {rev.comment}
                      </Text>

                      {rev.tags && rev.tags.length > 0 && (
                        <View style={styles.reviewTagsRow}>
                          {rev.tags.map((t) => (
                            <View
                              key={t}
                              style={[
                                styles.reviewTagPill,
                                { backgroundColor: theme.background, borderColor: theme.border },
                              ]}
                            >
                              <Text style={[styles.reviewTagText, { color: theme.textSecondary }]}>
                                {t}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            ) : (
              <>
                {/* Hero Video/Gallery Card */}
                <View style={styles.mediaGalleryBox}>
                  {selectedLocation?.image_url ? (
                    <Image
                      source={{ uri: selectedLocation.image_url }}
                      style={styles.mediaGalleryImg}
                    />
                  ) : (
                    <View style={[styles.mediaGalleryImg, { backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="videocam-outline" size={36} color={theme.textSecondary} />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.mediaPlayBtn}
                    onPress={() => Alert.alert("360° Aerial Tour", "Streaming real-time sensor telemetry...")}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="play" size={24} color="#000000" style={{ marginLeft: 3 }} />
                  </TouchableOpacity>
                </View>

                {/* Other Nearby Parks */}
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={[styles.sectionTitleBold, { color: theme.text }]}>Other Nearby Parks</Text>
                    <Text style={[styles.sectionSubMuted, { color: theme.textSecondary }]}>
                      The best parking space near you
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowMapView(true)}>
                    <Text style={[styles.seeAllLink, { color: theme.text }]}>See all ››</Text>
                  </TouchableOpacity>
                </View>

                {eligibleLocations.slice(1).map((loc) => (
                  <TouchableOpacity
                    key={loc.id}
                    style={[styles.horizontalLotCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}
                    onPress={() => handleOpenParkDetails(loc)}
                    activeOpacity={0.88}
                  >
                    {loc.image_url ? (
                      <Image
                        source={{ uri: loc.image_url }}
                        style={styles.horizontalLotImg}
                      />
                    ) : (
                      <View style={[styles.horizontalLotImg, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border }]}>
                        <Ionicons name="car-sport-outline" size={24} color={theme.textSecondary} />
                      </View>
                    )}
                    <View style={{ flex: 1, justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.lotCardTitle, { color: theme.text }]} numberOfLines={1}>
                            {loc.name}
                          </Text>
                          <Text style={[styles.lotCardTypes, { color: loc.is_electric_station ? theme.evGreen : theme.textSecondary, fontWeight: loc.is_electric_station ? "600" : "400" }]}>
                            {loc.is_electric_station ? "EV Hypercharger Station" : loc.is_handicap_facility ? "Accessible Facility" : "Standard Parking"}
                          </Text>
                        </View>
                        <View style={[styles.tariffBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                          <Text style={[styles.tariffBadgeText, { color: theme.text }]}>{loc.hourly_rate} RWF/hr</Text>
                        </View>
                      </View>

                      <Text style={[styles.lotCardAddr, { color: theme.textSecondary }]} numberOfLines={1}>
                        {loc.address}
                      </Text>

                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Ionicons name="location-outline" size={12} color={theme.textSecondary} />
                          <Text style={[styles.ratingStarText, { color: theme.textSecondary }]}>{loc.city || "Rwanda"}</Text>
                        </View>
                        <View style={[styles.spotsAvailablePill, { backgroundColor: theme.background }]}>
                          <Text style={[styles.spotsAvailableText, { color: theme.text }]}>
                            {loc.available_spots ?? 0} Open
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Confirm Button */}
            <TouchableOpacity
              style={[styles.fullWidthPillBtn, { backgroundColor: theme.primaryBtnBg, marginTop: 14, marginBottom: 30 }]}
              onPress={handleProceedToSlots}
              activeOpacity={0.88}
            >
              <View style={styles.fullWidthPillInner}>
                <Text style={[styles.fullWidthPillBtnText, { color: theme.primaryBtnText }]}>
                  Confirm Slot Selection
                </Text>
                <View style={[styles.circleArrowIcon, { backgroundColor: theme.background }]}>
                  <Ionicons name="arrow-forward" size={16} color={theme.text} />
                </View>
              </View>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          /* =========================================================================
              SCREEN 2: HOME DISCOVERY (Center screen in reference)
          ========================================================================== */
          <ScrollView
            style={styles.screenWrapper}
            contentContainerStyle={styles.homeScrollContent}
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
            {/* Top Bar: Avatar, My Location, Voice Toggle, Bell */}
            <View style={styles.homeTopBar}>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/profile")}
                style={[
                  styles.avatarCircleBtn,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                  },
                ]}
                activeOpacity={0.8}
              >
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.avatarFallbackInner}>
                    <Ionicons name="person" size={20} color={theme.textSecondary} />
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.locationSelectorGroup}
                onPress={() => setShowMapView(!showMapView)}
                activeOpacity={0.7}
              >
                <Text style={[styles.myLocationSub, { color: theme.textSecondary }]}>My Location ˅</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="location-sharp" size={15} color={theme.text} />
                  <Text style={[styles.myLocationMain, { color: theme.text }]} numberOfLines={1}>
                    {userLocationName}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.voiceHeaderToggleBtn,
                    {
                      backgroundColor: isVoiceMuted ? theme.surface : theme.pillActiveBg,
                      borderColor: isVoiceMuted ? theme.border : theme.pillActiveBg,
                    },
                  ]}
                  onPress={async () => {
                    const next = await VoiceGuidance.toggleMute();
                    setIsVoiceMuted(next);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isVoiceMuted ? "volume-mute-outline" : "volume-high"}
                    size={16}
                    color={isVoiceMuted ? theme.textSecondary : theme.pillActiveText}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.circularNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setNotificationsModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="notifications-outline" size={20} color={theme.text} />
                  {unreadNotifsCount > 0 && <View style={styles.unreadBadgeDot} />}
                </TouchableOpacity>
              </View>
            </View>

            {/* Search Bar + AI Mode Button */}
            <View style={styles.searchRow}>
              <View
                style={[
                  styles.searchBarContainer,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
                <TextInput
                  style={[styles.homeSearchInput, { color: theme.text }]}
                  placeholder="Search parking by name, area, rate..."
                  placeholderTextColor={theme.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  clearButtonMode="while-editing"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              <AnimatedBwGradientCard
                active={isAiMode || isAiThinking}
                isThinking={isAiThinking}
                borderRadius={22}
                borderWidth={2}
                animValue={aiBorderRotateAnim}
                colorAnimValue={aiBorderColorAnim}
                onPress={handleToggleAiMode}
                activeOpacity={0.8}
                style={[
                  styles.aiModePillBtn,
                  {
                    backgroundColor: (isAiMode || isAiThinking) ? theme.pillActiveBg : theme.surface,
                    borderColor: (isAiMode || isAiThinking) ? "transparent" : theme.border,
                    borderWidth: (isAiMode || isAiThinking) ? 0 : 1,
                  },
                ]}
              >
                {isAiThinking ? (
                  <>
                    <ActivityIndicator size="small" color={theme.pillActiveText} style={{ marginRight: 2 }} />
                    <Text style={[styles.aiModePillText, { color: theme.pillActiveText }]}>AI Deciding...</Text>
                  </>
                ) : isAiMode ? (
                  <>
                    <Ionicons name="sparkles" size={14} color={theme.pillActiveText} />
                    <Text style={[styles.aiModePillText, { color: theme.pillActiveText }]}>AI Active</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="sparkles" size={14} color={theme.text} />
                    <Text style={[styles.aiModePillText, { color: theme.text, fontWeight: "500" }]}>AI Mode</Text>
                  </>
                )}
              </AnimatedBwGradientCard>
            </View>

            {loadingInitial && !refreshing ? (
              <HomeDiscoverySkeleton />
            ) : (
              <>
            {/* Hick's Law: Instant Quick Match Hero Card (Requirement 9) */}
            {displayedParkingLocations.length > 0 && !activeTicket && (
              <View style={[styles.hickQuickCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.hickQuickHeader}>
                  <View style={styles.hickBadgeRow}>
                    <View style={[styles.hickPill, { backgroundColor: theme.pillActiveBg }]}>
                      <Ionicons name="flash" size={11} color={theme.pillActiveText} />
                      <Text style={[styles.hickPillText, { color: theme.pillActiveText }]}>INSTANT PARK</Text>
                    </View>
                    <Text style={[styles.hickDistanceText, { color: theme.textSecondary }]}>
                      • {haversineKm(userCoordinates.latitude, userCoordinates.longitude, Number(displayedParkingLocations[0].latitude), Number(displayedParkingLocations[0].longitude)).toFixed(1)} km away
                    </Text>
                  </View>
                  <Text style={[styles.hickPriceTag, { color: theme.text }]}>
                    {displayedParkingLocations[0].hourly_rate || 300} RWF/h
                  </Text>
                </View>

                <Text style={[styles.hickTitleText, { color: theme.text }]} numberOfLines={1}>
                  {displayedParkingLocations[0].name}
                </Text>
                <Text style={[styles.hickSubText, { color: theme.textSecondary }]} numberOfLines={1}>
                  {displayedParkingLocations[0].address}
                </Text>

                <View style={styles.hickFooterRow}>
                  <View style={[styles.hickSpotFreePill, { backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.border }]}>
                    <View style={[styles.hickGreenDot, { backgroundColor: theme.accent }]} />
                    <Text style={[styles.hickSpotFreeText, { color: theme.text }]}>
                      {displayedParkingLocations[0].available_spots ?? 0} spots vacant
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.hickDirectCtaBtn, { backgroundColor: theme.primaryBtnBg }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      handleOpenParkDetails(displayedParkingLocations[0]);
                      VoiceGuidance.speak(
                        `Directing to ${displayedParkingLocations[0].name}. ${displayedParkingLocations[0].available_spots ?? 0} slots vacant.`
                      );
                    }}
                  >
                    <Ionicons name="navigate" size={14} color={theme.primaryBtnText} />
                    <Text style={[styles.hickDirectCtaBtnText, { color: theme.primaryBtnText }]}>DIRECT ME HERE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* AI Mode: Precision Vehicle Specs Intelligence Card (Requirement 10) */}
            {(isAiMode || isAiThinking) && (
              <View style={styles.aiVehicleIntelCard}>
                <View style={styles.aiVehicleIntelHeader}>
                  <View style={styles.aiVehicleHeaderLeft}>
                    <Ionicons name="sparkles" size={14} color="#09090B" />
                    <Text style={styles.aiVehicleIntelTitle}>AI VEHICLE SPEC MATCH</Text>
                  </View>
                  <Text style={styles.aiMatchScoreBadge}>LIVE DB SPECS</Text>
                </View>

                <View style={styles.aiVehicleSpecsGrid}>
                  <View style={styles.aiVehicleSpecItem}>
                    <Text style={styles.aiVehicleSpecLabel}>VEHICLE</Text>
                    <Text style={styles.aiVehicleSpecValue} numberOfLines={1}>
                      {driverVehicle?.makeModel || (selectedVehicle ? `${selectedVehicle.brand || ""} ${selectedVehicle.model || ""}`.trim() : "") || "No vehicle registered"}
                    </Text>
                    <Text style={styles.aiVehicleSpecSub}>
                      Plate: {driverVehicle?.plateNumber || selectedVehicle?.plate_number || "Register in Vehicles"}
                    </Text>
                  </View>

                  <View style={styles.aiVehicleSpecItem}>
                    <Text style={styles.aiVehicleSpecLabel}>BATTERY / POWER</Text>
                    <Text style={styles.aiVehicleSpecValue}>
                      {isVehicleElectric
                        ? `${driverVehicle?.batteryLevelPercent ?? 0}% (${driverVehicle?.estimatedRangeKm ?? 0} km)`
                        : "Combustion / Standard"}
                    </Text>
                    <Text style={styles.aiVehicleSpecSub}>
                      {isVehicleElectric ? (driverVehicle?.plugType || "CCS2") : (selectedVehicle?.vehicle_type || "Standard")}
                    </Text>
                  </View>
                </View>

                <View style={styles.aiRecommendationCallout}>
                  <Ionicons name="checkmark-circle" size={15} color="#09090B" />
                  <Text style={styles.aiRecommendationCalloutText}>
                    {isVehicleElectric
                      ? `Tuned for ${driverVehicle?.makeModel || "your EV"}: EV Charging billed separately at 9,000 RWF (<30m) or 10,000 RWF (≥30m / full charge) • 0 RWF parking fee.`
                      : `Tuned for ${driverVehicle?.makeModel || selectedVehicle?.model || "your vehicle"}: Filtering optimal standard bays sorted by real-time vacancy and rate.`}
                  </Text>
                </View>
              </View>
            )}

            {/* Current Balance & Live Parking Tracker (Monochrome Luxury Card) - Rendered ONLY after parking has started */}
            {activeTicket ? (
              <AnimatedBwGradientCard
                active={isAiMode || isAiThinking}
                isThinking={isAiThinking}
                borderRadius={22}
                borderWidth={2.5}
                animValue={aiBorderRotateAnim}
                colorAnimValue={aiBorderColorAnim}
                style={[
                  styles.darkLuxuryBalanceCard,
                  (isAiMode || isAiThinking) && {
                    shadowColor: theme.isDark ? "#FFFFFF" : "#000000",
                    shadowOpacity: isAiThinking ? 0.8 : 0.45,
                    shadowRadius: isAiThinking ? 16 : 12,
                  },
                ]}
              >
                <View style={styles.balanceTopRow}>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Text style={[styles.balanceSubLabel, { marginBottom: 0 }]}>Parking Balance</Text>
                      <View style={styles.hourlyRatePill}>
                        <Text style={styles.hourlyRatePillText}>
                          {activeTicket.hourlyRate || 300} RWF/hr
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={styles.balanceNumber}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {((activeTicket.durationHours || 1) * (activeTicket.hourlyRate || 300)).toLocaleString()} RWF
                    </Text>
                  </View>

                  <TouchableOpacity style={styles.balancePlusBtn} onPress={handleTopUpWallet} activeOpacity={0.8}>
                    <Ionicons name="add" size={20} color="#09090B" />
                  </TouchableOpacity>
                </View>

                {/* Embossed Watermark P */}
                <View style={styles.watermarkLetterBox} pointerEvents="none">
                  <Text style={styles.watermarkLetter}>P</Text>
                </View>

                {/* Parking Tracker Divider */}
                <View style={styles.balanceDivider} />

                {/* Active Session Info Header */}
                <View style={styles.activeSessionInfoRow}>
                  <View style={styles.activeSessionInfoLeft}>
                    <Ionicons name="car-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.activeSessionSpotText} numberOfLines={1}>
                      Spot {activeTicket.spaceNumber} • {activeTicket.locationName}
                    </Text>
                  </View>
                  <View style={styles.activeSessionDurationPill}>
                    <Ionicons name="time-outline" size={11} color="#FFFFFF" />
                    <Text style={styles.activeSessionDurationText}>
                      {activeTicket.durationHours}h Booked
                    </Text>
                  </View>
                </View>

                {/* Municipal Contravention Fine Warning Banner */}
                {activeTicket.violationFine ? (
                  <View style={styles.contraventionFineBanner}>
                    <Ionicons name="warning" size={15} color="#EF4444" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contraventionFineTitle}>
                        MUNICIPAL FINE: +{activeTicket.violationFine.toLocaleString()} RWF
                      </Text>
                      <Text style={styles.contraventionFineSub}>
                        {activeTicket.violationReason || "Unauthorized vehicle in restricted parking facility"}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.balanceTrackerRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[styles.liveBlinkingDot, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" }]} />
                    <Text style={styles.trackerLabel}>Parking Tracker</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.trackerDigits}>{formatTimerDigits(elapsedSeconds)}</Text>
                    <Text style={[styles.trackerCountdownText, { color: isOverdue ? "#FFFFFF" : "#A1A1AA" }]}>
                      {isOverdue
                        ? `Overdue +${formatTimerDigits(elapsedSeconds - totalParkingSeconds)}`
                        : `${formatTimerDigits(remainingSeconds)} remaining`}
                    </Text>
                  </View>
                </View>

                {/* Progress Track Bar */}
                <View style={styles.trackerProgressBarBg}>
                  <View
                    style={[
                      styles.trackerProgressBarActive,
                      {
                        width: `${progressPercent}%`,
                        backgroundColor: isOverdue ? "#EF4444" : "#FFFFFF",
                      },
                    ]}
                  />
                </View>

                {/* Action Buttons: Extend and End Session */}
                <View style={styles.trackerActionButtonsRow}>
                  <TouchableOpacity
                    style={styles.trackerActionBtnSecondary}
                    onPress={() => handleExtendParkingTime(1)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.trackerActionBtnSecondaryText}>+1 Hour</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.trackerActionBtnPrimary}
                    onPress={handleEndParkingSession}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="log-out-outline" size={14} color="#09090B" />
                    <Text style={styles.trackerActionBtnPrimaryText}>
                      {isOverdue ? "Pay Overdue & Close" : "Close Booking"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </AnimatedBwGradientCard>
            ) : null}



            {/* PARKING NEARBY SECTION (Matches middle screen in user screenshot) */}
            {/* PARKING NEARBY / RECOMMENDED PARKING AREAS SECTION */}
            <View style={styles.nearbySectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.nearbySectionTitle, { color: theme.text }]}>
                  {isAiThinking
                    ? "AI Analyzing parking areas..."
                    : isAiMode
                      ? "Recommended parking areas"
                      : "Parking nearby"}
                </Text>
                {isAiThinking ? (
                  <View
                    style={[
                      styles.aiAreaBadge,
                      {
                        backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B",
                      },
                    ]}
                  >
                    <ActivityIndicator size="small" color={theme.isDark ? "#09090B" : "#FFFFFF"} style={{ transform: [{ scale: 0.65 }] }} />
                    <Text style={[styles.aiAreaBadgeText, { color: theme.isDark ? "#09090B" : "#FFFFFF" }]}>
                      DECIDING...
                    </Text>
                  </View>
                ) : isAiMode ? (
                  <View
                    style={[
                      styles.aiAreaBadge,
                      {
                        backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B",
                      },
                    ]}
                  >
                    <Ionicons name="sparkles" size={10} color={theme.isDark ? "#09090B" : "#FFFFFF"} />
                    <Text style={[styles.aiAreaBadgeText, { color: theme.isDark ? "#09090B" : "#FFFFFF" }]}>
                      AI MATCHED
                    </Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                style={[styles.viewOnMapPillBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => setShowMapView(!showMapView)}
                activeOpacity={0.8}
              >
                <Text style={[styles.viewOnMapPillText, { color: theme.text }]}>
                  {showMapView ? "Hide map" : "View on map"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Horizontal Zone Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.zonePillsScroll}
            >
              {["All zones", "Zone A", "Zone B", "Zone C", "Zone D", "Zone E"].map((zone) => {
                const isActive = activeZoneFilter === zone;
                return (
                  <TouchableOpacity
                    key={zone}
                    style={[
                      styles.zonePillChip,
                      {
                        backgroundColor: "transparent",
                        borderColor: isActive ? theme.text : theme.border,
                        borderWidth: isActive ? 2 : 1,
                      },
                    ]}
                    onPress={() => setActiveZoneFilter(zone)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.zonePillChipText,
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

            {/* AI Recommendation Context Subtitle */}
            {(isAiMode || isAiThinking) && (
              <View style={styles.aiRecommendedSubtitleRow}>
                {isAiThinking ? (
                  <ActivityIndicator size="small" color={theme.text} style={{ transform: [{ scale: 0.75 }] }} />
                ) : (
                  <Ionicons name="sparkles" size={12} color={theme.text} />
                )}
                <Text style={[styles.aiRecommendedSubtitleText, { color: theme.textSecondary }]}>
                  {isAiThinking
                    ? `AI thinking & analyzing ${selectedVehicle?.model || "your vehicle"} specs to optimize balances...`
                    : `Tuned for ${selectedVehicle?.model || "your vehicle"} • Target ≤ ${previousAverageRate} RWF/hr`}
                </Text>
              </View>
            )}

            {/* Horizontal Parking Nearby Cards OR Professional Empty State Card */}
            {displayedParkingLocations.length === 0 ? (
              <View
                style={[
                  styles.emptyFilteredStateCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    shadowColor: theme.cardShadow,
                  },
                ]}
              >
                {/* Concentric Icon Halo */}
                <View
                  style={[
                    styles.emptyStateIconHalo,
                    {
                      backgroundColor: theme.isDark
                        ? "rgba(255, 255, 255, 0.06)"
                        : "rgba(9, 9, 11, 0.04)",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.emptyStateIconCore,
                      {
                        backgroundColor: theme.isDark ? "#27272A" : "#F4F4F6",
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={searchQuery ? "search-outline" : "location-outline"}
                      size={24}
                      color={theme.text}
                    />
                  </View>
                </View>

                {/* Title & Description */}
                <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
                  {searchQuery
                    ? `No results for "${searchQuery}"`
                    : `No parking lots in ${activeZoneFilter}`}
                </Text>
                <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary }]}>
                  {searchQuery
                    ? `We couldn't find any parking facilities matching "${searchQuery}" in ${activeZoneFilter}. Try adjusting your keywords or clearing the search.`
                    : `There are currently no active parking facilities registered in ${activeZoneFilter}. Switch zones or clear filters to view nearby lots.`}
                </Text>

                {/* Action Buttons */}
                <View style={styles.emptyStateActionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.emptyStatePrimaryBtn,
                      {
                        backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B",
                      },
                    ]}
                    onPress={() => {
                      setActiveZoneFilter("All zones");
                      setSearchQuery("");
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={15}
                      color={theme.isDark ? "#09090B" : "#FFFFFF"}
                    />
                    <Text
                      style={[
                        styles.emptyStatePrimaryBtnText,
                        { color: theme.isDark ? "#09090B" : "#FFFFFF" },
                      ]}
                    >
                      Reset All Filters
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.emptyStateSecondaryBtn,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => setShowMapView(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="map-outline" size={15} color={theme.text} />
                    <Text
                      style={[
                        styles.emptyStateSecondaryBtnText,
                        { color: theme.text },
                      ]}
                    >
                      View Map
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Quick Jump Suggestions */}
                {activeZoneFilter !== "All zones" && (
                  <View style={styles.emptyStateQuickJumpBox}>
                    <Text style={[styles.emptyStateQuickJumpLabel, { color: theme.textMuted }]}>
                      Try exploring:
                    </Text>
                    <View style={styles.emptyStateChipsRow}>
                      {["All zones", "Zone A", "Zone C"].map((suggestedZone) => (
                        <TouchableOpacity
                          key={suggestedZone}
                          style={[
                            styles.emptyStateChipPill,
                            {
                              backgroundColor: theme.background,
                              borderColor: theme.border,
                            },
                          ]}
                          onPress={() => {
                            setActiveZoneFilter(suggestedZone);
                            setSearchQuery("");
                          }}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.emptyStateChipText, { color: theme.text }]}>
                            {suggestedZone}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.nearbyHorizontalCardsScroll}
              >
                {displayedParkingLocations.map((loc, cardIndex) => {
                  const isEvLot = Boolean(loc.is_electric_station);
                  const isHcLot = Boolean(loc.is_handicap_facility);
                  const isLotDisabled = (isEvLot && !isVehicleElectric) || (isHcLot && !isVehicleHandicap);
                  const showCardAiBorder = !isEvLot && (isAiMode || isAiThinking);
                  const bwBorderColor = theme.isDark
                    ? AI_BW_BORDER_COLORS_DARK[cardIndex % AI_BW_BORDER_COLORS_DARK.length]
                    : AI_BW_BORDER_COLORS_LIGHT[cardIndex % AI_BW_BORDER_COLORS_LIGHT.length];

                  return (
                    <AnimatedBwGradientCard
                      key={loc.id}
                      active={showCardAiBorder}
                      isThinking={isAiThinking}
                      borderRadius={18}
                      borderWidth={2}
                      animValue={aiBorderRotateAnim}
                      colorAnimValue={aiBorderColorAnim}
                      style={[
                        styles.nearbyScreenshotCard,
                        {
                          backgroundColor: theme.surface,
                          borderColor: (isAiMode || isAiThinking)
                            ? "transparent"
                            : isLotDisabled
                              ? "rgba(239, 68, 68, 0.45)"
                              : isEvLot
                                ? theme.evGreenBorder
                                : theme.border,
                          borderWidth: (isAiMode || isAiThinking) ? 0 : 1,
                          shadowColor: showCardAiBorder
                            ? (theme.isDark ? "#FFFFFF" : "#000000")
                            : theme.cardShadow,
                          shadowOpacity: showCardAiBorder ? (isAiThinking ? 0.65 : 0.35) : 0.08,
                          shadowRadius: showCardAiBorder ? (isAiThinking ? 14 : 10) : 4,
                          opacity: isLotDisabled ? 0.7 : 1,
                        },
                      ]}
                      onPress={() => {
                        if (isLotDisabled) {
                          Alert.alert(
                            "Restricted Parking Facility",
                            `This parking facility (${loc.name}) is strictly reserved for ${isEvLot ? "Electric Vehicles (EV)" : "Handicap Permit Holders"}.\n\nUnauthorized parking here incurs an immediate ${isEvLot ? "5,000 RWF" : "10,000 RWF"} Municipal Contravention Fine.\n\nDo you want to proceed and view lots?`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Proceed (Fine Applies)",
                                style: "destructive",
                                onPress: () => {
                                  setSelectedParkForSheet(loc);
                                },
                              },
                            ]
                          );
                        } else {
                          setSelectedParkForSheet(loc);
                        }
                      }}
                      activeOpacity={0.88}
                    >
                      <View style={styles.nearbyCardImgContainer}>
                        {loc.image_url ? (
                          <Image
                            source={{ uri: loc.image_url }}
                            style={styles.nearbyScreenshotCardImg}
                          />
                        ) : (
                          <View style={[styles.nearbyScreenshotCardImg, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }]}>
                            <Ionicons name="car-sport-outline" size={32} color={theme.textSecondary} />
                          </View>
                        )}
                        {/* Free Places Badge on Image */}
                        <View style={styles.freePlacesBadge}>
                          <Text style={styles.freePlacesBadgeText}>
                            {loc.available_spots ?? 0} free places
                          </Text>
                        </View>
                        {/* Zone Badge on Image */}
                        {loc.zone_code && (
                          <View style={styles.cardZoneBadge}>
                            <Text style={styles.cardZoneBadgeText}>{loc.zone_code}</Text>
                          </View>
                        )}
                        {/* EV Charging Station Badge */}
                        {isEvLot && (
                          <View
                            style={[
                              styles.cardEvStationBadge,
                              {
                                backgroundColor: isLotDisabled ? "rgba(239, 68, 68, 0.9)" : theme.evGreen,
                                borderColor: isLotDisabled ? "rgba(239, 68, 68, 0.9)" : "rgba(255, 255, 255, 0.3)",
                              },
                            ]}
                          >
                            <Ionicons name={isLotDisabled ? "lock-closed" : "flash"} size={10} color="#FFFFFF" />
                            <Text style={[styles.cardEvStationBadgeText, { color: "#FFFFFF" }]}>
                              {isLotDisabled ? "EV ONLY • DISABLED" : "EV ONLY"}
                            </Text>
                          </View>
                        )}
                        {/* Handicap Accessible Facility Badge */}
                        {isHcLot && (
                          <View style={[styles.cardEvStationBadge, { backgroundColor: isLotDisabled ? "rgba(239, 68, 68, 0.9)" : "rgba(9, 9, 11, 0.85)" }]}>
                            <Ionicons name={isLotDisabled ? "lock-closed" : "body"} size={10} color="#FFFFFF" />
                            <Text style={[styles.cardEvStationBadgeText, { color: "#FFFFFF" }]}>
                              {isLotDisabled ? "ACCESSIBLE • DISABLED" : "ACCESSIBLE ONLY"}
                            </Text>
                          </View>
                        )}
                        {/* Black and White AI Match Badge on Image */}
                        {isAiMode && (
                          <View
                            style={[
                              styles.geminiCardAiBadge,
                              {
                                backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B",
                                borderColor: theme.isDark ? "#09090B" : "#FFFFFF",
                                borderWidth: 1,
                              },
                            ]}
                          >
                            <Ionicons name="sparkles" size={10} color={theme.isDark ? "#09090B" : "#FFFFFF"} />
                            <Text style={[styles.geminiCardAiBadgeText, { color: theme.isDark ? "#09090B" : "#FFFFFF" }]}>
                              {cardIndex === 0
                                ? "TOP AI PICK • BEST VALUE"
                                : loc.hourly_rate <= previousAverageRate
                                  ? "CHEAPER THAN USUAL"
                                  : "AI MATCH"}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.nearbyCardInfoBox}>
                        <Text style={[styles.nearbyCardName, { color: theme.text }]} numberOfLines={1}>
                          {loc.name}
                        </Text>
                        <Text style={[styles.nearbyCardAddressText, { color: theme.textSecondary }]} numberOfLines={1}>
                          {loc.address}
                        </Text>
                        <Text style={[styles.nearbyCardRateText, { color: theme.text }]}>
                          {loc.hourly_rate} RWF/hour
                        </Text>
                        {/* AI Mode Cheap Balances & Savings Breakdown */}
                        {isAiMode && (
                          <View style={styles.aiBalanceEstimatedRow}>
                            <View
                              style={[
                                styles.aiBalancePill,
                                {
                                  backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(9, 9, 11, 0.06)",
                                  borderColor: theme.border,
                                },
                              ]}
                            >
                              <Ionicons name="wallet-outline" size={11} color={theme.text} />
                              <Text style={[styles.aiBalancePillText, { color: theme.text }]}>
                                AI 2h Bal: {(loc.hourly_rate * 2).toLocaleString()} RWF
                              </Text>
                            </View>
                            {loc.hourly_rate < previousAverageRate && (
                              <View
                                style={[
                                  styles.aiSavingsTag,
                                  {
                                    backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(9, 9, 11, 0.04)",
                                    borderColor: theme.border,
                                  },
                                ]}
                              >
                                <Text style={[styles.aiSavingsTagText, { color: theme.textSecondary }]}>
                                  Save {((previousAverageRate - loc.hourly_rate) * 2).toLocaleString()} RWF
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                        {isEvLot && isVehicleElectric && (
                          <View style={[styles.evRecommendedPill, { backgroundColor: theme.evGreenSoft, borderWidth: 1, borderColor: theme.evGreenBorder }]}>
                            <Text style={[styles.evRecommendedPillText, { color: theme.evGreen }]}>Recommended for your EV</Text>
                          </View>
                        )}
                        {isLotDisabled && (
                          <View style={[styles.evRecommendedPill, { backgroundColor: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.3)", borderWidth: 1 }]}>
                            <Text style={[styles.evRecommendedPillText, { color: theme.danger }]}>
                              {isEvLot ? "+5,000 RWF Fine for Non-EV" : "+10,000 RWF Fine without Permit"}
                            </Text>
                          </View>
                        )}
                      </View>
                    </AnimatedBwGradientCard>
                  );
                })}
              </ScrollView>
            )}

            {/* DEDICATED EV CHARGING STATIONS SECTION (Rounded Card & Fitted Content) */}
            <AnimatedBwGradientCard
              active={false}
              isThinking={false}
              borderRadius={20}
              borderWidth={1}
              animValue={aiBorderRotateAnim}
              colorAnimValue={aiBorderColorAnim}
              style={[
                styles.evGatewayCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: (isAiMode || isAiThinking) ? "transparent" : theme.evGreenBorder,
                  borderWidth: (isAiMode || isAiThinking) ? 0 : 1,
                },
              ]}
            >
              <View style={styles.evGatewayContentRow}>
                <View style={styles.evGatewayTextCol}>
                  <View style={styles.evHeaderRow}>
                    <Text style={[styles.evGatewayTitle, { color: theme.text }]} numberOfLines={1}>
                      {isVehicleElectric ? "EV Mode: All Parkings Available" : "EV Charging Stations"}
                    </Text>
                    <View style={[styles.evPillBadge, { backgroundColor: theme.evGreenSoft, borderWidth: 1, borderColor: theme.evGreenBorder }]}>
                      <Text style={[styles.evPillBadgeText, { color: theme.evGreen }]}>{isVehicleElectric ? "All Access" : "EV Only"}</Text>
                    </View>
                  </View>
                  <Text style={[styles.evGatewaySubtitle, { color: theme.textSecondary }]} numberOfLines={2}>
                    {isVehicleElectric
                      ? "Your vehicle is electric! All standard bays and fast EV charging stations are available."
                      : "Non-electric vehicle mode. Standard bays are displayed; EV stations are reserved for charging."}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.evGatewayActionBtn, { backgroundColor: theme.evGreen }]}
                onPress={() => router.push("/(tabs)/ev_chargers")}
                activeOpacity={0.85}
              >
                <Text style={[styles.evGatewayActionText, { color: theme.evGreenText }]} numberOfLines={1}>
                  {isVehicleElectric ? "Explore 150 kW Fast Chargers" : "View EV Stations Directory"}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={theme.evGreenText} />
              </TouchableOpacity>
            </AnimatedBwGradientCard>

            {/* RECENT PARKING SECTION (Matches middle screen in user screenshot) */}
            <View style={styles.recentSectionHeader}>
              <Text style={[styles.recentSectionTitle, { color: theme.text }]}>Recent parking</Text>
              <TouchableOpacity
                style={[styles.seeAllPillBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => router.push("/recent_parkings")}
                activeOpacity={0.8}
              >
                <Text style={[styles.seeAllPillText, { color: theme.text }]}>See all</Text>
              </TouchableOpacity>
            </View>

            {/* Recent Parking List */}
            <View style={styles.recentListContainer}>
              {filteredRecentParkings.length === 0 ? (
                <View style={[styles.emptyRecentBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="book-outline" size={24} color={theme.textSecondary} style={{ marginBottom: 6 }} />
                  <Text style={[styles.emptyRecentText, { color: theme.textSecondary }]}>
                    {searchQuery
                      ? `No recent parking records matching "${searchQuery}".`
                      : "No parking history recorded in your logbook yet."}
                  </Text>
                </View>
              ) : (
                filteredRecentParkings.map((item, index) => {
                  const isEvRecord = Boolean(
                    item.zoneCode?.toLowerCase().includes("ev") ||
                    item.duration?.toLowerCase().includes("charging") ||
                    item.name?.toLowerCase().includes("ev")
                  );
                  const showRecentAiBorder = !isEvRecord && (isAiMode || isAiThinking);
                  return (
                    <AnimatedBwGradientCard
                      key={item.id}
                      active={showRecentAiBorder}
                      isThinking={isAiThinking}
                      borderRadius={16}
                      borderWidth={1.5}
                      animValue={aiBorderRotateAnim}
                      colorAnimValue={aiBorderColorAnim}
                      style={[
                        styles.recentParkCard,
                        {
                          backgroundColor: theme.surface,
                          borderColor: (isAiMode || isAiThinking)
                            ? "transparent"
                            : isEvRecord
                              ? theme.evGreenBorder
                              : theme.border,
                          borderWidth: (isAiMode || isAiThinking) ? 0 : 1,
                          shadowColor: showRecentAiBorder ? (theme.isDark ? "#FFFFFF" : "#000000") : theme.cardShadow,
                          shadowOpacity: showRecentAiBorder ? (isAiThinking ? 0.5 : 0.3) : undefined,
                          shadowRadius: showRecentAiBorder ? (isAiThinking ? 12 : 8) : undefined,
                        },
                      ]}
                      onPress={() => {
                        router.push({
                          pathname: "/parking_session",
                          params: {
                            id: item.id,
                            name: item.name,
                            address: item.address,
                            bayNumber: item.bayNumber,
                            zoneCode: item.zoneCode,
                            plate: item.plate,
                            date: item.date,
                            duration: item.duration,
                            cost: item.cost.toString(),
                            currency: item.currency,
                            status: item.status,
                            receiptNumber: item.receiptNumber,
                            violationFine: item.violationFine ? item.violationFine.toString() : "",
                            violationReason: item.violationReason || "",
                          },
                        });
                      }}
                      activeOpacity={0.85}
                    >
                      {item.image ? (
                        <Image source={{ uri: item.image }} style={styles.recentParkImg} />
                      ) : (
                        <View style={[styles.recentParkImg, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border }]}>
                          <Ionicons name="car-sport-outline" size={22} color={theme.textSecondary} />
                        </View>
                      )}
                      <View style={styles.recentParkInfoCol}>
                        <Text style={[styles.recentParkTitle, { color: theme.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.recentParkAddr, { color: theme.textSecondary }]} numberOfLines={1}>
                          {item.address}
                        </Text>
                        <View
                          style={[
                            styles.recentStatusBadge,
                            isEvRecord && {
                              backgroundColor: theme.evGreenSoft,
                              borderWidth: 1,
                              borderColor: theme.evGreenBorder,
                            },
                          ]}
                        >
                          <Text style={[styles.recentStatusBadgeText, isEvRecord && { color: theme.evGreen }]}>
                            {item.status}
                          </Text>
                        </View>
                      </View>
                    </AnimatedBwGradientCard>
                  );
                })
              )}
            </View>
              </>
            )}
          </ScrollView>
        )}

        {/* FULL SCREEN NOTIFICATIONS MODAL */}
        <Modal
          visible={notificationsModalVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setNotificationsModalVisible(false)}
        >
          <SafeAreaView
            style={[styles.notificationsFullScreenContainer, { backgroundColor: theme.background }]}
            edges={["top", "bottom"]}
          >
            {/* Header */}
            <View
              style={[
                styles.notifTopBar,
                {
                  borderBottomColor: theme.border,
                  paddingTop: Math.max(insets.top, Platform.OS === "ios" ? 54 : 24) + 6,
                  paddingBottom: 14,
                },
              ]}
            >
              <View style={styles.notifHeaderLeftCol}>
                <TouchableOpacity
                  style={[styles.circularNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setNotificationsModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={20} color={theme.text} />
                </TouchableOpacity>

                <View style={styles.notifTitleBadgeGroup}>
                  <Text style={[styles.notifHeaderTitle, { color: theme.text }]}>Notifications</Text>
                  {unreadNotifsCount > 0 && (
                    <View style={[styles.notifUnreadBadge, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" }]}>
                      <Text style={[styles.notifUnreadBadgeText, { color: theme.isDark ? "#09090B" : "#FFFFFF" }]}>
                        {unreadNotifsCount} New
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {unreadNotifsCount > 0 ? (
                <TouchableOpacity
                  style={[
                    styles.notifMarkAllBtn,
                    {
                      backgroundColor: theme.isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(9, 9, 11, 0.05)",
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={handleMarkAllNotifsAsRead}
                  activeOpacity={0.75}
                >
                  <Ionicons name="checkmark-done" size={14} color={theme.text} style={{ marginRight: 4 }} />
                  <Text style={[styles.notifMarkAllText, { color: theme.text }]}>Mark all read</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.circularNavBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setNotificationsModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Category Filter Pills */}
            <View style={styles.notifFiltersContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.notifFiltersScroll}>
                {(["All", "Parking", "AI Radar", "Billing", "System"] as const).map((cat) => {
                  const isActive = notifFilter === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.notifFilterChip,
                        {
                          backgroundColor: isActive ? (theme.isDark ? "#FFFFFF" : "#09090B") : theme.surface,
                          borderColor: isActive ? (theme.isDark ? "#FFFFFF" : "#09090B") : theme.border,
                        },
                      ]}
                      onPress={() => setNotifFilter(cat)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.notifFilterChipText,
                          { color: isActive ? (theme.isDark ? "#09090B" : "#FFFFFF") : theme.textSecondary },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Notifications List */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.notifListContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredNotifications.length === 0 ? (
                <View style={styles.notifEmptyStateContainer}>
                  <View style={[styles.notifEmptyIconBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Ionicons name="notifications-off-outline" size={32} color={theme.textSecondary} />
                  </View>
                  <Text style={[styles.notifEmptyTitle, { color: theme.text }]}>No Notifications</Text>
                  <Text style={[styles.notifEmptySub, { color: theme.textSecondary }]}>
                    You don't have any notifications in "{notifFilter}" right now.
                  </Text>
                </View>
              ) : (
                filteredNotifications.map((notif) => {
                  return (
                    <View
                      key={notif.id}
                      style={[
                        styles.notifCard,
                        {
                          backgroundColor: theme.surface,
                          borderColor: notif.read ? theme.border : (theme.isDark ? "#FFFFFF" : "#09090B"),
                          borderWidth: notif.read ? 1 : 1.5,
                          shadowColor: theme.cardShadow,
                        },
                      ]}
                    >
                      <View style={styles.notifCardTopRow}>
                        <View
                          style={[
                            styles.notifIconCircle,
                            {
                              backgroundColor: theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <Ionicons name={notif.icon} size={18} color={theme.text} />
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={[styles.notifCategoryTag, { color: theme.textSecondary }]}>
                              {notif.category} • {notif.timestamp}
                            </Text>
                            {!notif.read && (
                              <View style={[styles.notifUnreadDot, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B" }]} />
                            )}
                          </View>
                          <Text style={[styles.notifTitle, { color: theme.text }]} numberOfLines={1}>
                            {notif.title}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => handleDismissNotification(notif.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close" size={16} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.notifMessage, { color: theme.textSecondary }]}>
                        {notif.message}
                      </Text>

                      {notif.actionText && (
                        <View style={styles.notifActionRow}>
                          <TouchableOpacity
                            style={[
                              styles.notifActionBtn,
                              {
                                backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B",
                              },
                            ]}
                            onPress={() => handleNotificationAction(notif)}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.notifActionBtnText,
                                { color: theme.isDark ? "#09090B" : "#FFFFFF" },
                              ]}
                            >
                              {notif.actionText}
                            </Text>
                            <Ionicons
                              name="arrow-forward"
                              size={12}
                              color={theme.isDark ? "#09090B" : "#FFFFFF"}
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* WRITE MOTORIST REVIEW MODAL (Location Reviews) */}
        <Modal
          visible={reviewModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setReviewModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContentBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.modalTitleText, { color: theme.text }]}>Write a Review</Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
                    {selectedLocation?.name || "Parking Facility"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setReviewModalVisible(false)}>
                  <Ionicons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              {/* Star Rating Picker */}
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginVertical: 14 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setNewReviewRating(star)}
                    activeOpacity={0.7}
                    style={{ padding: 4 }}
                  >
                    <Ionicons
                      name={star <= newReviewRating ? "star" : "star-outline"}
                      size={32}
                      color={star <= newReviewRating ? "#EAB308" : theme.textMuted}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tag Selection Chips */}
              <Text style={{ fontSize: 11, fontWeight: "600", color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 8 }}>
                QUICK HIGHLIGHTS
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {["Easy Access", "Fast Barrier", "Clean EV Chargers", "24/7 Security", "Spacious Bays", "Well Lit"].map((tag) => {
                  const isSelected = selectedReviewTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 10,
                        backgroundColor: isSelected ? theme.pillActiveBg : theme.background,
                        borderWidth: 1,
                        borderColor: isSelected ? theme.pillActiveBg : theme.border,
                      }}
                      onPress={() => {
                        setSelectedReviewTags((prev) =>
                          isSelected ? prev.filter((t) => t !== tag) : [...prev, tag]
                        );
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "500",
                          color: isSelected ? theme.pillActiveText : theme.text,
                        }}
                      >
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Review Text Input */}
              <Text style={{ fontSize: 11, fontWeight: "600", color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 6 }}>
                YOUR MOTORIST FEEDBACK
              </Text>
              <TextInput
                style={{
                  height: 90,
                  borderRadius: 14,
                  borderWidth: 1,
                  padding: 12,
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                  fontSize: 13,
                  textAlignVertical: "top",
                  marginBottom: 16,
                }}
                placeholder="Share details on gate responsiveness, bay markings, or security..."
                placeholderTextColor={theme.textMuted}
                multiline
                numberOfLines={4}
                value={newReviewComment}
                onChangeText={setNewReviewComment}
              />

              {/* Submit Action */}
              <TouchableOpacity
                style={[styles.fullWidthPillBtn, { backgroundColor: theme.primaryBtnBg }]}
                onPress={handleSubmitReview}
                disabled={submittingReview}
                activeOpacity={0.85}
              >
                {submittingReview ? (
                  <ActivityIndicator color={theme.primaryBtnText} />
                ) : (
                  <Text style={[styles.fullWidthPillBtnText, { color: theme.primaryBtnText }]}>
                    Publish Verified Review
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* AUX MODAL: QR SCANNER */}
        <Modal visible={qrModalVisible} animationType="slide" transparent onRequestClose={() => setQrModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContentBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.modalTitleText, { color: theme.text }]}>Scan Bay Token</Text>
                <TouchableOpacity onPress={() => setQrModalVisible(false)}>
                  <Ionicons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Enter Bay Code or QR Token"
                placeholderTextColor={theme.textMuted}
                value={manualQrCode}
                onChangeText={setManualQrCode}
              />
              <TouchableOpacity
                style={[styles.fullWidthPillBtn, { backgroundColor: theme.primaryBtnBg, marginTop: 12 }]}
                onPress={async () => {
                  const trimmed = manualQrCode.trim();
                  if (!trimmed) return;
                  setQrModalVisible(false);
                  await handleBarcodeScanned({ data: trimmed });
                  setQrScannerVisible(true);
                }}
              >
                <Text style={[styles.fullWidthPillBtnText, { color: theme.primaryBtnText }]}>Lookup Bay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* AUX MODAL: AGENT AUDIT */}
        <Modal visible={agentModalVisible} animationType="slide" transparent onRequestClose={() => setAgentModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContentBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.modalTitleText, { color: theme.text }]}>Marshal Audit Mode</Text>
                <TouchableOpacity onPress={() => setAgentModalVisible(false)}>
                  <Ionicons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
                placeholder="Scan or enter vehicle plate..."
                placeholderTextColor={theme.textMuted}
                value={agentPlateInput}
                onChangeText={setAgentPlateInput}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[styles.fullWidthPillBtn, { backgroundColor: theme.primaryBtnBg, marginTop: 12 }]}
                onPress={handleAgentAuditSearch}
              >
                <Text style={[styles.fullWidthPillBtnText, { color: theme.primaryBtnText }]}>Verify Plate</Text>
              </TouchableOpacity>
              {agentSearching ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={theme.text} />
                  <Text style={{ marginTop: 8, fontSize: 12, color: theme.textSecondary }}>
                    Verifying plate against blind index HMAC-SHA256...
                  </Text>
                </View>
              ) : agentAudit ? (
                <View
                  style={[
                    styles.auditResultBox,
                    {
                      backgroundColor: theme.background,
                      borderColor:
                        agentAudit.status === "PAID" || agentAudit.status === "GRACE_BUFFER"
                          ? theme.borderStrong
                          : theme.danger,
                      borderWidth: 1.5,
                    },
                  ]}
                >
                  {/* Status Badge */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor:
                          agentAudit.status === "PAID"
                            ? theme.pillActiveBg
                            : agentAudit.status === "GRACE_BUFFER"
                              ? theme.pillInactiveBg
                              : theme.dangerSoft,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          letterSpacing: 0.5,
                          color:
                            agentAudit.status === "PAID"
                              ? theme.pillActiveText
                              : agentAudit.status === "GRACE_BUFFER"
                                ? theme.text
                                : theme.danger,
                        }}
                      >
                        {agentAudit.status === "PAID"
                          ? "PAID • AUTHORIZED"
                          : agentAudit.status === "GRACE_BUFFER"
                            ? "GRACE BUFFER • 15M"
                            : agentAudit.status === "OVERDUE"
                              ? "OVERDUE INVOICE"
                              : "UNREGISTERED VEHICLE"}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 13, fontWeight: "500", color: theme.text }}>
                      {agentAudit.masked_plate}
                    </Text>
                  </View>

                  {/* Details Breakdown */}
                  {agentAudit.status === "PAID" && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>
                        Vehicle has an active registered parking session.
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: "500", color: theme.text }}>
                        Zero Contact Mandate: Permitted action is NONE. Do not touch vehicle.
                      </Text>
                    </View>
                  )}

                  {agentAudit.status === "GRACE_BUFFER" && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>
                        15-minute arrival check-in window active ({Math.round((agentAudit.seconds_remaining || 600) / 60)}m left).
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: "500", color: theme.text }}>
                        Permitted action: NONE. Allow driver to complete parking session.
                      </Text>
                    </View>
                  )}

                  {agentAudit.status === "OVERDUE" && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
                        Prepaid parking expired. Overdue balance:{" "}
                        <Text style={{ fontWeight: "500", color: theme.text }}>
                          {(agentAudit.overdue_amount || 1200).toLocaleString()} RWF
                        </Text>
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.fullWidthPillBtn,
                          { backgroundColor: theme.primaryBtnBg, marginTop: 4 },
                        ]}
                        onPress={handleFlagOverdue}
                        disabled={isFlaggingOverdue}
                      >
                        <Text style={[styles.fullWidthPillBtnText, { color: theme.primaryBtnText }]}>
                          {isFlaggingOverdue ? "Flagging..." : "Flag Overdue Invoice (MoMo Push)"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {agentAudit.status === "UNREGISTERED" && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
                        Zero app check-in record found for this plate. Subject to municipal contravention.
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.fullWidthPillBtn,
                          { backgroundColor: "#EF4444", marginTop: 4 },
                        ]}
                        onPress={handleIssueCitation}
                        disabled={isIssuingFine}
                      >
                        <Text style={[styles.fullWidthPillBtnText, { color: "#FFFFFF" }]}>
                          {isIssuingFine ? "Issuing Citation..." : "Issue 3,000 RWF Citation (Irembo)"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
        {/* SPOT SELECTION BOTTOM SHEET (Matches left screen in screenshot) */}
        <Modal
          visible={!!selectedParkForSheet && !confirmBookingSheetVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedParkForSheet(null)}
        >
          <View style={styles.sheetModalBackdrop}>
            <View style={[styles.spotSelectionSheetBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {/* Header: Title, Address, Close X */}
              <View style={styles.sheetHeaderRow}>
                <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                  <Text style={[styles.sheetMainTitle, { color: theme.text }]} numberOfLines={1}>
                    {selectedParkForSheet?.name || "Parking Facility"}
                  </Text>
                  <Text style={[styles.sheetSubTitle, { color: theme.textSecondary }]} numberOfLines={1}>
                    {selectedParkForSheet?.address || ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.circularCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                  onPress={() => setSelectedParkForSheet(null)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              {/* Zone Selector Pills */}
              {sheetAvailableZones.length > 0 && (
                <View style={styles.sheetZonePillsWrapper}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.sheetZonePillsRow}
                  >
                    {sheetAvailableZones.map((zn) => {
                      const isSelected = selectedSheetZone === zn;
                      const isZoneDisabled = (zn === "Zone A" && !isVehicleElectric) || (zn === "Zone E" && !isVehicleHandicap);
                      return (
                        <TouchableOpacity
                          key={zn}
                          style={[
                            styles.sheetZonePill,
                            {
                              backgroundColor: "transparent",
                              borderColor: isSelected
                                ? theme.text
                                : isZoneDisabled
                                  ? "rgba(239, 68, 68, 0.45)"
                                  : theme.border,
                              borderWidth: isSelected ? 2 : 1,
                              opacity: isZoneDisabled ? 0.65 : 1,
                            },
                          ]}
                          onPress={() => {
                            if (isZoneDisabled) {
                              Alert.alert(
                                "Restricted Parking Zone",
                                `${zn} is strictly designated for ${zn === "Zone A" ? "Electric Vehicles (EV)" : "Handicap Permit Holders"}.\n\nNon-authorized parking in this zone incurs an immediate ${zn === "Zone A" ? "5,000 RWF" : "10,000 RWF"} Municipal Fine.\n\nDo you want to switch to this zone?`,
                                [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Select Zone (Fine Applies)",
                                    style: "destructive",
                                    onPress: () => handleSelectSheetZone(zn),
                                  },
                                ]
                              );
                            } else {
                              handleSelectSheetZone(zn);
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            {isZoneDisabled && (
                              <Ionicons name="lock-closed" size={10} color="#EF4444" />
                            )}
                            <Text
                              style={[
                                styles.sheetZonePillText,
                                {
                                  color: isSelected ? theme.text : isZoneDisabled ? "#EF4444" : theme.textSecondary,
                                  fontWeight: isSelected ? "600" : "400",
                                },
                              ]}
                            >
                              {zn}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Zone Description Subheader & 2D/3D Aerial Toggle */}
              <View style={{ paddingHorizontal: 20, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: theme.text }}>
                    {currentSheetLot.title}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                    {currentSheetLot.description}
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
                    backgroundColor: sheetIs3DView ? theme.primaryBtnBg : theme.background,
                    borderColor: sheetIs3DView ? theme.primaryBtnBg : theme.border,
                  }}
                  onPress={() => setSheetIs3DView(!sheetIs3DView)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={sheetIs3DView ? "cube" : "cube-outline"}
                    size={13}
                    color={sheetIs3DView ? theme.primaryBtnText : theme.text}
                  />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: sheetIs3DView ? theme.primaryBtnText : theme.text,
                    }}
                  >
                    {sheetIs3DView ? "3D Aerial" : "2D Grid"}
                  </Text>
                </TouchableOpacity>
              </View>

              {sheetIs3DView ? (
                <View style={{ maxHeight: 380, paddingHorizontal: 16 }}>
                  <AerialParkingLot3D
                    topology={selectedParkForSheet?.layout_topology || "perpendicular"}
                    spaces={
                      selectedSheetZone
                        ? sheetSpaces.filter((s) => (s.zone_code || "Zone A") === selectedSheetZone)
                        : sheetSpaces
                    }
                    selectedSpaceId={
                      sheetSpaces.find((s) => s.space_number === selectedSheetBay)?.id || null
                    }
                    onSelectSpace={(sp) => {
                      setSelectedSheetBay(sp.space_number);
                      if (sp.space_type === "ev" || selectedParkForSheet?.is_electric_station) {
                        setInspectedSheetSpace(sp);
                      }
                    }}
                    currentZone={selectedSheetZone || "Zone A"}
                    locationName={selectedParkForSheet?.name || "Parking Facility"}
                    lotKind={selectedParkForSheet?.is_electric_station ? "charging" : "parking"}
                    hideSelectionCard={true}
                    compact={true}
                  />
                </View>
              ) : (
              /* 2-Column Bays & Cars Grid */
              <ScrollView style={styles.sheetBaysScroll} showsVerticalScrollIndicator={false}>
                {loadingSheetSpaces ? (
                  <BayGridSkeleton count={6} />
                ) : sheetSpaces.length === 0 ? (
                  <View style={{ paddingVertical: 32, paddingHorizontal: 20, alignItems: "center" }}>
                    <Ionicons name="grid-outline" size={28} color={theme.textSecondary} />
                    <Text style={{ fontSize: 13, fontWeight: "500", color: theme.text, marginTop: 8 }}>
                      No Parking Bays Registered
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, textAlign: "center", marginTop: 4 }}>
                      This facility currently has 0 bays in the database.
                    </Text>
                  </View>
                ) : (() => {
                  const isEvLot = Boolean(selectedParkForSheet?.is_electric_station);
                  const formatSpotLabel = (rawType?: string) => {
                    if (isEvLot) return rawType || "Available";
                    if (!rawType) return "Available";
                    const sanitized = rawType
                      .replace(/\b\d+\s*k\s*w\b/gi, "")
                      .replace(/\b(ac|dc)\b/gi, "")
                      .replace(/Covered\s*/gi, "Covered")
                      .trim();
                    return sanitized || "Standard Bay";
                  };

                  return (
                    <View style={styles.sheetBaysTwoCols}>
                      {/* Column 1 */}
                      <View style={styles.sheetBayColumn}>
                        {currentSheetLot.leftColumn.map((spot) => {
                          const matchedSp = sheetSpaces.find((s) => s.space_number === spot.bayNumber) || {
                            id: spot.id,
                            location_id: selectedParkForSheet?.id || "",
                            space_number: spot.bayNumber,
                            zone_code: selectedSheetZone || "Zone A",
                            space_type: (spot.spaceType || "regular") as any,
                            is_occupied: spot.isOccupied,
                            qr_code_token: `QR-${spot.bayNumber}`,
                          };

                          if (spot.isOccupied) {
                            return (
                              <TouchableOpacity
                                key={spot.id}
                                activeOpacity={0.8}
                                onPress={() => {
                                  if (spot.spaceType === "ev" || isEvLot) {
                                    setInspectedSheetSpace(matchedSp);
                                  } else {
                                    Alert.alert(
                                      `Bay ${spot.bayNumber} Occupied`,
                                      "This parking bay is currently occupied by a parked vehicle."
                                    );
                                  }
                                }}
                                style={styles.occupiedBayGraphicCard}
                              >
                                <HorizontalUltraRealisticCar color={spot.carColor} />
                                {(spot.spaceType === "ev" || isEvLot) && (
                                  <View style={{ position: "absolute", bottom: 2, right: 6, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                                    <Ionicons name="flash" size={8} color="#10B981" />
                                    <Text style={{ fontSize: 8, fontWeight: "700", color: "#10B981" }}>CHARGING</Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          }
                          const isSelected = selectedSheetBay === spot.bayNumber;
                          const isEvSpot = spot.spaceType === "ev" || spot.bayNumber.toLowerCase().startsWith("ev");
                          const isHcSpot = spot.spaceType === "handicap" || spot.bayNumber.toLowerCase().startsWith("h");
                          const isSpotDisabled = (isEvSpot && !isVehicleElectric) || (isHcSpot && !isVehicleHandicap);

                          return (
                            <TouchableOpacity
                              key={spot.id}
                              style={[
                                styles.bayAvailableCard,
                                {
                                  backgroundColor: "transparent",
                                  borderColor: isSelected
                                    ? (isEvSpot ? theme.evGreen : theme.text)
                                    : isSpotDisabled
                                      ? "rgba(239, 68, 68, 0.45)"
                                      : isEvSpot
                                        ? theme.evGreenBorder
                                        : theme.border,
                                  borderWidth: isSelected ? 2.5 : 1,
                                  opacity: isSpotDisabled ? 0.55 : 1,
                                },
                              ]}
                              onPress={() => {
                                setSelectedSheetBay(spot.bayNumber);
                                if (isEvSpot) {
                                  setInspectedSheetSpace(matchedSp);
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.bayNumberBold, { color: theme.text }]}>
                                {spot.bayNumber}
                              </Text>
                              <Text style={[styles.bayStatusSub, { color: isEvSpot && !isSpotDisabled ? theme.evGreen : isSelected ? theme.text : theme.textSecondary }]}>
                                {formatSpotLabel(spot.spotType)}
                              </Text>
                              {isSpotDisabled && (
                                <View style={styles.disabledBayBadge}>
                                  <Ionicons name="lock-closed" size={8} color="#EF4444" />
                                  <Text style={styles.disabledBayBadgeText}>{isEvSpot ? "EV ONLY" : "PERMIT REQ"}</Text>
                                </View>
                              )}
                              {isSelected && (
                                <View style={[styles.selectedCheckDot, { backgroundColor: isEvSpot ? theme.evGreen : theme.text, top: 4, right: 4 }]}>
                                  <Ionicons name="checkmark" size={10} color={isEvSpot ? theme.evGreenText : theme.background} />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Column 2 */}
                      <View style={styles.sheetBayColumn}>
                        {currentSheetLot.rightColumn.map((spot) => {
                          const matchedSp = sheetSpaces.find((s) => s.space_number === spot.bayNumber) || {
                            id: spot.id,
                            location_id: selectedParkForSheet?.id || "",
                            space_number: spot.bayNumber,
                            zone_code: selectedSheetZone || "Zone A",
                            space_type: (spot.spaceType || "regular") as any,
                            is_occupied: spot.isOccupied,
                            qr_code_token: `QR-${spot.bayNumber}`,
                          };

                          if (spot.isOccupied) {
                            return (
                              <TouchableOpacity
                                key={spot.id}
                                activeOpacity={0.8}
                                onPress={() => {
                                  if (spot.spaceType === "ev" || isEvLot) {
                                    setInspectedSheetSpace(matchedSp);
                                  } else {
                                    Alert.alert(
                                      `Bay ${spot.bayNumber} Occupied`,
                                      "This parking bay is currently occupied by a parked vehicle."
                                    );
                                  }
                                }}
                                style={styles.occupiedBayGraphicCard}
                              >
                                <HorizontalUltraRealisticCar color={spot.carColor} />
                                {(spot.spaceType === "ev" || isEvLot) && (
                                  <View style={{ position: "absolute", bottom: 2, right: 6, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                                    <Ionicons name="flash" size={8} color="#10B981" />
                                    <Text style={{ fontSize: 8, fontWeight: "700", color: "#10B981" }}>CHARGING</Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          }
                          const isSelected = selectedSheetBay === spot.bayNumber;
                          const isEvSpot = spot.spaceType === "ev" || spot.bayNumber.toLowerCase().startsWith("ev");
                          const isHcSpot = spot.spaceType === "handicap" || spot.bayNumber.toLowerCase().startsWith("h");
                          const isSpotDisabled = (isEvSpot && !isVehicleElectric) || (isHcSpot && !isVehicleHandicap);

                          return (
                            <TouchableOpacity
                              key={spot.id}
                              style={[
                                styles.bayAvailableCard,
                                {
                                  backgroundColor: "transparent",
                                  borderColor: isSelected
                                    ? (isEvSpot ? theme.evGreen : theme.text)
                                    : isSpotDisabled
                                      ? "rgba(239, 68, 68, 0.45)"
                                      : isEvSpot
                                        ? theme.evGreenBorder
                                        : theme.border,
                                  borderWidth: isSelected ? 2.5 : 1,
                                  opacity: isSpotDisabled ? 0.55 : 1,
                                },
                              ]}
                              onPress={() => {
                                setSelectedSheetBay(spot.bayNumber);
                                if (isEvSpot) {
                                  setInspectedSheetSpace(matchedSp);
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.bayNumberBold, { color: theme.text }]}>
                                {spot.bayNumber}
                              </Text>
                              <Text style={[styles.bayStatusSub, { color: isEvSpot && !isSpotDisabled ? theme.evGreen : isSelected ? theme.text : theme.textSecondary }]}>
                                {formatSpotLabel(spot.spotType)}
                              </Text>
                              {isSpotDisabled && (
                                <View style={styles.disabledBayBadge}>
                                  <Ionicons name="lock-closed" size={8} color="#EF4444" />
                                  <Text style={styles.disabledBayBadgeText}>{isEvSpot ? "EV ONLY" : "PERMIT REQ"}</Text>
                                </View>
                              )}
                              {isSelected && (
                                <View style={[styles.selectedCheckDot, { backgroundColor: isEvSpot ? theme.evGreen : theme.text, top: 4, right: 4 }]}>
                                  <Ionicons name="checkmark" size={10} color={isEvSpot ? theme.evGreenText : theme.background} />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()}
              </ScrollView>
              )}

              {/* Sticky Continue Button with Circle Arrow */}
              <TouchableOpacity
                style={styles.sheetContinueBtn}
                onPress={() => setConfirmBookingSheetVisible(true)}
                activeOpacity={0.88}
              >
                <Text style={styles.sheetContinueBtnText}>Continue</Text>
                <View style={styles.sheetContinueCircleArrow}>
                  <Ionicons name="arrow-forward" size={18} color="#09090B" />
                </View>
              </TouchableOpacity>

              {/* EV Bay Detail Inspection Modal */}
              {inspectedSheetSpace && selectedParkForSheet && (
                <EvBayDetailModal
                  locationId={selectedParkForSheet.id}
                  space={inspectedSheetSpace}
                  chargers={[]}
                  onClose={() => setInspectedSheetSpace(null)}
                  onStartCharging={(details) => {
                    setInspectedSheetSpace(null);
                    setSelectedSheetBay(details.bayNumber);
                    setConfirmBookingSheetVisible(true);
                  }}
                />
              )}
            </View>
          </View>
        </Modal>

        {/* CONFIRM BOOKING BOTTOM SHEET (Matches right screen in screenshot) */}
        <Modal
          visible={confirmBookingSheetVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setConfirmBookingSheetVisible(false)}
        >
          <View style={styles.sheetModalBackdrop}>
            <View style={[styles.confirmSheetBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {/* Top Handle Bar */}
              <View style={styles.confirmHandleBar} />

              {/* Header: Title, Subtitle, Close X */}
              <View style={styles.confirmHeaderRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.confirmHeaderTitle, { color: theme.text }]}>Confirm booking</Text>
                  <Text style={[styles.confirmHeaderSubtitle, { color: theme.textSecondary }]}>
                    {selectedParkForSheet?.name || "Parking Facility"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.circularCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                  onPress={() => setConfirmBookingSheetVisible(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              {(() => {
                const isConfirmEv =
                  selectedSheetZone === "Zone A" ||
                  Boolean(selectedParkForSheet?.is_electric_station) ||
                  selectedSheetBay.toLowerCase().startsWith("ev");
                const isConfirmHc =
                  selectedSheetZone === "Zone E" ||
                  Boolean(selectedParkForSheet?.is_handicap_facility) ||
                  selectedSheetBay.toLowerCase().startsWith("h");
                const isEvChargingSession = isConfirmEv && isVehicleElectric;
                const confirmFineAmount = (isConfirmEv && !isVehicleElectric) ? 5000 : (isConfirmHc && !isVehicleHandicap) ? 10000 : 0;
                const confirmFineReason = (isConfirmEv && !isVehicleElectric) ? "Unauthorized Non-EV in EV Bay" : (isConfirmHc && !isVehicleHandicap) ? "Unauthorized Vehicle in Accessible Bay" : "";
                const baseBookingCost = isEvChargingSession ? 0 : (selectedParkForSheet?.hourly_rate || 300) * durationHours;
                const totalBookingCost = baseBookingCost + confirmFineAmount;

                return (
                  <>
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ paddingBottom: 10 }}
                      bounces={false}
                    >
                      {/* Summary Boxes Row: Parking zone & Parking place with Space Image */}
                      <View style={styles.confirmSummaryRow}>
                        <View style={[styles.confirmSummaryBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                          <Text style={[styles.confirmSummaryLabel, { color: theme.textSecondary }]}>Parking zone</Text>
                          <Text style={[styles.confirmSummaryValue, { color: theme.text }]}>{selectedSheetZone || "-"}</Text>
                        </View>

                        <View style={[styles.confirmSummaryBox, { backgroundColor: theme.background, borderColor: theme.border, flexDirection: "row", alignItems: "center", gap: 10 }]}>
                          {(() => {
                            const matchedSpace = sheetSpaces.find((s) => s.space_number === selectedSheetBay);
                            const spaceImg = matchedSpace?.image_url || selectedParkForSheet?.image_url;
                            return spaceImg ? (
                              <Image
                                source={{ uri: spaceImg }}
                                style={{ width: 38, height: 38, borderRadius: 9, borderWidth: 1, borderColor: theme.border }}
                              />
                            ) : null;
                          })()}
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.confirmSummaryLabel, { color: theme.textSecondary }]}>Parking place</Text>
                            <Text style={[styles.confirmSummaryValue, { color: theme.text }]}>{selectedSheetBay || "-"}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Timeframe Selector Section */}
                      <View style={styles.confirmTimeframeSection}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <Text style={[styles.confirmTimeframeLabel, { color: theme.textSecondary }]}>Select Timeframe</Text>
                          <View style={[styles.exitEstPill, { backgroundColor: theme.background, borderColor: theme.border }]}>
                            <Ionicons name="time-outline" size={11} color={theme.text} />
                            <Text style={[styles.exitEstText, { color: theme.text }]}>
                              Exit ~ {new Date(Date.now() + durationHours * 3600 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </Text>
                          </View>
                        </View>

                        {/* Quick Hours Pills */}
                        <View style={styles.timeframePillsRow}>
                          {[1, 2, 3, 4, 6, 8].map((h) => {
                            const isSelected = durationHours === h;
                            return (
                              <TouchableOpacity
                                key={h}
                                style={[
                                  styles.timeframeChip,
                                  {
                                    backgroundColor: "transparent",
                                    borderColor: isSelected ? theme.text : theme.border,
                                    borderWidth: isSelected ? 2 : 1,
                                  },
                                ]}
                                onPress={() => setDurationHours(h)}
                                activeOpacity={0.8}
                              >
                                <Text
                                  style={[
                                    styles.timeframeChipText,
                                    {
                                      color: isSelected ? theme.text : theme.textSecondary,
                                      fontWeight: isSelected ? "600" : "400",
                                    },
                                  ]}
                                >
                                  {h}h
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Stepper with Duration & Cost Preview */}
                        <View style={[styles.timeframeStepperRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
                          <TouchableOpacity
                            style={styles.stepperActionBtn}
                            onPress={() => setDurationHours((prev) => Math.max(1, prev - 1))}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="remove" size={18} color={theme.text} />
                          </TouchableOpacity>

                          <View style={{ alignItems: "center" }}>
                            <Text style={[styles.stepperDurationText, { color: theme.text }]}>
                              {durationHours} {durationHours === 1 ? "Hour" : "Hours"}
                            </Text>
                            <Text style={[styles.stepperCostSubtext, { color: theme.textSecondary }]}>
                              Est. Total: {((selectedParkForSheet?.hourly_rate || 300) * durationHours).toLocaleString()} RWF
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.stepperActionBtn}
                            onPress={() => setDurationHours((prev) => prev + 1)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="add" size={18} color={theme.text} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Municipal Contravention Fine Warning Box (if applicable) */}
                      {isEvChargingSession ? (
                        <View style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 12 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <Ionicons name="flash" size={13} color={theme.evGreen} />
                            <Text style={{ fontSize: 11.5, fontWeight: "600", color: theme.text }}>
                              EV Charging Session (Separated from Parking)
                            </Text>
                          </View>
                          <Text style={{ fontSize: 10.5, color: theme.textSecondary, lineHeight: 15 }}>
                            Charging Fee: 9,000 RWF via Mobile Payment • Parking Fee: 0 RWF
                          </Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 9, marginBottom: 12 }}>
                          <Text style={{ fontSize: 10.5, fontWeight: "500", color: theme.textSecondary }}>
                            Standard Parking Session • EV Charging Billed Separately
                          </Text>
                        </View>
                      )}

                      {confirmFineAmount > 0 && (
                        <View style={styles.sheetFineWarningBox}>
                          <Ionicons name="warning" size={18} color="#EF4444" />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sheetFineWarningTitle}>
                              +{confirmFineAmount.toLocaleString()} RWF Municipal Fine Applied
                            </Text>
                            <Text style={styles.sheetFineWarningSub}>
                              {confirmFineReason}. EV charging disabled for Non-EVs; billed to parking session.
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Payment Section */}
                      <View style={styles.confirmPaymentSection}>
                        <Text style={[styles.confirmPaymentLabel, { color: theme.textSecondary }]}>Payment</Text>
                        <View style={[styles.confirmPaymentBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <Ionicons name={isEvChargingSession ? "phone-portrait-outline" : "wallet-outline"} size={18} color={theme.text} />
                            <Text style={[styles.paymentMethodText, { color: theme.text }]}>
                              {isEvChargingSession
                                ? "MTN MoMo (0790889899)"
                                : paymentMethods[0]
                                ? `${paymentMethods[0].provider_name} • ${paymentMethods[0].masked_identifier}`
                                : `ParkZone Wallet (${ParkingBalance} RWF)`}
                            </Text>
                          </View>

                          {!isEvChargingSession && (
                            <TouchableOpacity
                              style={[styles.paymentEditBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                              onPress={() => {
                                setConfirmBookingSheetVisible(false);
                                setSelectedParkForSheet(null);
                                router.push("/(tabs)/payments");
                              }}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="pencil-outline" size={15} color={theme.text} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </ScrollView>

                    {/* Bottom Row: Rate & Confirm Button */}
                    <View style={[styles.confirmFooterRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
                      <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                        <Text style={[styles.confirmRateNumber, { color: theme.text }]}>
                          {isEvChargingSession ? "9,000 RWF" : `${totalBookingCost.toLocaleString()} RWF`}
                        </Text>
                        <Text style={[styles.confirmRateUnit, { color: theme.textSecondary }]} numberOfLines={1}>
                          {isEvChargingSession
                            ? "Session charging fee (0 RWF Park)"
                            : confirmFineAmount > 0
                            ? `Base: ${baseBookingCost.toLocaleString()} + Fine: ${confirmFineAmount.toLocaleString()} RWF`
                            : `${durationHours}h @ ${selectedParkForSheet?.hourly_rate || 300} RWF/hr`}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.confirmFinalBtn,
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            backgroundColor:
                              confirmFineAmount > 0
                                ? theme.danger
                                : theme.primaryBtnBg,
                          },
                        ]}
                        onPress={handleConfirmSheetBooking}
                        activeOpacity={0.88}
                      >
                        {(isEvChargingSession || isConfirmEv) && confirmFineAmount === 0 && (
                          <Ionicons name="card-outline" size={15} color={theme.primaryBtnText} />
                        )}
                        <Text
                          style={[
                            styles.confirmFinalBtnText,
                            {
                              color:
                                confirmFineAmount > 0
                                  ? "#FFFFFF"
                                  : theme.primaryBtnText,
                            },
                          ]}
                        >
                          {isEvChargingSession || isConfirmEv
                            ? confirmFineAmount > 0
                              ? "Accept Fine & Pay Now"
                              : "Pay Now"
                            : confirmFineAmount > 0
                            ? `Accept Fine & Pay Now (${totalBookingCost.toLocaleString()} RWF)`
                            : `Pay Now (${totalBookingCost.toLocaleString()} RWF)`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        {/* BOOKING SUCCESS CELEBRATION ANIMATION MODAL */}
        <Modal
          visible={bookingSuccessModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBookingSuccessModalVisible(false)}
        >
          <View style={styles.successModalBackdrop}>
            {bookingSuccessModalVisible && (
              <ConfettiCannon
                count={36}
                origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
                fadeOut={true}
                fallSpeed={2600}
                colors={theme.isDark ? ["#FFFFFF", "#A1A1AA", "#3B82F6", "#10B981"] : ["#09090B", "#27272A", "#2563EB", "#059669"]}
                autoStart={true}
              />
            )}

            <Animated.View
              style={[
                styles.successModalBox,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  opacity: successFadeAnim,
                  transform: [{ scale: successScaleAnim }],
                },
              ]}
            >
              {/* Pulsing Animated Success Ring */}
              <View style={styles.successIconWrapper}>
                <Animated.View
                  style={[
                    styles.successPulseRing,
                    {
                      borderColor: theme.accent,
                      transform: [
                        {
                          scale: successPulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.45],
                          }),
                        },
                      ],
                      opacity: successPulseAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.6, 0.3, 0],
                      }),
                    },
                  ]}
                />
                <View
                  style={[
                    styles.successOuterCircle,
                    { backgroundColor: theme.accentSoft, borderColor: theme.border },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.successInnerCircle,
                      {
                        backgroundColor: theme.text,
                        transform: [{ scale: successCheckAnim }],
                      },
                    ]}
                  >
                    <Ionicons name="checkmark" size={30} color={theme.background} />
                  </Animated.View>
                </View>
              </View>

              {/* Title & Subtitle */}
              <Text style={[styles.successTitle, { color: theme.text }]}>Booking Confirmed</Text>
              <Text style={[styles.successSub, { color: theme.textSecondary }]}>
                Your parking spot has been reserved and your active session is live.
              </Text>

              {/* Booking Info Card */}
              {bookingSuccessData && (
                <View style={[styles.successInfoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <View style={styles.successInfoRow}>
                    <View style={styles.successInfoIconBox}>
                      <Ionicons name="location-outline" size={15} color={theme.text} />
                    </View>
                    <Text style={[styles.successInfoLabel, { color: theme.textSecondary }]}>Facility</Text>
                    <Text style={[styles.successInfoValue, { color: theme.text }]} numberOfLines={1}>
                      {bookingSuccessData.locationName}
                    </Text>
                  </View>

                  <View style={styles.successInfoRow}>
                    <View style={styles.successInfoIconBox}>
                      <Ionicons name="car-outline" size={15} color={theme.text} />
                    </View>
                    <Text style={[styles.successInfoLabel, { color: theme.textSecondary }]}>Reserved Spot</Text>
                    <Text style={[styles.successInfoValue, { color: theme.text }]}>
                      {bookingSuccessData.bayNumber} ({bookingSuccessData.zone})
                    </Text>
                  </View>

                  <View style={styles.successInfoRow}>
                    <View style={styles.successInfoIconBox}>
                      <Ionicons name="time-outline" size={15} color={theme.text} />
                    </View>
                    <Text style={[styles.successInfoLabel, { color: theme.textSecondary }]}>Duration</Text>
                    <Text style={[styles.successInfoValue, { color: theme.text }]}>
                      {bookingSuccessData.durationHours} {bookingSuccessData.durationHours === 1 ? "Hour" : "Hours"}
                    </Text>
                  </View>

                  <View style={[styles.successDivider, { backgroundColor: theme.border }]} />

                  <View style={styles.successInfoRow}>
                    <View style={styles.successInfoIconBox}>
                      <Ionicons name="receipt-outline" size={15} color={theme.text} />
                    </View>
                    <Text style={[styles.successInfoLabel, { color: theme.textSecondary }]}>Total Settled</Text>
                    <Text style={[styles.successInfoValueBold, { color: theme.text }]}>
                      {bookingSuccessData.totalCost.toLocaleString()} RWF
                    </Text>
                  </View>

                  {bookingSuccessData.fineAmount && bookingSuccessData.fineAmount > 0 && (
                    <View style={[styles.successFineBadge, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
                      <Ionicons name="warning-outline" size={13} color={theme.danger} />
                      <Text style={[styles.successFineText, { color: theme.danger }]}>
                        +{bookingSuccessData.fineAmount.toLocaleString()} RWF Fine ({bookingSuccessData.fineReason})
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Action Buttons */}
              <TouchableOpacity
                style={[styles.successPrimaryBtn, { backgroundColor: theme.primaryBtnBg }]}
                onPress={() => {
                  setBookingSuccessModalVisible(false);
                  if (bookingSuccessData?.ticketId) {
                    router.push({
                      pathname: "/parking_session",
                      params: {
                        id: bookingSuccessData.ticketId,
                        name: bookingSuccessData.locationName,
                        bayNumber: bookingSuccessData.bayNumber,
                        zoneCode: bookingSuccessData.zone,
                        durationHours: String(bookingSuccessData.durationHours),
                        cost: String(bookingSuccessData.totalCost),
                        hourlyRate: String(bookingSuccessData.hourlyRate),
                        status: "Active",
                        violationFine: bookingSuccessData.fineAmount ? String(bookingSuccessData.fineAmount) : undefined,
                        violationReason: bookingSuccessData.fineReason,
                      },
                    });
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="timer-outline" size={16} color={theme.primaryBtnText} style={{ marginRight: 6 }} />
                <Text style={[styles.successPrimaryBtnText, { color: theme.primaryBtnText }]}>
                  View Active Session
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.successSecondaryBtn, { borderColor: theme.border }]}
                onPress={() => setBookingSuccessModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.successSecondaryBtnText, { color: theme.text }]}>Done</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>

        {/* CENTER MENU QR SCANNER CAMERA MODAL */}
        <Modal
          visible={qrScannerVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setQrScannerVisible(false)}
        >
          <SafeAreaView style={styles.scannerFullscreen} edges={["top", "bottom"]}>
            {/* Top Scanner Controls */}
            <View style={styles.scannerTopHeader}>
              <TouchableOpacity
                style={styles.scannerCircleBtn}
                onPress={() => setQrScannerVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>

              <View style={{ alignItems: "center" }}>
                <Text style={styles.scannerHeaderTitle}>Parking QR Scanner</Text>
                <Text style={styles.scannerHeaderSub}>Scan bay code to verify & book</Text>
              </View>

              <TouchableOpacity
                style={[styles.scannerCircleBtn, scannerTorch && { backgroundColor: "#FFFFFF" }]}
                onPress={() => setScannerTorch(!scannerTorch)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={scannerTorch ? "flash" : "flash-outline"}
                  size={20}
                  color={scannerTorch ? "#09090B" : "#FFFFFF"}
                />
              </TouchableOpacity>
            </View>

            {/* Camera Viewport */}
            <View style={styles.scannerCameraContainer}>
              {cameraPermission?.granted ? (
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  enableTorch={scannerTorch}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scannedSpaceInfo ? undefined : handleBarcodeScanned}
                />
              ) : (
                <View style={styles.scannerPermissionBox}>
                  <Ionicons name="camera-outline" size={48} color="#A1A1AA" />
                  <Text style={styles.scannerPermissionText}>Camera access required to scan bay QR tokens</Text>
                  <TouchableOpacity
                    style={styles.scannerPermissionBtn}
                    onPress={requestCameraPermission}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.scannerPermissionBtnText}>Enable Camera</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Targeting Reticle Frame */}
              <View style={styles.reticleFrame} pointerEvents="none">
                <View style={[styles.reticleCorner, styles.reticleTopLeft]} />
                <View style={[styles.reticleCorner, styles.reticleTopRight]} />
                <View style={[styles.reticleCorner, styles.reticleBottomLeft]} />
                <View style={[styles.reticleCorner, styles.reticleBottomRight]} />
                <View style={styles.reticleCenterGlow} />
              </View>
            </View>

            {/* Manual Bay Entry Option */}
            <View style={styles.scannerSimChipsContainer}>
              <TouchableOpacity
                style={styles.scannerSimChip}
                onPress={() => {
                  setQrScannerVisible(false);
                  setQrModalVisible(true);
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="keypad-outline" size={14} color="#FFFFFF" />
                <Text style={styles.scannerSimChipText}>Enter Bay Code Manually</Text>
              </TouchableOpacity>
            </View>

            {/* Scanned Spot Info Card (Displayed when space scanned) */}
            {scannedSpaceInfo && (() => {
              const isEvSpot =
                scannedSpaceInfo.zoneName === "Zone A" ||
                scannedSpaceInfo.spaceNumber.toLowerCase().startsWith("ev") ||
                scannedSpaceInfo.locationName.toLowerCase().includes("ev");
              const isHandicapSpot =
                scannedSpaceInfo.zoneName === "Zone E" ||
                scannedSpaceInfo.spaceNumber.toLowerCase().startsWith("h") ||
                scannedSpaceInfo.locationName.toLowerCase().includes("accessible");
              const isScannedDisabled = (isEvSpot && !isVehicleElectric) || (isHandicapSpot && !isVehicleHandicap);
              const scanFine = (isEvSpot && !isVehicleElectric) ? 5000 : (isHandicapSpot && !isVehicleHandicap) ? 10000 : 0;
              const scanFineReason = (isEvSpot && !isVehicleElectric) ? "Unauthorized Non-EV in EV Bay" : (isHandicapSpot && !isVehicleHandicap) ? "Unauthorized Vehicle in Accessible Bay" : "";

              return (
                <View style={styles.scannedInfoCard}>
                  <View style={styles.scannedInfoTopRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 8 }}>
                      {scannedSpaceInfo.imageUrl ? (
                        <Image
                          source={{ uri: scannedSpaceInfo.imageUrl }}
                          style={{ width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}
                        />
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.scannedSpotNumber}>Bay {scannedSpaceInfo.spaceNumber}</Text>
                        <Text style={styles.scannedSpotLocation} numberOfLines={1}>
                          {scannedSpaceInfo.zoneName} • {scannedSpaceInfo.locationName}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.scannedStatusPill,
                        isScannedDisabled
                          ? { backgroundColor: "rgba(239, 68, 68, 0.2)" }
                          : isEvSpot
                            ? { backgroundColor: "rgba(16, 185, 129, 0.22)", borderColor: "rgba(16, 185, 129, 0.45)", borderWidth: 1 }
                            : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.scannedStatusPillText,
                          isScannedDisabled
                            ? { color: "#EF4444" }
                            : isEvSpot
                              ? { color: theme.evGreen }
                              : null,
                        ]}
                      >
                        {isScannedDisabled ? "RESTRICTED" : isEvSpot ? "EV Charger" : "Available"}
                      </Text>
                    </View>
                  </View>

                  {isScannedDisabled && (
                    <View style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", borderRadius: 10, padding: 8, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.3)" }}>
                      <Ionicons name="warning" size={16} color="#EF4444" />
                      <Text style={{ color: "#EF4444", fontSize: 11, fontWeight: "500", flex: 1 }}>
                        +{scanFine.toLocaleString()} RWF Municipal Fine Applied ({scanFineReason})
                      </Text>
                    </View>
                  )}

                  <View style={styles.scannedDetailsRow}>
                    <Text style={[styles.scannedRateText, isEvSpot && isVehicleElectric && { color: theme.evGreen }]}>
                      {isEvSpot && isVehicleElectric
                        ? "EV Charge: 9k (<30m) / 10k RWF (≥30m) • 0 Park"
                        : `${scannedSpaceInfo.hourlyRate} RWF / hour (Parking)`}
                    </Text>
                    <Text style={styles.scannedTokenText}>Code: {scannedSpaceInfo.token}</Text>
                  </View>

                  <View style={styles.scannedActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.scannedParkNowBtn,
                        {
                          backgroundColor: isScannedDisabled
                            ? theme.danger
                            : isEvSpot && isVehicleElectric
                              ? theme.evGreen
                              : "#FFFFFF",
                        },
                      ]}
                      onPress={handleParkScannedSpot}
                      activeOpacity={0.88}
                    >
                      <Text
                        style={[
                          styles.scannedParkNowBtnText,
                          {
                            color:
                              isScannedDisabled || (isEvSpot && isVehicleElectric)
                                ? "#FFFFFF"
                                : "#09090B",
                          },
                        ]}
                      >
                        {isScannedDisabled
                          ? "Accept Fine & Park"
                          : isEvSpot && isVehicleElectric
                          ? "Start EV Charging"
                          : "Park Here & Start Tracker"}
                      </Text>
                      <Ionicons
                        name={isEvSpot && isVehicleElectric ? "flash" : "checkmark-circle"}
                        size={18}
                        color={isScannedDisabled || (isEvSpot && isVehicleElectric) ? "#FFFFFF" : "#09090B"}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.scannedRescanBtn}
                      onPress={() => setScannedSpaceInfo(null)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.scannedRescanBtnText}>Scan Other</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}
          </SafeAreaView>
        </Modal>

        {/* ALL PARKING PLACES & EV STATIONS SYSTEM MAP MODAL (Full Edge-to-Edge Screenshot Layout) */}
        <Modal
          visible={showMapView}
          animationType="slide"
          onRequestClose={() => setShowMapView(false)}
        >
          <View style={[styles.screenWrapper, { backgroundColor: theme.background }]}>
            {/* Edge-to-Edge Map: Full Screen with rate bubbles, route polyline, and user radar */}
            <View style={StyleSheet.absoluteFillObject}>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFillObject}
                initialRegion={KIGALI_REGION}
                showsUserLocation={false}
                customMapStyle={theme.isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
              >
                {/* User Location Radar Marker */}
                <Marker coordinate={userCoordinates} anchor={{ x: 0.5, y: 0.5 }}>
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

                {/* Real Road Route to Selected Location (Actual Street Turns & Roundabouts) */}
                {selectedMapLocation && activeRouteCoords.length > 0 && (
                  <>
                    {/* Shadow / outline path for contrast against map terrain */}
                    <Polyline
                      coordinates={activeRouteCoords}
                      strokeColor={theme.isDark ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.16)"}
                      strokeWidth={6.5}
                      lineCap="round"
                      lineJoin="round"
                    />
                    {/* Primary road route line following actual curves */}
                    <Polyline
                      coordinates={activeRouteCoords}
                      strokeColor={theme.isDark ? "#FFFFFF" : "#09090B"}
                      strokeWidth={3.8}
                      lineCap="round"
                      lineJoin="round"
                    />
                    {/* Distance Badge Placed on Actual Road Midpoint */}
                    <Marker
                      coordinate={
                        activeRouteCoords[Math.floor(activeRouteCoords.length / 2)] || {
                          latitude: (userCoordinates.latitude + Number(selectedMapLocation.latitude)) / 2,
                          longitude: (userCoordinates.longitude + Number(selectedMapLocation.longitude)) / 2,
                        }
                      }
                      anchor={{ x: 0.5, y: 0.5 }}
                    >
                      <View
                        style={[
                          styles.distanceBadgePill,
                          {
                            backgroundColor: theme.isDark ? "#18181B" : "#09090B",
                            borderColor: theme.border,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <Text style={styles.distanceBadgeText}>
                          {(activeRouteDistanceKm || haversineKm(
                            userCoordinates.latitude,
                            userCoordinates.longitude,
                            Number(selectedMapLocation.latitude),
                            Number(selectedMapLocation.longitude)
                          )).toFixed(1)}{" "}
                          km
                          {activeRouteDurationMin > 0 ? ` • ${activeRouteDurationMin}m` : ""}
                        </Text>
                      </View>
                    </Marker>
                  </>
                )}

                {/* Rate Bubble Markers for All Parking Places in System (Filtered by vehicle eligibility) */}
                {(mapCategory === "all" || mapCategory === "car" || mapCategory === "truck" || mapCategory === "bike" || mapCategory === "bus") &&
                  eligibleLocations
                    .filter((loc) => {
                      if (!mapSearch) return true;
                      return (
                        loc.name.toLowerCase().includes(mapSearch.toLowerCase()) ||
                        loc.address.toLowerCase().includes(mapSearch.toLowerCase())
                      );
                    })
                    .map((loc) => {
                      const isSelected = selectedMapLocation?.id === loc.id;
                      return (
                        <Marker
                          key={loc.id}
                          coordinate={{ latitude: Number(loc.latitude), longitude: Number(loc.longitude) }}
                          onPress={() => setSelectedMapLocation(loc)}
                          anchor={{ x: 0.5, y: 1.0 }}
                        >
                          <View style={styles.markerContainer}>
                            <View
                              style={[
                                styles.rateBubble,
                                {
                                  backgroundColor: isSelected ? theme.pillActiveBg : theme.surface,
                                  borderColor: isSelected ? theme.pillActiveBg : theme.borderStrong,
                                  borderWidth: 1.5,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.rateBubbleText,
                                  {
                                    color: isSelected ? theme.pillActiveText : theme.text,
                                  },
                                ]}
                              >
                                {loc.hourly_rate || 300} RWF/h
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.pinStemDot,
                                {
                                  backgroundColor: isSelected ? theme.pillActiveBg : theme.textSecondary,
                                  borderColor: theme.surface,
                                },
                              ]}
                            />
                          </View>
                        </Marker>
                      );
                    })}

                {/* Rate Bubble Markers for EV Stations: ONLY shown if vehicle is electric */}
                {(mapCategory === "all" || mapCategory === "ev") && isVehicleElectric &&
                  evStations
                    .filter((ev) => {
                      if (!mapSearch) return true;
                      return (
                        ev.name.toLowerCase().includes(mapSearch.toLowerCase()) ||
                        ev.address.toLowerCase().includes(mapSearch.toLowerCase())
                      );
                    })
                    .map((ev) => {
                      const isSelected = selectedMapLocation?.id === ev.id;
                      const evAsLoc: ParkingLocation = {
                        id: ev.id,
                        name: ev.name,
                        address: ev.address,
                        city: ev.city || "Kigali",
                        country: "Rwanda",
                        latitude: ev.latitude,
                        longitude: ev.longitude,
                        layout_topology: "perpendicular",
                        total_spots: ev.chargers.length,
                        available_spots: ev.chargers.filter((c) => c.status === "available").length,
                        hourly_rate: 0,
                        daily_rate: 10000,
                        currency: "RWF",
                        qr_code_identifier: ev.id,
                        is_electric_station: true,
                        image_url: ev.image_url,
                        is_active: true,
                        status: "active",
                      };

                      return (
                        <Marker
                          key={`ev-${ev.id}`}
                          coordinate={{ latitude: ev.latitude, longitude: ev.longitude }}
                          onPress={() => setSelectedMapLocation(evAsLoc)}
                          anchor={{ x: 0.5, y: 1.0 }}
                        >
                          <View style={styles.markerContainer}>
                            <View
                              style={[
                                styles.rateBubble,
                                {
                                  backgroundColor: isSelected ? theme.evGreen : theme.surface,
                                  borderColor: theme.evGreen,
                                  borderWidth: 1.5,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.rateBubbleText,
                                  {
                                    color: isSelected ? theme.evGreenText : theme.evGreen,
                                  },
                                ]}
                              >
                                9k–10k RWF
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.pinStemDot,
                                {
                                  backgroundColor: theme.evGreen,
                                  borderColor: theme.surface,
                                },
                              ]}
                            />
                          </View>
                        </Marker>
                      );
                    })}
              </MapView>
            </View>

            {/* Floating Top Search Bar + Vehicle Filter Pills (Snug to Status Bar in App Colors) */}
            <View
              style={[
                styles.floatingTopContainer,
                {
                  top: insets.top > 0 ? insets.top : (Platform.OS === "ios" ? 44 : 12),
                },
              ]}
              pointerEvents="box-none"
            >
              <View
                style={[
                  styles.screenshotSearchBar,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    shadowColor: theme.cardShadow,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.searchBackBtn}
                  onPress={() => setShowMapView(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={20} color={theme.text} />
                </TouchableOpacity>

                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Search in Kigali"
                  placeholderTextColor={theme.textSecondary}
                  value={mapSearch}
                  onChangeText={setMapSearch}
                />

                <TouchableOpacity style={styles.searchIconBtn} activeOpacity={0.7}>
                  <Ionicons name="search" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              {/* Horizontal Vehicle/Place Filter Pills in App Colors */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryPillsScroll}
                contentContainerStyle={styles.categoryPillsContent}
              >
                {[
                  { id: "car", label: "Car", icon: "car-sport" },
                  { id: "ev", label: "EV Hub", icon: "flash" },
                  { id: "bike", label: "Bike", icon: "bicycle" },
                  { id: "bus", label: "Bus", icon: "bus" },
                  { id: "truck", label: "Truck", icon: "cube" },
                  { id: "all", label: "All Spots", icon: "grid" },
                ].map((cat) => {
                  const isActive = mapCategory === cat.id;
                  const isEvCat = cat.id === "ev";
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryPill,
                        {
                          backgroundColor: isActive
                            ? (isEvCat ? theme.evGreen : theme.pillActiveBg)
                            : theme.surface,
                          borderColor: isActive
                            ? (isEvCat ? theme.evGreen : theme.pillActiveBg)
                            : isEvCat
                              ? theme.evGreenBorder
                              : theme.border,
                          shadowColor: theme.cardShadow,
                        },
                      ]}
                      onPress={() => setMapCategory(cat.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={15}
                        color={
                          isActive
                            ? (isEvCat ? theme.evGreenText : theme.pillActiveText)
                            : isEvCat
                              ? theme.evGreen
                              : theme.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.categoryPillText,
                          {
                            color: isActive
                              ? (isEvCat ? theme.evGreenText : theme.pillActiveText)
                              : isEvCat
                                ? theme.evGreen
                                : theme.text,
                            fontWeight: isActive ? "600" : "400",
                          },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Floating Bottom Card matching the user's screenshot */}
            {selectedMapLocation && (
              <View
                style={[
                  styles.screenshotBottomCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    shadowColor: theme.cardShadow,
                  },
                ]}
              >
                {/* Header Row: Title, Address, Bookmark */}
                <View style={styles.bottomCardHeaderRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.bottomCardTitle, { color: theme.text }]} numberOfLines={1}>
                      {selectedMapLocation.name}
                    </Text>
                    <Text style={[styles.bottomCardAddress, { color: theme.textSecondary }]} numberOfLines={1}>
                      {selectedMapLocation.address}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.bookmarkBtn,
                      {
                        backgroundColor: mapBookmarked[selectedMapLocation.id]
                          ? theme.pillActiveBg
                          : theme.background,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() =>
                      setMapBookmarked((prev) => ({
                        ...prev,
                        [selectedMapLocation.id]: !prev[selectedMapLocation.id],
                      }))
                    }
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={mapBookmarked[selectedMapLocation.id] ? "bookmark" : "bookmark-outline"}
                      size={20}
                      color={mapBookmarked[selectedMapLocation.id] ? theme.pillActiveText : theme.text}
                    />
                  </TouchableOpacity>
                </View>

                {/* Stats Row: Price • 4 min • Available Spots */}
                <View style={styles.cardStatsRow}>
                  <View style={styles.statBadgeItem}>
                    <Ionicons name="cash-outline" size={14} color={theme.textSecondary} />
                    <Text style={[styles.statBadgeText, { color: theme.text }]}>
                      {selectedMapLocation.hourly_rate} RWF /hr
                    </Text>
                  </View>
                  <Text style={[styles.statDotSeparator, { color: theme.textSecondary }]}>•</Text>
                  <View style={styles.statBadgeItem}>
                    <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
                    <Text style={[styles.statBadgeText, { color: theme.text }]}>
                      4 min
                    </Text>
                  </View>
                  <Text style={[styles.statDotSeparator, { color: theme.textSecondary }]}>•</Text>
                  <View style={styles.statBadgeItem}>
                    <Ionicons name="car-outline" size={14} color={theme.textSecondary} />
                    <Text style={[styles.statBadgeText, { color: theme.text }]}>
                      {selectedMapLocation.available_spots ?? 0} Available
                    </Text>
                  </View>
                </View>

                {/* Aerial Parking Photo with Parked Cars and Pagination Dots */}
                <View style={styles.aerialPhotoContainer}>
                  {selectedMapLocation.image_url ? (
                    <Image
                      source={{ uri: selectedMapLocation.image_url }}
                      style={styles.aerialPhotoImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.aerialPhotoImg, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="car-sport-outline" size={32} color={theme.textSecondary} />
                    </View>
                  )}
                  {/* Carousel Pagination Dots */}
                  <View style={styles.carouselDotsContainer}>
                    <View style={[styles.carouselDot, { backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B", width: 14 }]} />
                    <View style={[styles.carouselDot, { backgroundColor: theme.isDark ? "rgba(255,255,255,0.4)" : "rgba(9,9,11,0.3)" }]} />
                    <View style={[styles.carouselDot, { backgroundColor: theme.isDark ? "rgba(255,255,255,0.4)" : "rgba(9,9,11,0.3)" }]} />
                  </View>
                </View>

                {/* Choose Place Button in App Colors */}
                <TouchableOpacity
                  style={[
                    styles.choosePlaceBtn,
                    {
                      backgroundColor: theme.primaryBtnBg,
                      shadowColor: theme.cardShadow,
                    },
                  ]}
                  onPress={() => {
                    setShowMapView(false);
                    setSelectedParkForSheet(selectedMapLocation);
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.choosePlaceBtnText, { color: theme.primaryBtnText }]}>Choose Place</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Modal>

        {/* MAP LOCATION / STATION BOTTOM SHEET MODAL (Opened upon clicking station/area pin on map) */}
        <Modal
          visible={mapStationSheetVisible && !!selectedMapLocation}
          animationType="slide"
          transparent
          onRequestClose={() => setMapStationSheetVisible(false)}
        >
          <View style={styles.sheetModalBackdrop}>
            <View style={[styles.confirmSheetBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.confirmHandleBar} />

              <View style={styles.sheetHeaderRow}>
                <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                  <Text style={[styles.sheetMainTitle, { color: theme.text }]} numberOfLines={1}>
                    {selectedMapLocation?.name || "Parking Station"}
                  </Text>
                  <Text style={[styles.sheetSubTitle, { color: theme.textSecondary }]} numberOfLines={1}>
                    {selectedMapLocation?.address || ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.circularCloseBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
                  onPress={() => setMapStationSheetVisible(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>

              {/* Photo & Station Quick Metrics */}
              <View style={styles.mapSheetImageRow}>
                {selectedMapLocation?.image_url ? (
                  <Image
                    source={{ uri: selectedMapLocation.image_url }}
                    style={styles.mapSheetThumb}
                  />
                ) : (
                  <View style={[styles.mapSheetThumb, { backgroundColor: theme.background, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border }]}>
                    <Ionicons name="car-sport-outline" size={24} color={theme.textSecondary} />
                  </View>
                )}
                <View style={styles.mapSheetInfoCol}>
                  <View style={styles.mapSheetBadgeRow}>
                    <View style={[styles.mapSheetBadge, { backgroundColor: "#09090B" }]}>
                      <Ionicons name="car" size={12} color="#FFFFFF" />
                      <Text style={[styles.mapSheetBadgeText, { color: "#FFFFFF" }]}>
                        {selectedMapLocation?.available_spots ?? 0} spots free
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.mapSheetRateText, { color: theme.text }]}>
                    {selectedMapLocation?.hourly_rate ?? 0} RWF / hour
                  </Text>
                  <Text style={[styles.mapSheetSubText, { color: theme.textSecondary }]}>
                    Monitored 24/7 • Live Sensor Telemetry
                  </Text>
                </View>
              </View>

              {/* Actions: View Parking Bays / Reserve */}
              <View style={styles.mapSheetActionRow}>
                <TouchableOpacity
                  style={[styles.mapSheetActionBtnSecondary, { borderColor: theme.border, backgroundColor: theme.background }]}
                  onPress={() => {
                    setMapStationSheetVisible(false);
                    if (selectedMapLocation) {
                      setSelectedParkForSheet(selectedMapLocation);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="grid-outline" size={16} color={theme.text} />
                  <Text style={[styles.mapSheetActionBtnSecondaryText, { color: theme.text }]}>
                    View Parking Bays
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mapSheetActionBtnPrimary, { backgroundColor: "#09090B" }]}
                  onPress={() => {
                    setMapStationSheetVisible(false);
                    if (selectedMapLocation) {
                      setSelectedParkForSheet(selectedMapLocation);
                      setConfirmBookingSheetVisible(true);
                    }
                  }}
                  activeOpacity={0.88}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                  <Text style={[styles.mapSheetActionBtnPrimaryText, { color: "#FFFFFF" }]}>
                    Reserve Spot
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>

      {/* Real-time Dynamic Island & Lock Screen Live Activity Widget (iOS Only, Anchored on Hardware Bridge) */}
      <DynamicIslandParking
        active={Boolean(activeTicket)}
        bayNumber={activeTicket?.spaceNumber || ""}
        locationName={activeTicket?.locationName || ""}
        plate={activeTicket?.plate || selectedVehicle?.masked_plate || driverVehicle?.plateNumber || ""}
        elapsedSeconds={elapsedSeconds}
        totalSeconds={totalParkingSeconds}
        remainingSeconds={remainingSeconds}
        progressPercent={progressPercent}
        onExtend={() => handleExtendParkingTime(1)}
        onEndSession={handleEndParkingSession}
      />

      {/* 1-Second Full-Screen Black and White Gradient AI Scanning Wave (No Card) */}
      {isAiScanning && (
        <Animated.View
          style={[
            styles.aiScanOverlay,
            {
              opacity: aiOverlayOpacity,
            },
          ]}
          pointerEvents="none"
        >
          {/* Sweeping Black & White Gradient Holographic Laser Wave */}
          <Animated.View
            style={[
              styles.aiScanBwWave,
              {
                transform: [
                  {
                    translateY: aiScanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-260, SCREEN_HEIGHT + 260],
                    }),
                  },
                ],
              },
            ]}
          >
            <Svg width={SCREEN_WIDTH} height={260}>
              <Defs>
                <LinearGradient id="aiBwBeamGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#4285F4" stopOpacity="0" />
                  <Stop offset="25%" stopColor="#4285F4" stopOpacity="0.16" />
                  <Stop offset="48%" stopColor="#9B72CB" stopOpacity="0.58" />
                  <Stop offset="50%" stopColor="#D96570" stopOpacity="0.85" />
                  <Stop offset="52%" stopColor="#38BDF8" stopOpacity="0.58" />
                  <Stop offset="75%" stopColor="#4285F4" stopOpacity="0.16" />
                  <Stop offset="100%" stopColor="#4285F4" stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id="aiGeminiLaserHoriz" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor="#4285F4" />
                  <Stop offset="34%" stopColor="#9B72CB" />
                  <Stop offset="68%" stopColor="#D96570" />
                  <Stop offset="100%" stopColor="#38BDF8" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width={SCREEN_WIDTH} height={260} fill="url(#aiBwBeamGrad)" />
              <Rect x="0" y="128.5" width={SCREEN_WIDTH} height="3" fill="url(#aiGeminiLaserHoriz)" />
            </Svg>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  screenWrapper: {
    flex: 1,
  },

  /* SCREEN 1: PARKING SPOT STYLES */
  spotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "transparent",
    borderBottomWidth: 0,
  },
  spotHeaderTitle: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  circularNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  floorPillsRow: {
    paddingVertical: 12,
  },
  floorPillsScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  floorPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  floorPillText: {
    fontSize: 12,
    fontWeight: "500",
  },
  topologySwitcherRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  adminLayoutPillHome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  adminLayoutTextHome: {
    fontSize: 11,
    fontWeight: "400",
  },
  adminLockTagHome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginLeft: 2,
  },
  adminLockTagTextHome: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  topologyPillsGroup: {
    flexDirection: "row",
    gap: 6,
  },
  topologyPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  topologyPillText: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  aerial3DToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  aerial3DToggleText: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  slotGridScroll: {
    flex: 1,
  },
  slotGridContent: {
    paddingHorizontal: 20,
    paddingBottom: 220,
  },
  bayIndicatorsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionPillBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionPillText: {
    fontSize: 14,
    fontWeight: "500",
  },
  entryArrowBox: {
    alignItems: "center",
  },
  entryArrowText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  bayLayoutTwoCols: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bayColumn: {
    flex: 1,
    gap: 14,
  },
  driveAisle: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  driveAisleDashedLine: {
    width: 1,
    height: "100%",
    borderStyle: "dashed",
    borderWidth: 1,
  },
  occupiedBayWrapper: {
    height: 80,
    borderRadius: 14,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bayLabelMuted: {
    position: "absolute",
    top: 6,
    left: 8,
    fontSize: 10,
    fontWeight: "500",
  },
  freeBaySlot: {
    height: 80,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  freeBaySlotText: {
    fontSize: 14,
    fontWeight: "600",
  },
  selectedCheckDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Top Down Car Vector */
  topDownCarBox: {
    width: 44,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  carWheelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 42,
  },
  carWheel: {
    width: 6,
    height: 12,
    borderRadius: 3,
    backgroundColor: "#18181B",
  },
  carBodyMain: {
    width: 32,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginVertical: -2,
  },
  carGlassFront: {
    width: 24,
    height: 8,
    borderRadius: 3,
  },
  carRoof: {
    width: 22,
    height: 18,
    borderRadius: 4,
  },
  carGlassRear: {
    width: 20,
    height: 6,
    borderRadius: 2,
  },

  /* Spot Bottom Floating Sheet */
  spotBottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4D4D8",
    alignSelf: "center",
    marginBottom: 12,
  },
  spotSheetTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 14,
  },
  timeSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 18,
  },
  timeCol: {
    flex: 1,
    minWidth: 0,
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 4,
  },
  timeChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeChipText: {
    fontSize: 11,
    fontWeight: "500",
  },
  durationCenterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 14,
    flexShrink: 0,
  },
  durationCenterText: {
    fontSize: 11,
    fontWeight: "500",
  },
  fullWidthPillBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  fullWidthPillInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fullWidthPillBtnText: {
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  circleArrowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  /* SCREEN 3: PARK DETAILS STYLES */
  detailsContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  detailsTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  detailsSearchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  detailsSearchInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
  },
  detailsCarPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  detailsCarPillText: {
    fontSize: 10,
    fontWeight: "500",
  },
  parkCardHead: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  parkProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  parkAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  parkProfileTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  parkRatingText: {
    fontSize: 12,
    fontWeight: "500",
  },
  parkReviewsText: {
    fontSize: 11,
  },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedPillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "500",
  },
  addressCallRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addressText: {
    fontSize: 11,
    lineHeight: 16,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  segmentedTabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  segmentedTabBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentedTabText: {
    fontSize: 12,
    fontWeight: "500",
  },
  mediaGalleryBox: {
    height: 180,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    marginBottom: 20,
  },
  mediaGalleryImg: {
    width: "100%",
    height: "100%",
  },
  mediaPlayBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -24 }, { translateY: -24 }],
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  horizontalLotCard: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  horizontalLotImg: {
    width: 80,
    height: 80,
    borderRadius: 14,
  },
  lotCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  lotCardTypes: {
    fontSize: 10,
    marginTop: 2,
  },
  lotCardAddr: {
    fontSize: 10,
    marginTop: 4,
  },
  tariffBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tariffBadgeText: {
    fontSize: 10,
    fontWeight: "500",
  },
  ratingStarText: {
    fontSize: 11,
    fontWeight: "500",
  },
  spotsAvailablePill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  spotsAvailableText: {
    fontSize: 10,
    fontWeight: "500",
  },

  /* SCREEN 2: HOME DISCOVERY STYLES */
  homeScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 110,
  },
  homeTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginBottom: 16,
  },
  avatarCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  avatarFallbackInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  locationSelectorGroup: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  myLocationSub: {
    fontSize: 10,
    fontWeight: "400",
  },
  myLocationMain: {
    fontSize: 14,
    fontWeight: "600",
  },
  unreadBadgeDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#000000",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
  },
  homeSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  aiModePillBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
    minWidth: 104,
  },
  aiModePillText: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#09090B",
  },
  voiceHeaderToggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Hick's Law 1-Tap Quick Park Card */
  hickQuickCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  hickQuickHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  hickBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hickPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hickPillText: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  hickDistanceText: {
    fontSize: 11,
    fontWeight: "400",
  },
  hickPriceTag: {
    fontSize: 13,
    fontWeight: "500",
  },
  hickTitleText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  hickSubText: {
    fontSize: 12,
    fontWeight: "400",
    marginBottom: 12,
  },
  hickFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hickSpotFreePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  hickGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  hickSpotFreeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  hickDirectCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  hickDirectCtaBtnText: {
    fontSize: 11.5,
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  /* AI Vehicle Spec Intelligence Card */
  aiVehicleIntelCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E4E4E7",
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  aiVehicleIntelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  aiVehicleHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  aiVehicleIntelTitle: {
    color: "#09090B",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  aiMatchScoreBadge: {
    color: "#FFFFFF",
    backgroundColor: "#09090B",
    borderColor: "#09090B",
    fontSize: 10,
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    overflow: "hidden",
  },
  aiVehicleSpecsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  aiVehicleSpecItem: {
    flex: 1,
    backgroundColor: "#F4F4F6",
    borderColor: "#E4E4E7",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  aiVehicleSpecLabel: {
    color: "#71717A",
    fontSize: 8.5,
    fontWeight: "500",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  aiVehicleSpecValue: {
    color: "#09090B",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 2,
  },
  aiVehicleSpecSub: {
    color: "#71717A",
    fontSize: 10,
    fontWeight: "400",
  },
  aiRecommendationCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F4F4F6",
    borderColor: "#E4E4E7",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  aiRecommendationCalloutText: {
    color: "#09090B",
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 16,
    flex: 1,
  },

  /* Category 4-Card Row */
  categoryCardsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  categoryCard: {
    flex: 1,
    minWidth: 0,
    height: 84,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryCardLabel: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 12,
    maxWidth: "100%",
  },

  /* Dark Luxury Balance & Parking Tracker Card */
  darkLuxuryBalanceCard: {
    backgroundColor: "#09090B", // Pure rich carbon luxury
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  balanceTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    zIndex: 2,
  },
  balanceSubLabel: {
    color: "#A1A1AA",
    fontSize: 11,
    fontWeight: "400",
    marginBottom: 4,
  },
  hourlyRatePill: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  hourlyRatePillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "500",
  },
  balanceNumber: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  balancePlusBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  watermarkLetterBox: {
    position: "absolute",
    right: 50,
    top: 6,
    opacity: 0.08,
  },
  watermarkLetter: {
    color: "#FFFFFF",
    fontSize: 90,
    fontWeight: "700",
  },
  balanceDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    marginBottom: 14,
  },
  balanceTrackerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  trackerLabel: {
    color: "#E4E4E7",
    fontSize: 11,
    fontWeight: "500",
  },
  trackerDigits: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  trackerProgressBarBg: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
  },
  trackerProgressBarActive: {
    height: "100%",
    backgroundColor: "#FFFFFF",
  },
  activeSessionInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  activeSessionInfoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  activeSessionSpotText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  activeSessionDurationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  activeSessionDurationText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  liveBlinkingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  trackerCountdownText: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 2,
  },
  trackerActionButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  trackerActionBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  trackerActionBtnSecondaryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  trackerActionBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  trackerActionBtnPrimaryText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "500",
  },
  contraventionFineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  contraventionFineTitle: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  contraventionFineSub: {
    color: "#FCA5A5",
    fontSize: 10,
    fontWeight: "400",
    marginTop: 1,
  },
  sheetFineWarningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  sheetFineWarningTitle: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "500",
  },
  sheetFineWarningSub: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "400",
    marginTop: 2,
    opacity: 0.9,
  },
  disabledBayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  disabledBayBadgeText: {
    color: "#EF4444",
    fontSize: 8,
    fontWeight: "500",
  },

  /* Dropdown Map */
  homeMapContainer: {
    height: 180,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 20,
  },
  mapPinMonochrome: {
    backgroundColor: "#09090B",
    borderColor: "#FFFFFF",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mapPinLetter: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "500",
  },
  mapPinBadge: {
    color: "#A1A1AA",
    fontSize: 10,
    fontWeight: "500",
  },

  /* Section Headers */
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  sectionTitleBold: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionSubMuted: {
    fontSize: 11,
    marginTop: 2,
  },
  seeAllLink: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* Top Rated Park Card */
  topRatedCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  topRatedCardRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 12,
  },
  topRatedCardImg: {
    width: 90,
    height: 90,
    borderRadius: 16,
  },
  topRatedTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  topRatedTypes: {
    fontSize: 10,
    marginTop: 2,
  },
  topRatedAddress: {
    fontSize: 11,
  },
  ratingNumber: {
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 2,
  },
  reviewCount: {
    fontSize: 10,
  },
  topRatedBottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  openSpotsText: {
    fontSize: 11,
    fontWeight: "500",
  },
  openCountBadge: {
    fontSize: 11,
    fontWeight: "500",
  },

  /* Nearby Park Card */
  nearbyCard: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  nearbyCardImg: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  nearbyCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  nearbyStarText: {
    fontSize: 11,
    fontWeight: "500",
  },
  nearbyCardTypes: {
    fontSize: 10,
  },
  nearbyCardAddress: {
    fontSize: 10,
  },

  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContentBox: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    paddingBottom: 34,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitleText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 10,
  },
  auditResultBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  auditResultStatus: {
    fontSize: 13,
    fontWeight: "500",
  },
  auditResultText: {
    fontSize: 11,
  },

  /* =========================================================================
      SCREENSHOT-ALIGNED HOMESCREEN & MODAL STYLES
  ========================================================================== */

  /* Horizontal Car Graphic */
  horizCarBox: {
    width: 130,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  horizCarWheelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 96,
    height: 5,
  },
  horizWheel: {
    width: 20,
    height: 5,
    borderRadius: 2,
    backgroundColor: "#09090B",
  },
  horizCarBody: {
    width: 124,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#27272A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginVertical: -2,
  },
  horizCarGlassLeft: {
    width: 14,
    height: 30,
    borderRadius: 5,
    backgroundColor: "#09090B",
  },
  horizCarRoof: {
    width: 56,
    height: 34,
    borderRadius: 7,
    backgroundColor: "#27272A",
  },
  horizCarGlassRight: {
    width: 12,
    height: 28,
    borderRadius: 5,
    backgroundColor: "#09090B",
  },

  /* Parking Nearby Section */
  nearbySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 12,
  },
  nearbySectionTitle: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  viewOnMapPillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  viewOnMapPillText: {
    fontSize: 11,
    fontWeight: "500",
  },

  /* Zone Pills */
  zonePillsScroll: {
    gap: 8,
    paddingBottom: 14,
  },
  zonePillChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  zonePillChipText: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* Nearby Horizontal Cards */
  nearbyHorizontalCardsScroll: {
    gap: 14,
    paddingBottom: 18,
  },
  nearbyScreenshotCard: {
    width: 236,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  nearbyCardImgContainer: {
    width: "100%",
    height: 128,
    position: "relative",
  },
  nearbyScreenshotCardImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  freePlacesBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "#09090B",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  freePlacesBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "500",
  },
  nearbyCardInfoBox: {
    padding: 12,
    gap: 4,
  },
  nearbyCardName: {
    fontSize: 14,
    fontWeight: "600",
  },
  nearbyCardAddressText: {
    fontSize: 11,
  },
  nearbyCardRateText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },

  /* Recent Parking Section */
  recentSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 12,
  },
  recentSectionTitle: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  seeAllPillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  seeAllPillText: {
    fontSize: 11,
    fontWeight: "500",
  },
  recentListContainer: {
    gap: 10,
  },
  recentParkCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  recentParkImg: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  recentParkInfoCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  recentParkTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  recentParkAddr: {
    fontSize: 11,
  },
  recentStatusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#27272A",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  recentStatusBadgeText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#FFFFFF",
  },

  /* Spot Selection Bottom Sheet Modal */
  sheetModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  spotSelectionSheetBox: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    maxHeight: "88%",
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    paddingHorizontal: 20,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetMainTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  sheetSubTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  circularCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetZonePillsWrapper: {
    marginBottom: 16,
  },
  sheetZonePillsRow: {
    gap: 8,
  },
  sheetZonePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  sheetZonePillText: {
    fontSize: 12,
    fontWeight: "500",
  },
  sheetBaysScroll: {
    maxHeight: 380,
    marginBottom: 16,
  },
  sheetBaysTwoCols: {
    flexDirection: "row",
    gap: 14,
  },
  sheetBayColumn: {
    flex: 1,
    gap: 12,
  },
  bayAvailableCard: {
    height: 60,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bayNumberBold: {
    fontSize: 15,
    fontWeight: "600",
  },
  bayStatusSub: {
    fontSize: 10,
    fontWeight: "400",
    marginTop: 1,
  },
  occupiedBayGraphicCard: {
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetContinueBtn: {
    backgroundColor: "#18181B",
    borderRadius: 32,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    paddingHorizontal: 16,
  },
  sheetContinueBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  sheetContinueCircleArrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    right: 7,
  },

  /* Confirm Booking Bottom Sheet */
  confirmSheetBox: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    maxHeight: "88%",
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    paddingHorizontal: 20,
  },
  confirmHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4D4D8",
    alignSelf: "center",
    marginBottom: 10,
  },
  confirmHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
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
  confirmSummaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  confirmSummaryBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  confirmSummaryLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  confirmSummaryValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  confirmPaymentSection: {
    marginBottom: 14,
    gap: 6,
  },
  confirmPaymentLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  confirmPaymentBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  paymentCardGlyph: {
    flexDirection: "row",
    alignItems: "center",
  },
  mastercardCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  paymentMethodText: {
    fontSize: 13,
    fontWeight: "600",
  },
  paymentEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  confirmRateNumber: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  confirmRateUnit: {
    fontSize: 11,
    marginTop: 2,
  },
  confirmFinalBtn: {
    backgroundColor: "#18181B",
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingVertical: 13,
  },
  confirmFinalBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },

  /* Success Celebration Modal */
  successModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successModalBox: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  successIconWrapper: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successPulseRing: {
    position: "absolute",
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2,
  },
  successOuterCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  successInnerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: "center",
  },
  successSub: {
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  successInfoCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginVertical: 18,
    gap: 10,
  },
  successInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successInfoIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  successInfoLabel: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  successInfoValue: {
    fontSize: 12.5,
    fontWeight: "600",
    maxWidth: 160,
  },
  successInfoValueBold: {
    fontSize: 14,
    fontWeight: "700",
  },
  successDivider: {
    height: 1,
    marginVertical: 2,
  },
  successFineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  successFineText: {
    fontSize: 11,
    fontWeight: "500",
  },
  successPrimaryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
  },
  successPrimaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  successSecondaryBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
  },
  successSecondaryBtnText: {
    fontSize: 13,
    fontWeight: "500",
  },

  /* Center QR Scanner Camera */
  scannerFullscreen: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scannerTopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  scannerCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  scannerHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  scannerHeaderSub: {
    color: "#A1A1AA",
    fontSize: 11,
    marginTop: 2,
  },
  scannerCameraContainer: {
    flex: 1,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  scannerPermissionBox: {
    alignItems: "center",
    paddingHorizontal: 30,
    gap: 12,
  },
  scannerPermissionText: {
    color: "#FFFFFF",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
  scannerPermissionBtn: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  scannerPermissionBtnText: {
    color: "#09090B",
    fontSize: 13,
    fontWeight: "600",
  },
  reticleFrame: {
    width: 250,
    height: 250,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  reticleCorner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#FFFFFF",
  },
  reticleTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  reticleTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  reticleBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  reticleBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  reticleCenterGlow: {
    width: 230,
    height: 2,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  scannerSimChipsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "rgba(24, 24, 27, 0.9)",
  },
  scannerSimChipsLabel: {
    color: "#A1A1AA",
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 8,
  },
  scannerSimChipsRow: {
    flexDirection: "row",
    gap: 8,
  },
  scannerSimChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#27272A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  scannerSimChipText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "500",
  },
  scannedInfoCard: {
    backgroundColor: "#18181B",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    gap: 12,
  },
  scannedInfoTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scannedSpotNumber: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
  },
  scannedSpotLocation: {
    color: "#A1A1AA",
    fontSize: 12,
    marginTop: 2,
  },
  scannedStatusPill: {
    backgroundColor: "#27272A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scannedStatusPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "500",
  },
  scannedDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scannedRateText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  scannedTokenText: {
    color: "#71717A",
    fontSize: 11,
  },
  scannedActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  scannedParkNowBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  scannedParkNowBtnText: {
    color: "#09090B",
    fontSize: 13,
    fontWeight: "600",
  },
  scannedRescanBtn: {
    backgroundColor: "#27272A",
    borderRadius: 22,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  scannedRescanBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },

  /* MAP STATION BOTTOM SHEET STYLES */
  mapSheetImageRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 16,
  },
  mapSheetThumb: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  mapSheetInfoCol: {
    flex: 1,
    justifyContent: "space-between",
    minWidth: 0,
  },
  mapSheetBadgeRow: {
    flexDirection: "row",
  },
  mapSheetBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  mapSheetBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  mapSheetRateText: {
    fontSize: 14,
    fontWeight: "600",
  },
  mapSheetSubText: {
    fontSize: 10,
  },
  mapSheetActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  mapSheetActionBtnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mapSheetActionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: "500",
  },
  mapSheetActionBtnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mapSheetActionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: "500",
  },
  /* Screenshot Map Styles */
  radarOuterCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(9, 9, 11, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  radarInnerCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(9, 9, 11, 0.28)",
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
  searchInput: {
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
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
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
  cardZoneBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardZoneBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "500",
  },
  cardEvStationBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(9, 9, 11, 0.85)",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  cardEvStationBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  evRecommendedPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  evRecommendedPillText: {
    fontSize: 10,
    fontWeight: "500",
  },
  emptyFilteredStateCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    paddingVertical: 44,
    paddingHorizontal: 24,
    minHeight: 330,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 12,
  },
  emptyStateIconHalo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyStateIconCore: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: "400",
    letterSpacing: -0.3,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "400",
    textAlign: "center",
    paddingHorizontal: 10,
    marginBottom: 22,
  },
  emptyStateActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyStatePrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyStatePrimaryBtnText: {
    fontSize: 13,
    fontWeight: "400",
    letterSpacing: -0.1,
  },
  emptyStateSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyStateSecondaryBtnText: {
    fontSize: 13,
    fontWeight: "400",
  },
  emptyStateQuickJumpBox: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.15)",
    width: "100%",
    alignItems: "center",
  },
  emptyStateQuickJumpLabel: {
    fontSize: 11.5,
    fontWeight: "400",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyStateChipsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  emptyStateChipPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyStateChipText: {
    fontSize: 12,
    fontWeight: "400",
  },
  evGatewayCard: {
    width: "100%",
    marginTop: 18,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  evGatewayContentRow: {
    width: "100%",
  },
  evHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  evGatewayIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  evGatewayTextCol: {
    width: "100%",
  },
  evGatewayTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  evPillBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
  },
  evPillBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  evGatewaySubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  evGatewayActionBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 6,
  },
  evGatewayActionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyRecentBox: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    minHeight: 140,
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  emptyRecentText: {
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
  },
  confirmTimeframeSection: {
    marginVertical: 14,
  },
  confirmTimeframeLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  exitEstPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  exitEstText: {
    fontSize: 11,
    fontWeight: "500",
  },
  timeframePillsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  timeframeChip: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  timeframeChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  timeframeStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  stepperActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDurationText: {
    fontSize: 14,
    fontWeight: "600",
  },
  stepperCostSubtext: {
    fontSize: 11,
    fontWeight: "400",
  },

  /* GEMINI AI RECOMMENDATIONS & FULLSCREEN SCAN OVERLAY */
  geminiAiRecommendationBanner: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  geminiAccentTopStripe: {
    height: 3,
    width: "100%",
    backgroundColor: "#09090B",
  },
  geminiBannerInner: {
    padding: 14,
  },
  geminiBannerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  geminiIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#09090B",
    justifyContent: "center",
    alignItems: "center",
  },
  geminiBannerTitle: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  geminiBannerSubtitle: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: 1,
  },
  geminiActivePill: {
    backgroundColor: "rgba(9, 9, 11, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#71717A",
  },
  geminiActivePillText: {
    fontSize: 9,
    fontWeight: "500",
    color: "#09090B",
    letterSpacing: 0.5,
  },
  geminiStatsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  geminiStatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  geminiStatChipText: {
    fontSize: 10,
    fontWeight: "500",
  },
  geminiCardAiBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  geminiCardAiBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  aiBalanceEstimatedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.18)",
  },
  aiBalancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  aiBalancePillText: {
    fontSize: 10,
    fontWeight: "500",
  },
  aiSavingsTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  aiSavingsTagText: {
    fontSize: 10,
    fontWeight: "500",
  },
  aiScanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 99999,
    justifyContent: "center",
    alignItems: "center",
  },
  aiScanBwWave: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 260,
  },
  aiScanBwLaserLine: {
    position: "absolute",
    top: 130,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },

  /* FULL SCREEN NOTIFICATIONS MODAL STYLES */
  notificationsFullScreenContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  notifTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  notifHeaderLeftCol: {
    flexDirection: "row",
    alignItems: "center",
  },
  notifTitleBadgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 12,
  },
  notifHeaderTitle: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  notifUnreadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  notifUnreadBadgeText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  notifMarkAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  notifMarkAllText: {
    fontSize: 12,
    fontWeight: "500",
  },
  aiAreaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aiAreaBadgeText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  aiRecommendedSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  aiRecommendedSubtitleText: {
    fontSize: 12,
    fontWeight: "400",
  },
  notifFiltersContainer: {
    paddingVertical: 12,
  },
  notifFiltersScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  notifFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  notifFilterChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  notifListContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  notifCard: {
    borderRadius: 18,
    padding: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  notifCardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  notifIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  notifCategoryTag: {
    fontSize: 11,
    fontWeight: "400",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  notifUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  notifMessage: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 19,
    marginBottom: 10,
  },
  notifActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  notifActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  notifActionBtnText: {
    fontSize: 12,
    fontWeight: "500",
  },
  notifEmptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 30,
  },
  notifEmptyIconBox: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  notifEmptyTitle: {
    fontSize: 18,
    fontWeight: "400",
    marginBottom: 6,
  },
  notifEmptySub: {
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 18,
  },
  reviewsHeaderCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  reviewsScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewsAvgScore: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  reviewsCountText: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 4,
  },
  writeReviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  writeReviewBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyReviewsBox: {
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  reviewAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  reviewAuthorName: {
    fontSize: 14,
    fontWeight: "600",
  },
  reviewDateText: {
    fontSize: 11,
    fontWeight: "400",
  },
  reviewCommentText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
  },
  reviewTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  reviewTagPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  reviewTagText: {
    fontSize: 11,
    fontWeight: "500",
  },
});