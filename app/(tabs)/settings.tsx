import {Text, View, Image, TextInput} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Settings = ()=>{

    return (
      <SafeAreaView>
        <View className="auth-content">
            <Text> This is Settings Page</Text>
        </View>
      </SafeAreaView>
    );
}

export default Settings;