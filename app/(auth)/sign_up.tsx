import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Icons } from "../../constants/icons";
import { router } from "expo-router/build/exports";
import { NumberLimit, password_regex, empty_field, email_regex } from ".././lib/auth";
import { useState } from "react";
import { signUp, checkUserExists } from ".././services/auth";



const SignUp = () =>{

    const numberError = (number: string) => NumberLimit(number);
    const emailError = (email: string) => email_regex(email);
    const emptyFieldError = (value: string) => empty_field(value);
    const passError = (password: string) => password_regex(password);

    const [phoneNumber, setPhoneNumber] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [phoneErrorMsg, setPhoneErrorMsg] = useState<string | null>(null);
    const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);
    const [passErrorMsg, setPassErrorMsg] = useState<string | null>(null);
    const [confirmPassErrorMsg, setConfirmPassErrorMsg] = useState<string | null>(null);
    const [emptyField, setEmptyField] = useState<string | null>(null);
    const [checkUserError, setCheckUserError] = useState<string | null>(null);
    const [signUpError, setSignUpError] = useState<string | null>(null);
    const [checked, setChecked] = useState(false);

    const [Successmsg, setSuccessmsg] = useState<string | null>(null);
    const [isSigningUp, setIsSigningUp] = useState(false);

    const [passwordlenght, setPasswordLength] = useState(false);


    const verficationpass=(text: string) =>{


        if ( text.length >=8  && /[A-Z]/.test(text) && /[a-z]/.test(text) && /[!@#$%^&*(),.?":{}|<>]/.test(text)) {
            setPasswordLength(true);
        } else {
            return setPasswordLength(false);
        }
    }

    const matchhandler = (pass: string, confirmPass: string) => {

            if (pass !== confirmPass) {
                setConfirmPassErrorMsg("Passwords do not match.");
            } else {
                setConfirmPassErrorMsg(null);
            }
     
        }
    

    const handleSignUp = async () => {
        if (!phoneNumber || !email || !password || !confirmPassword) {
            setEmptyField("All fields are required in order to create an account.");
            return;
        }

        if (password !== confirmPassword) {
            setConfirmPassErrorMsg("Passwords do not match.");
            return;
        }

            if(!checked){
                setSignUpError("You must agree to the terms and conditions.");
                return;
            }

             else if (checked) {
                setSignUpError(null);
            }

        try {
            setIsSigningUp(true);
            await checkUserExists(phoneNumber);
            await signUp(email, password, phoneNumber);
            setSignUpError(null);
            router.push("/(auth)/succesfully");
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Unable to create your account. Please try again.";
            setSignUpError(message);
        } finally {
            setIsSigningUp(false);
        }
    };
    return(
        <SafeAreaView className="auth-screen signup-screen">
            <ScrollView className="auth-content">

             <View className="arrow-back-container-reg">

                <TouchableOpacity onPress={() => router.back()}>
                    <Image source={Icons.arrowBack} className="arrow-back-reg" />
                </TouchableOpacity>
             </View>




                <View className="header-content">
                    <Text className="Register-account-text"> Register new Account</Text>
                </View>


                <View className="sub-text-container">


                    <Text className="sub-text">Provide details below</Text> 

                </View>


                <View className="input-fields-container">

                    <TextInput className="input-field_1" placeholder="Enter Phone Number +250" keyboardType="numeric" value={phoneNumber}
                    
                    onChangeText={(text) => {
                        setPhoneNumber(text);
                        setPhoneErrorMsg(numberError(text));
                        setEmptyField(emptyFieldError(text));
                    }}
                    />
                    <Image className="phone-icon" source={Icons.phoneIcon} />

                    <View className="field-error-container">
                        {phoneErrorMsg && <Text className="error-text">{phoneErrorMsg}</Text>}
                    </View>

                    <View className="input-wrapper">
                        <TextInput className="input-field_4" placeholder="Enter Email Address" keyboardType="email-address" value={email}
                        
                        onChangeText={(text) => {
                            setEmail(text);
                            setEmailErrorMsg(emailError(text));
                            setEmptyField(emptyFieldError(text));
                        }}
                        />
                        <Image className="email-icon-reg" source={Icons.emailIcon} />
                    </View>
                    <View className="field-error-container">
                        {emailErrorMsg && <Text className="error-text">{emailErrorMsg}</Text>}
                    </View>

                    <View className="input-wrapper">
                        <TextInput className="input-field_2" placeholder="Enter Password" secureTextEntry={true} value={password}
                        onChangeText={(text) => {
                            
                            setPassword(text);
                            setPassErrorMsg(passError(text));
                            setEmptyField(emptyFieldError(text));
                            verficationpass(text);
                        }}
                        />
                        <Image className="password-icon-reg" source={Icons.lockIcon} />
                    </View>
                    <View className="field-error-container">
                        {passErrorMsg && <Text className="error-text">{passErrorMsg}</Text>}
                    </View>


                    <View className="input-wrapper">
                    <TextInput className="input-field_3" placeholder="Confirm Password" secureTextEntry={true} value={confirmPassword}
                    onChangeText={(text) => {
                        
                        setConfirmPassword(text);
                        setEmptyField(emptyFieldError(text));
                        matchhandler(password, text);
                    }}
                    />
                    <Image className="password-icon-reg" source={Icons.lockIcon} />
                    </View>
                    <View className="field-error-container">
                        {confirmPassErrorMsg && <Text className="error-text">{confirmPassErrorMsg}</Text>}
                    </View>
                    </View>


                    <View className="verfication-container">

                        <Text className={passwordlenght ? "password-verification-text_1  text-green-500": "password-verification-text_1"}>Password must contain at least 8 characters  </Text>

                        <Text className={passwordlenght ? "password-verification-text_2 text-green-500": "password-verification-text_2"}>Password must contain at least 1 uppercase letter and lowercase</Text>
    
                        <Text className={passwordlenght ? "password-verification-text_3 text-green-500": "password-verification-text_3"}>Password must contain at least 1 special character</Text>
                          

                        </View>

                        <View className="error-field-empty-container">
                    {emptyField && <Text className="error-field">{emptyField}</Text>}
                       </View>


                     <View className="terms-and-conditions-container">
                        <Text className="terms-and-conditions-text">
                            By creating an account, you agree to our
                            <Text
                                className="terms-service-text"
                                onPress={() =>  router.push("/(auth)/terms_privacy")}
                                accessibilityRole="link"
                            > Terms of Service</Text>
                            <Text> and </Text>
                            <Text
                                className="privacy-policy-text"
                                onPress={() =>  router.push("/(auth)/terms_privacy")}
                                accessibilityRole="link"
                            >Privacy Policy</Text>
                        </Text>
                     </View>

                     <View className="check-box-container">
                         <TouchableOpacity className="check-box"
                          onPress={() => setChecked(!checked)}
                          >
                          {checked && (
                              <Image
                                  source={Icons.checkBoxCheckedIcon}
                                  className="check-box-image"
                              />
                          )}
                        </TouchableOpacity>
                     </View>


                    <View className="sign-up-button-container">

                        <TouchableOpacity className="sign-up-button" 
                        onPress={handleSignUp}
                        disabled={!checked || isSigningUp}>
                            <Text className="create-account-text">{isSigningUp ? "Creating Account..." : "Create my Account"}</Text>
                        </TouchableOpacity>

                    </View>

                     {signUpError && (
                        <View className="error-field-empty-container">
                            <Text className="error-field">{signUpError}</Text>
                        </View>
                     )}

                    <View className="back-to-login-container">
                        <TouchableOpacity onPress={() => router.push("/(auth)/sign_in")}>
                            <Text className="back-to-login-text">Back to Login</Text>
                        </TouchableOpacity>


                    </View>

            </ScrollView>
        </SafeAreaView>
    );

};


export default SignUp;

 