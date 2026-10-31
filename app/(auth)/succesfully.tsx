import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import ConfettiCannon from "react-native-confetti-cannon";
import { Icons } from "../../constants/icons";
import { GlassBackground } from "../../components/GlassBackground";
import { GlassCard } from "../../components/GlassCard";
import { useTheme } from "../../hooks/useTheme";
import { supabase } from "../lib/supabase";

const Successfully = () => {
  const theme = useTheme();
  const router = useRouter();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session?.user));
    });
  }, []);

  return (
    <GlassBackground>
      <SafeAreaView style={styles.container}>
        <GlassCard style={styles.content} intensity={60}>
          <View style={styles.badgeContainer}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.borderStrong,
                },
              ]}
            >
              <Image
                source={Icons.logoImg}
                style={[styles.badgeImage, { tintColor: theme.text }]}
                resizeMode="contain"
              />
            </View>
          </View>

          <View
            style={[
              styles.eyebrowContainer,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.borderStrong,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: theme.text }]} />
            <Text style={[styles.eyebrow, { color: theme.text }]}>
              PARKZONE RWANDA • ACTIVE
            </Text>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            You&apos;re All Set!
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Your smart motorist profile has been registered in the database with
            end-to-end cryptographic protection.
          </Text>

          <TouchableOpacity
            style={[
              styles.primaryPillBtn,
              {
                backgroundColor: theme.primaryBtnBg,
                shadowColor: theme.cardShadow,
              },
            ]}
            onPress={() =>
              router.replace(hasSession ? "/(tabs)/home" : "/(auth)/sign_in")
            }
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryPillBtnText, { color: theme.primaryBtnText }]}>
              {hasSession ? "Continue to Dashboard" : "Continue to Sign In"}
            </Text>
          </TouchableOpacity>
        </GlassCard>

        <ConfettiCannon
          count={70}
          origin={{ x: 0, y: 0 }}
          autoStart
          fadeOut
          colors={
            theme.isDark
              ? ["#FFFFFF", "#E4E4E7", "#A1A1AA", "#71717A"]
              : ["#09090B", "#52525B", "#71717A", "#A1A1AA"]
          }
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
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeImage: {
    width: 34,
    height: 34,
  },
  eyebrowContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  primaryPillBtn: {
    borderRadius: 26,
    height: 52,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryPillBtnText: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});