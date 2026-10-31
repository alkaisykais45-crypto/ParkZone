import React, { useEffect, useState, useCallback } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { hashLicensePlate, maskLicensePlate } from "../lib/crypto";
import { Icons } from "../../constants/icons";
import {
    fetchUserVehicles,
    registerVehicle,
    deleteVehicle,
    setDefaultVehicle,
    RegisteredVehicle,
    VehicleType,
} from "../services/parking";
import { useNavigation } from "@react-navigation/native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { VehiclesSkeleton } from "../../components/SkeletonLoader";

const Vehicles = () => {
    const theme = useTheme();
    const router = useRouter();
    const navigation = useNavigation();
    const [vehicles, setVehicles] = useState<RegisteredVehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Hide tab bar when modal is open
    useEffect(() => {
        if (modalVisible) {
            navigation.getParent()?.setOptions({ tabBarStyle: { display: "none" } });
        } else {
            navigation.getParent()?.setOptions({ tabBarStyle: undefined });
        }
    }, [modalVisible, navigation]);

    // Form State
    const [plateNumber, setPlateNumber] = useState("");
    const [vehicleType, setVehicleType] = useState<VehicleType>("gasoline");
    const [makeModel, setMakeModel] = useState("");
    const [color, setColor] = useState("");
    const [handicapPermit, setHandicapPermit] = useState("");

    const [refreshing, setRefreshing] = useState(false);

    const loadVehicles = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
                const list = await fetchUserVehicles(user.id);
                setVehicles(list);
            } else {
                setVehicles([]);
            }
        } catch (err) {
            console.warn("Could not load vehicles:", err);
            setVehicles([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadVehicles();
    }, [loadVehicles]);

    useFocusEffect(
        useCallback(() => {
            loadVehicles();
        }, [loadVehicles])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadVehicles();
        setRefreshing(false);
    };

    const handleSetDefault = async (v: RegisteredVehicle) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.id) return;
            await setDefaultVehicle(user.id, v.id);
            setVehicles((prev) =>
                prev.map((item) => ({
                    ...item,
                    is_default: item.id === v.id,
                }))
            );
            Alert.alert("Active Vehicle Selected", `${v.plate_number} is now your active vehicle for parking.`);
        } catch (e: any) {
            Alert.alert("Error", e.message || "Could not set active vehicle.");
        }
    };

    const handleRegisterVehicle = async () => {
        if (!plateNumber.trim()) {
            Alert.alert("Missing Plate Number", "Please enter your vehicle's license plate.");
            return;
        }

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.id) {
                Alert.alert("Sign In Required", "Please sign in to save your vehicle to the database.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Sign In", onPress: () => router.push("/(auth)/sign_in") },
                ]);
                return;
            }

            const result = await registerVehicle({
                userId: user.id,
                plateNumber,
                vehicleType,
                makeModel: makeModel.trim(),
                color: color.trim(),
                handicapPermitNumber: handicapPermit.trim(),
                isDefault: true,
            });

            if (result.error || !result.data) {
                Alert.alert("Registration Error", result.error || "Unable to save vehicle in database.");
            } else {
                await loadVehicles();
                setModalVisible(false);
                resetForm();
                Alert.alert("Vehicle Registered", `Plate ${result.data.plate_number} is now registered and set as your active vehicle.`);
            }
        } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to register vehicle.");
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setPlateNumber("");
        setVehicleType("gasoline");
        setMakeModel("");
        setColor("");
        setHandicapPermit("");
    };

    const handleDelete = async (vehicleId: string, plate: string) => {
        Alert.alert(
            "Remove Vehicle",
            `Are you sure you want to delete ${plate}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        await deleteVehicle(vehicleId);
                        setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
                    },
                },
            ]
        );
    };

    const renderTypeBadge = (type: VehicleType) => {
        switch (type) {
            case "ev":
                return (
                    <View style={[styles.badge, { backgroundColor: theme.evGreenSoft, borderColor: theme.evGreenBorder, borderWidth: 1 }]}>
                        <Text style={[styles.badgeTextEV, { color: theme.evGreen }]}>EV / ELECTRIC</Text>
                    </View>
                );
            case "handicap":
                return (
                    <View style={[styles.badge, { backgroundColor: theme.surfaceMuted, borderColor: theme.borderStrong, borderWidth: 1 }]}>
                        <Text style={[styles.badgeTextHandicap, { color: theme.text }]}>HANDICAP PERMIT</Text>
                    </View>
                );
            default:
                return (
                    <View style={[styles.badge, { backgroundColor: theme.pillInactiveBg, borderColor: theme.border, borderWidth: 1 }]}>
                        <Text style={[styles.badgeTextGas, { color: theme.textSecondary }]}>GASOLINE</Text>
                    </View>
                );
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header: Transparent with Back Button */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={[styles.headerBackBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => router.back()}
                    activeOpacity={0.7}
                >
                    <Ionicons name="arrow-back" size={20} color={theme.text} />
                </TouchableOpacity>

                <View style={styles.headerTitleCenter}>
                    <Text style={[styles.title, { color: theme.text }]}>Registered Vehicles</Text>
                    <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                        Plate verified upon entering Kigali lots
                    </Text>
                </View>

                <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: theme.primaryBtnBg }]}
                    onPress={() => setModalVisible(true)}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.addButtonText, { color: theme.primaryBtnText }]}>+ Add</Text>
                </TouchableOpacity>
            </View>

            {/* Vehicle List */}
            {loading ? (
                <VehiclesSkeleton />
            ) : (
                <FlatList
                    data={vehicles}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={theme.text}
                            colors={[theme.text]}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Image
                                source={Icons.picon}
                                style={[styles.emptyBrandLogo, { tintColor: theme.textMuted }]}
                                resizeMode="contain"
                            />
                            <Text style={[styles.emptyTitle, { color: theme.text }]}>No vehicles registered</Text>
                            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                                Register your car plate to enable instant QR parking, EV spots, and avoid 3,000 RWF fines.
                            </Text>
                            <TouchableOpacity
                                style={[styles.emptyButton, { backgroundColor: theme.primaryBtnBg }]}
                                onPress={() => setModalVisible(true)}
                            >
                                <Text style={[styles.emptyButtonText, { color: theme.primaryBtnText }]}>
                                    Register Your First Vehicle
                                </Text>
                            </TouchableOpacity>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View
                            style={[
                                styles.card,
                                {
                                    backgroundColor: theme.surface,
                                    borderColor: theme.border,
                                    shadowColor: theme.cardShadow,
                                },
                            ]}
                        >
                            <View style={styles.cardHeader}>
                                <View
                                    style={[
                                        styles.plateContainer,
                                        {
                                            backgroundColor: theme.background,
                                            borderColor: theme.borderStrong,
                                        },
                                    ]}
                                >
                                    <View style={[styles.plateFlag, { backgroundColor: theme.pillActiveBg }]}>
                                        <Text style={[styles.plateFlagText, { color: theme.pillActiveText }]}>RWA</Text>
                                    </View>
                                    <Text style={[styles.plateText, { color: theme.text }]}>{item.plate_number}</Text>
                                </View>
                                {renderTypeBadge(item.vehicle_type)}
                            </View>

                            <View style={styles.cardBody}>
                                <Text style={[styles.modelText, { color: theme.textSecondary }]}>
                                    {item.make_model || "Unspecified Model"}
                                    {item.color ? ` • ${item.color}` : ""}
                                </Text>
                                {item.handicap_permit_number ? (
                                    <Text style={[styles.permitText, { color: theme.textSecondary }]}>
                                        Permit ID: {item.handicap_permit_number}
                                    </Text>
                                ) : null}
                            </View>

                            <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                                {item.is_default ? (
                                    <View
                                        style={[
                                            styles.defaultBadge,
                                            { backgroundColor: theme.pillActiveBg },
                                        ]}
                                    >
                                        <Text style={[styles.defaultBadgeText, { color: theme.pillActiveText }]}>
                                            ACTIVE VEHICLE • IN USE
                                        </Text>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={[
                                            styles.defaultBadge,
                                            { backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.border },
                                        ]}
                                        onPress={() => handleSetDefault(item)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.defaultBadgeText, { color: theme.textSecondary }]}>
                                            Set as Active
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    onPress={() => handleDelete(item.id, item.plate_number)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Text style={[styles.deleteText, { color: theme.danger }]}>Remove</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                />
            )}

            {/* Modal: Register Vehicle */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View
                        style={[
                            styles.modalContainer,
                            {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                            },
                        ]}
                    >
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                            <Text style={[styles.modalTitle, { color: theme.text }]}>Register New Vehicle</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={[styles.closeButton, { color: theme.textSecondary }]}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Plate Input */}
                            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                                LICENSE PLATE NUMBER *
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.inputBg,
                                        borderColor: theme.inputBorder,
                                        color: theme.text,
                                    },
                                ]}
                                placeholder="e.g. RAD 120 A"
                                placeholderTextColor={theme.textMuted}
                                autoCapitalize="characters"
                                value={plateNumber}
                                onChangeText={setPlateNumber}
                            />

                            {/* Vehicle Type Selector */}
                            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                                VEHICLE CLASSIFICATION *
                            </Text>
                            <View style={styles.typeSelectorRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.typeButton,
                                        {
                                            backgroundColor:
                                                vehicleType === "gasoline" ? theme.pillActiveBg : theme.inputBg,
                                            borderColor:
                                                vehicleType === "gasoline" ? theme.pillActiveBg : theme.border,
                                        },
                                    ]}
                                    onPress={() => setVehicleType("gasoline")}
                                >
                                    <Text
                                        style={[
                                            styles.typeButtonText,
                                            {
                                                color:
                                                    vehicleType === "gasoline"
                                                        ? theme.pillActiveText
                                                        : theme.textSecondary,
                                            },
                                        ]}
                                    >
                                        Gasoline
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.typeButton,
                                        {
                                            backgroundColor:
                                                vehicleType === "ev" ? theme.pillActiveBg : theme.inputBg,
                                            borderColor:
                                                vehicleType === "ev" ? theme.pillActiveBg : theme.border,
                                        },
                                    ]}
                                    onPress={() => setVehicleType("ev")}
                                >
                                    <Text
                                        style={[
                                            styles.typeButtonText,
                                            {
                                                color:
                                                    vehicleType === "ev"
                                                        ? theme.pillActiveText
                                                        : theme.textSecondary,
                                            },
                                        ]}
                                    >
                                        EV / Electric
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.typeButton,
                                        {
                                            backgroundColor:
                                                vehicleType === "handicap" ? theme.pillActiveBg : theme.inputBg,
                                            borderColor:
                                                vehicleType === "handicap" ? theme.pillActiveBg : theme.border,
                                        },
                                    ]}
                                    onPress={() => setVehicleType("handicap")}
                                >
                                    <Text
                                        style={[
                                            styles.typeButtonText,
                                            {
                                                color:
                                                    vehicleType === "handicap"
                                                        ? theme.pillActiveText
                                                        : theme.textSecondary,
                                            },
                                        ]}
                                    >
                                        Handicap
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Conditional Handicap Permit Number */}
                            {vehicleType === "handicap" && (
                                <>
                                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                                        HANDICAP PERMIT NUMBER
                                    </Text>
                                    <TextInput
                                        style={[
                                            styles.input,
                                            {
                                                backgroundColor: theme.inputBg,
                                                borderColor: theme.inputBorder,
                                                color: theme.text,
                                            },
                                        ]}
                                        placeholder="e.g. RWA-DIS-0982"
                                        placeholderTextColor={theme.textMuted}
                                        value={handicapPermit}
                                        onChangeText={setHandicapPermit}
                                    />
                                </>
                            )}

                            {/* Make & Model */}
                            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>MAKE & MODEL</Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.inputBg,
                                        borderColor: theme.inputBorder,
                                        color: theme.text,
                                    },
                                ]}
                                placeholder="e.g. Toyota RAV4 / Tesla Model Y"
                                placeholderTextColor={theme.textMuted}
                                value={makeModel}
                                onChangeText={setMakeModel}
                            />

                            {/* Color */}
                            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>COLOR</Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.inputBg,
                                        borderColor: theme.inputBorder,
                                        color: theme.text,
                                    },
                                ]}
                                placeholder="e.g. Silver, Black, White"
                                placeholderTextColor={theme.textMuted}
                                value={color}
                                onChangeText={setColor}
                            />

                            {/* Submit */}
                            <TouchableOpacity
                                style={[styles.submitButton, { backgroundColor: theme.primaryBtnBg }]}
                                onPress={handleRegisterVehicle}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color={theme.primaryBtnText} />
                                ) : (
                                    <Text style={[styles.submitButtonText, { color: theme.primaryBtnText }]}>
                                        Confirm & Save Vehicle
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default Vehicles;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#000000",
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
        paddingHorizontal: 8,
    },
    emptyBrandLogo: {
        width: 48,
        height: 48,
        tintColor: "#555555",
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: "600",
        color: "#FFFFFF",
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 11,
        color: "#888888",
        marginTop: 2,
        fontWeight: "400",
    },
    addButton: {
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
    },
    addButtonText: {
        color: "#000000",
        fontWeight: "500",
        fontSize: 13,
    },
    centered: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    listContent: {
        padding: 20,
        paddingBottom: 110,
    },
    emptyContainer: {
        marginTop: 60,
        alignItems: "center",
        paddingHorizontal: 30,
    },
    emptyTitle: {
        color: "#FFFFFF",
        fontSize: 18,
        fontWeight: "400",
        marginBottom: 8,
    },
    emptySubtitle: {
        color: "#777777",
        fontSize: 14,
        textAlign: "center",
        lineHeight: 20,
        marginBottom: 24,
    },
    emptyButton: {
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 24,
    },
    emptyButtonText: {
        color: "#000000",
        fontWeight: "400",
        fontSize: 14,
    },
    card: {
        backgroundColor: "#0F0F0F",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#222222",
        padding: 18,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    plateContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1C1C1E",
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: "#333333",
    },
    plateFlag: {
        backgroundColor: "#000000",
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 8,
    },
    plateFlagText: {
        color: "#FFFFFF",
        fontSize: 10,
        fontWeight: "500",
    },
    plateText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "600",
        letterSpacing: 1.5,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeEV: {
        backgroundColor: "#18181B",
        borderColor: "#FFFFFF",
        borderWidth: 1,
    },
    badgeTextEV: {
        color: "#FFFFFF",
        fontSize: 10,
        fontWeight: "500",
    },
    badgeHandicap: {
        backgroundColor: "#27272A",
        borderColor: "#A1A1AA",
        borderWidth: 1,
    },
    badgeTextHandicap: {
        color: "#E4E4E7",
        fontSize: 10,
        fontWeight: "500",
    },
    badgeGas: {
        backgroundColor: "#202020",
        borderColor: "#444444",
        borderWidth: 1,
    },
    badgeTextGas: {
        color: "#BBBBBB",
        fontSize: 10,
        fontWeight: "500",
    },
    cardBody: {
        marginBottom: 14,
    },
    modelText: {
        color: "#DDDDDD",
        fontSize: 15,
        fontWeight: "400",
    },
    permitText: {
        color: "#888888",
        fontSize: 12,
        marginTop: 4,
    },
    cardFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "#1C1C1E",
    },
    defaultBadge: {
        backgroundColor: "#222222",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    defaultBadgeText: {
        color: "#999999",
        fontSize: 9,
        fontWeight: "500",
        letterSpacing: 0.5,
    },
    deleteText: {
        color: "#888888",
        fontSize: 12,
        fontWeight: "400",
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.85)",
        justifyContent: "flex-end",
    },
    modalContainer: {
        backgroundColor: "#0F0F0F",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: "85%",
        borderTopWidth: 1,
        borderTopColor: "#2A2A2A",
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
    },
    modalTitle: {
        color: "#FFFFFF",
        fontSize: 18,
        fontWeight: "600",
    },
    closeButton: {
        color: "#888888",
        fontSize: 20,
        fontWeight: "500",
    },
    inputLabel: {
        color: "#AAAAAA",
        fontSize: 11,
        fontWeight: "400",
        letterSpacing: 0.8,
        marginBottom: 8,
        marginTop: 14,
    },
    input: {
        backgroundColor: "#1A1A1A",
        borderRadius: 12,
        color: "#FFFFFF",
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        borderWidth: 1,
        borderColor: "#2E2E2E",
    },
    typeSelectorRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 4,
    },
    typeButton: {
        flex: 1,
        backgroundColor: "#181818",
        paddingVertical: 12,
        alignItems: "center",
        borderRadius: 10,
        marginHorizontal: 3,
        borderWidth: 1,
        borderColor: "#2A2A2A",
    },
    typeButtonActive: {
        backgroundColor: "#FFFFFF",
        borderColor: "#FFFFFF",
    },
    typeButtonText: {
        color: "#888888",
        fontSize: 11,
        fontWeight: "500",
    },
    typeButtonTextActive: {
        color: "#000000",
        fontWeight: "600",
    },
    submitButton: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: "center",
        marginTop: 26,
        marginBottom: 20,
    },
    submitButtonText: {
        color: "#000000",
        fontSize: 15,
        fontWeight: "400",
    },
});