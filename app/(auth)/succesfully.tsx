import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import ConfettiCannon from "react-native-confetti-cannon";
import { Icons } from "../../constants/icons";
import { GlassBackground } from "../../components/GlassBackground";
import { GlassCard } from "../../components/GlassCard";

const Successfully = () => {
  const router = useRouter();

  return (
    <GlassBackground>
      <SafeAreaView style={styles.container}>
        <GlassCard style={styles.content} intensity={60}>
          <View style={styles.badgeContainer}>
            <View style={styles.badge}>
              <Image
                source={Icons.logoImg}
                style={styles.badgeImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={styles.eyebrowContainer}>
            <View style={styles.dot} />
            <Text style={styles.eyebrow}>PARKZONE RWANDA • ACTIVE</Text>
          </View>

          <Text style={styles.title}>You&apos;re All Set!</Text>
          <Text style={styles.subtitle}>
            Your smart motorist profile has been registered successfully with
            end-to-end cryptographic protection.
          </Text>

          <TouchableOpacity
            style={styles.primaryPillBtn}
            onPress={() => router.replace("/(auth)/sign_in")}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryPillBtnText}>Continue to Sign In</Text>
          </TouchableOpacity>
        </GlassCard>

        <ConfettiCannon
          count={70}
          origin={{ x: 0, y: 0 }}
          autoStart
          fadeOut
          colors={["#FFFFFF", "#E4E4E7", "#A1A1AA", "#71717A"]}
          explosionSpeed={350}
          fallSpeed={2500}
        />
      </SafeAreaView>
    </GlassBackground>
  );
};

export default Successfully;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  content: {
    width: "100%",
    alignItems: "center",
  },
  badgeContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeImage: {
    width: 34,
    height: 34,
    tintColor: "#000000",
  },
  eyebrowContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 6,
  },
  eyebrow: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: "#A1A1AA",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  primaryPillBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    height: 52,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryPillBtnText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});