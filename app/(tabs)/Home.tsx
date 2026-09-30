import { TouchableOpacity, View , Image,Text, TextInput} from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView from "react-native-maps";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Icons } from "../../constants/icons";


const Home = ()=>{


  const  [isPressed, setIsPressed] = useState(false);

    return (

      <SafeAreaView className="home-screen">



            <View className="map-section">
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

                <View
                  className="map-indicator"
                  pointerEvents="none"
                  style={{
                    top: "50%",
                    left: "50%",
                    transform: [{ translateX: -20 }, { translateY: -52 }],
                  }}
                >
                  <View className="map-indicator-head">
                    <Image className="map-indicator-icon" style={{ tintColor: "#FFFFFF" }} source={Icons.mapIndicatorIcon} />
                  </View>
                  <View className="map-indicator-tip" />
                </View>
              </View>

              <View className="map-controls">
              <View className="map-control-stack">

                <TouchableOpacity>
                  <View className="inner-square">
                    <Image className="search-icon"  source={require("../assets/icons/search.png")} />
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
            </View>

            <BottomSheet
              index={0}
              snapPoints={['25%', '50%']}
              enableDynamicSizing={false}
              containerStyle={{ zIndex: 20, elevation: 20 }}
              backgroundStyle={{ backgroundColor: "#ffffff" }}
              handleIndicatorStyle={{ backgroundColor: "#6b7280" }}
            >
              <BottomSheetScrollView>

                <View className="bottom-sheet-content">

                  <View className="search-bar-container">
                    <View className="search-bar-field">
                      <Image className="search-bar-icon" source={Icons.searchBarIcon} /> 
                      <TextInput
                        className="search-bar"
                        placeholder="Enter parking location or Zone" style= {{marginLeft: 10}}
                      />
                    </View>

                  </View>






                </View>

              </BottomSheetScrollView>
            </BottomSheet>




                

        




      </SafeAreaView>
      



    )
}


export default Home;