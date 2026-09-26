import { Tabs } from "expo-router";
import { Icons } from "../../constants/icons";
import { Image } from "react-native";






// This is the layout for the bottom tab navigation in the app.


const TabsLayout = () => {
  return (
    <Tabs screenOptions={{ headerShown: false }}>

  
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: () => <Image className="home-icon" source={Icons.HomeIcon} />,
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: "Vehicles",
          tabBarIcon: () => <Image className="vehicle-icon" source={Icons.VehicleIcon} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "Payments",
          tabBarIcon: () => <Image className="pay-icon" source={Icons.PayIcon} />,
        }}
      />
      <Tabs.Screen
        name="activities"
        options={{
          title: "Activity",
          tabBarIcon: () => <Image className="activity-icon" source={Icons.ActivityIcon} />,
        }}
      />


      <Tabs.Screen name="permits" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
};

export default TabsLayout;






