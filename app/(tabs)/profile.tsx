import {Text, View, Image, TextInput} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Profile = ()=>{

    return (
      <SafeAreaView>
        <View className="auth-content">
            <Text> This is Profile Page</Text>
        </View>
      </SafeAreaView>
    );
}

export default Profile;