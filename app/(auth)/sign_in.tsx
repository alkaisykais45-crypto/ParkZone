import { Text, TextInput, TouchableOpacity, View, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icons } from "../../constants/icons";
import { router } from "expo-router/build/exports";
import { NumberLimit, password_regex, empty_field } from ".././lib/auth";
import { useState } from "react";




 const SignIn = () => {

    const numberError = (number: string) => NumberLimit(number);
    const [password, setPassword] = useState("");
    const passError = (password: string) => password_regex(password);
    
    const emptyFieldError = (value: string) => empty_field(value);
    const [emptyField, setEmptyField] = useState<string | null>(null);

    const [phoneNumber, setPhoneNumber] = useState("");
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

      
     const  handleSignIn =() => {

          if (!phoneNumber || !password) {
              setEmptyField("Please fill in all required fields.");
              return;
  
          }
     }


   return (
     <SafeAreaView className="auth-screen">
       <View className="auth-content">

        <View className="logo-container">
        <Image source={Icons.logoImg} className="logo-img" />
        </View>

            <View className="auth-header">
        <Text className="Welcome-text"> Welcome to ParkZone</Text>
        <Text className="sub-text"> Sign in to your ParkZone account</Text>

            </View>
                
                <Text className="label-phone">Phone Number</Text>
                <View className="input-wrapper">
                  <TextInput className="input-field" placeholder="Enter Phone Number +250" keyboardType="numeric" value={phoneNumber}
                   onChangeText={(text) => {
                    setPhoneNumber(text);
                    setPhoneError(numberError(text));
                    setEmptyField(emptyFieldError(text));

                   }}                     />
                    {phoneError && <Text className="error-text">{phoneError}</Text>}
                    {emptyField && <Text className="error-text">{emptyField}</Text>}

                  <Image source={Icons.phoneIcon} className="phone-icon" />

                </View>

                <Text className="label-password">Password</Text>
                <View className="input-wrapper">
                  <TextInput className="input-field" placeholder="Enter Password" secureTextEntry={true} value={password}
                   onChangeText={(text) => {
                    setPassword(text);
                    setPasswordError(passError(text));
                    setEmptyField(emptyFieldError(text));
                   }} />
                    {passwordError && <Text className="error-text">{passwordError}</Text>}
                    {emptyField && <Text className="error-text">{emptyField}</Text>}    
                  <Image source={Icons.lockIcon} className="lock-icon" />
                </View>
            
                </View>
  

                
                <View className="forgot-password-container">
                    <TouchableOpacity onPress={() => router.push("/(auth)/forgot_pass")}>
                 <Text className="forgot-password-text">Forgot Password?</Text>
                    </TouchableOpacity>
                   
                </View>

      



                 <View className="sign-up-container">

                  <TouchableOpacity onPress={() => router.push("/(auth)/sign_up")}>
                    <Text className="sign-up-text">Register new Account?</Text>
                  </TouchableOpacity>
                 </View>


                        <View className="sign-in-button-container">        
                 <TouchableOpacity className="sign-in-button"
                    onPress={handleSignIn}>
                    <Text className="sign-in-text"> Sign In</Text
                    
                    >
                 </TouchableOpacity>
                        </View>


                        <View className="empty-field-error-container">
                        </View>



                      <View className="OR-inputs"> 

                          <Text className="or-text">OR</Text>

                          <View className="divider-line">

                            <View className="social-icons-container">


                              <TouchableOpacity>
                                <Image source={Icons.googleIcon} className="google-icon" />
                              </TouchableOpacity>

                              <TouchableOpacity>
                                <Image source={Icons.facebookIcon} className="facebook-icon" />
                              </TouchableOpacity>



                            </View>



                          </View>


                      </View>

     </SafeAreaView>
   );
 };

 export default SignIn;




