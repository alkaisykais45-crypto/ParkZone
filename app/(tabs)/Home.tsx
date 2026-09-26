import { TouchableOpacity, View , Image} from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView from "react-native-maps";
import { ScrollView } from "react-native";


const Home = ()=>{


  const  [isPressed, setIsPressed] = useState(false);

    return (

      <ScrollView>
      <SafeAreaView className="auto-page">



            <View className="map-content">
              <MapView
                style={{ flex: 1 }}
                initialRegion={{
                  latitude: 37.78825,
                  longitude: -122.4324,
                  latitudeDelta: 0.0922,
                  longitudeDelta: 0.0421,
                }}
              />
            </View>

            <View className="map-controls">
              <View className="map-control-stack">
                <TouchableOpacity>
                  <View className="inner-square">
                    <Image className="search-icon" source={require("../assets/icons/search.png")} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setIsPressed(!isPressed)}
                >
                  <View className="inner-square-charging-station">
                    <Image
                      className="charging-station-icon"
                      source={isPressed ? require("../assets/icons/charger-station-active.png") : require("../assets/icons/charging-station.png")}
                      style={isPressed ? { transform: [{ scale: 1.17 }] } : undefined}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <TouchableOpacity>
                <View className="inner-square-settings">
                  <Image className="settings-icon" source={require("../assets/icons/menu.png")} />
                </View>
              </TouchableOpacity>

            </View>



            <View className="bottom-bar-container">
            </View>




      </SafeAreaView>
      </ScrollView>
      



    )
}


export default Home;