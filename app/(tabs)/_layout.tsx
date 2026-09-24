import { Tabs } from "expo-router";
import { Text, StyleSheet } from "react-native";

interface TabIconProps {
  glyph: string;
  focused: boolean;
}

const TabIcon = ({ glyph, focused }: TabIconProps) => (
  <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>{glyph}</Text>
);

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="Home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon glyph="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: "Vehicles",
          tabBarIcon: ({ focused }) => <TabIcon glyph="▣" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="Permits"
        options={{
          title: "Permits",
          tabBarIcon: ({ focused }) => <TabIcon glyph="▤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="Activities"
        options={{
          title: "Activity",
          tabBarIcon: ({ focused }) => <TabIcon glyph="◷" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon glyph="◉" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 68,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopColor: "#E2E8F0",
    borderTopWidth: 1,
    backgroundColor: "#FFFFFF",
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.5,
    color: "#64748B",
  },
  tabIconFocused: {
    opacity: 1,
    color: "#2563EB",
  },
});
