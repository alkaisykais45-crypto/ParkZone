import { Tabs } from "expo-router";
import { Platform, View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

function FloatingCompactTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const currentRoute = state.routes[state.index];
  const currentOptions = descriptors[currentRoute.key]?.options;

  // Respect tabBarStyle: { display: "none" } (e.g. for fullscreen EV Map)
  if (
    currentOptions?.tabBarStyle &&
    (currentOptions.tabBarStyle as any).display === "none"
  ) {
    return null;
  }

  // Filter only visible navigation tabs (exclude routes with href: null)
  const visibleRoutes = state.routes.filter((route) => {
    const opts = descriptors[route.key]?.options as any;
    return (
      opts?.href !== null && opts?.tabBarItemStyle?.display !== "none"
    );
  });

  const bottomMargin = insets.bottom > 0 ? insets.bottom + 8 : 18;

  return (
    <View
      style={{
        position: "absolute",
        bottom: bottomMargin,
        left: 0,
        right: 0,
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "box-none",
        zIndex: 999,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: 278,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.isDark
            ? "rgba(18, 18, 22, 0.96)"
            : "rgba(255, 255, 255, 0.98)",
          borderWidth: 1,
          borderColor: theme.isDark
            ? "rgba(255, 255, 255, 0.14)"
            : "rgba(0, 0, 0, 0.08)",
          paddingHorizontal: 8,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: theme.isDark ? 0.45 : 0.12,
          shadowRadius: 18,
          elevation: 12,
        }}
      >
        {visibleRoutes.map((route) => {
          const isFocused = state.routes[state.index].key === route.key;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          const activeColor = theme.isDark ? "#FFFFFF" : "#09090B";
          const inactiveColor = theme.isDark ? "#71717A" : "#8E8E93";
          const color = isFocused ? activeColor : inactiveColor;

          // Center Scan / Quick Action Button
          if (route.name === "vehicles") {
            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                onLongPress={onLongPress}
                activeOpacity={0.8}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: theme.isDark ? "#FFFFFF" : "#09090B",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: Platform.OS === "ios" ? -8 : -6,
                  borderWidth: 2,
                  borderColor: theme.isDark ? "#121216" : "#FFFFFF",
                  shadowColor: "#000000",
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.25,
                  shadowRadius: 6,
                  elevation: 6,
                }}
              >
                <Ionicons
                  name="scan-outline"
                  size={18}
                  color={theme.isDark ? "#09090B" : "#FFFFFF"}
                />
              </TouchableOpacity>
            );
          }

          // Standard Navigation Tabs
          let iconName: keyof typeof Ionicons.glyphMap = "home-outline";
          let label = "Home";

          if (route.name === "home") {
            iconName = isFocused ? "home" : "home-outline";
            label = "Home";
          } else if (route.name === "ev_chargers") {
            iconName = isFocused ? "map" : "map-outline";
            label = "EV Map";
          } else if (route.name === "activities") {
            iconName = isFocused ? "time" : "time-outline";
            label = "History";
          } else if (route.name === "profile") {
            iconName = isFocused ? "person" : "person-outline";
            label = "Profile";
          }

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              activeOpacity={0.7}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 2,
              }}
            >
              <Ionicons name={iconName} size={19} color={color} />
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: isFocused ? "600" : "400",
                  color,
                  marginTop: 1,
                  letterSpacing: -0.2,
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const TabsLayout = () => {
  return (
    <Tabs
      tabBar={(props) => <FloatingCompactTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="ev_chargers"
        options={{
          title: "EV Map",
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: "",
        }}
      />
      <Tabs.Screen
        name="activities"
        options={{
          title: "History",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
        }}
      />

      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="permits" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
};

export default TabsLayout;
