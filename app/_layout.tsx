import "../global.css";
import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Session } from "@supabase/supabase-js";
import { GlobalAlert } from "../components/GlobalAlert";
import { OfflineBanner } from "../components/OfflineBanner";
import { useTheme } from "../hooks/useTheme";
import { supabase } from "./lib/supabase";
import { ensureUserProfile } from "./services/auth";
import { initNetworkMonitor } from "./services/networkMonitor";

export default function RootLayout() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    initNetworkMonitor();
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        if (data.session?.user) {
          ensureUserProfile(data.session.user).catch(() => {});
        }
        setAuthReady(true);
      })
      .catch(() => {
        if (mounted) setAuthReady(true);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      if (nextSession?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        ensureUserProfile(nextSession.user).catch(() => {});
      }
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;

    const segs = segments as string[];
    const topSegment = segs[0];
    const subSegment = segs[1];
    const isPublicAuthGroup =
      !topSegment ||
      topSegment === "(welcome)" ||
      topSegment === "(auth)" ||
      topSegment === "db_connection";
    const isPasswordRecoveryFlow =
      topSegment === "(auth)" &&
      (subSegment === "otp_verfied" ||
        subSegment === "new_pass" ||
        subSegment === "change_succesfully" ||
        subSegment === "succesfully" ||
        subSegment === "terms_privacy");

    if (session?.user && isPublicAuthGroup && !isPasswordRecoveryFlow) {
      router.replace("/(tabs)/home");
    } else if (!session?.user && !isPublicAuthGroup) {
      router.replace("/(auth)/sign_in");
    }
  }, [authReady, session, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaProvider>
        <StatusBar style={theme.isDark ? "light" : "dark"} translucent />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
          }}
        />
        <OfflineBanner />
        <GlobalAlert />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
