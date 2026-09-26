import { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Image, TouchableOpacity, Modal, NativeSyntheticEvent, TextInputKeyPressEventData } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icons } from "../../constants/icons";
import { router } from "expo-router";
import { empty_field, email_regex, otp_regex } from "../lib/auth";
import { sendPasswordResetOtp, verifyRecoveryOtp } from "../services/auth";

const ForgotPassword = () => {
        const [email, setEmail] = useState("");
        const [otpErrorMsg, setOtpErrorMsg] = useState<string | null>(null);
        const [errorMsg, setErrorMsg] = useState<string | null>(null);
        const [isLoading, setIsLoading] = useState(false);

        const [recoverySuccess, setRecoverySuccess] = useState(false);
        const [Recoverymsg, setRecoverymsg] = useState<string | null>(null);

        const emailError = (email: string) => email_regex(email);
        const emptyFieldError = (value: string) => empty_field(value);

        const [showModal, setShowModal] = useState(false);
        const [otp, setOtp] = useState(["", "", "", "", "", ""]);
        const inputRefs = useRef<Array<TextInput | null>>([]);

        const MAX_ATTEMPTS = 3;

        const RESEND_ATTEMPTS = 2;

        const LOCK_DURATION = 3 * 60 * 1000;

        const [lockUntil, setLockUntil] = useState<number | null>(null);

        const [secondsLeft, setSecondsLeft] = useState(0);

        const isActive = lockUntil !== null && Date.now() < lockUntil;

        const [attempts, setAttempts] = useState(0);

        const [isLocked, setIsLocked] = useState(false);


        const digitClasses = [
                "first-digit",
                "second-digit",
                "third-digit",
                "fourth-digit",
                "fifth-digit",
                "sixth-digit"
        ];

        useEffect(() => {
                if (!lockUntil) {
                        return;
                }

                let timeoutId: ReturnType<typeof setTimeout>;

                const updateTimer = () => {
                        const remainingSeconds = Math.max(
                                0,
                                Math.ceil((lockUntil - Date.now()) / 1000)
                        );

                        setSecondsLeft(remainingSeconds);

                        if (remainingSeconds <= 0) {
                                setIsLocked(false);
                                setLockUntil(null);
                                setAttempts(0);
                                setOtpErrorMsg(null);
                                return;
                        }

                        setIsLocked(true);
                        timeoutId = setTimeout(updateTimer, 1000);
                };

                updateTimer();

                return () => clearTimeout(timeoutId);
        }, [lockUntil]);



        const handleChangeText = (text: string, index: number) => {
                const digits = text.replace(/\D/g, "");
                const newOtp = [...otp];

                if (digits.length > 1) {
                        digits.slice(0, 6 - index).split("").forEach((digit, offset) => {
                                newOtp[index + offset] = digit;
                        });
                        setOtp(newOtp);
                        inputRefs.current[Math.min(index + digits.length, 5)]?.focus();
                        return;
                }

                newOtp[index] = digits;
                setOtp(newOtp);
                if (digits && index < 5) {
                        inputRefs.current[index + 1]?.focus();
                }
        };

        const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
                if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
                        inputRefs.current[index - 1]?.focus();
                }
        };

        const getErrors = (value: string) => {
                const emptyErr = emptyFieldError(value);

                if (emptyErr) {
                        return emptyErr;
                }

                return emailError(value);
        };

        const getOtpErrors = (otp: string[]) => {
                const otpCode = otp.join("");

                if (otpCode.length !== 6) {
                        return "Please fill all OTP fields";
                }

                return otp_regex(otpCode);
        };


        const handleResend = async () => {
                if (attempts >= RESEND_ATTEMPTS) {
                        setOtpErrorMsg("You have reached the maximum resend attempts");
                        return;
                }

                setIsLoading(true);
                setOtpErrorMsg(null);
                try {
                        const res = await sendPasswordResetOtp(email.trim());
                        setRecoverymsg(res.message || "OTP has been successfully sent to your email");
                        setAttempts((currentAttempts) => currentAttempts + 1);
                } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : "Failed to resend OTP. Please try again later.";
                        setOtpErrorMsg(message);
                } finally {
                        setIsLoading(false);
                }
        };

        const handleVerfiy = async () => {
                const validationError = getOtpErrors(otp);
                if (validationError) {
                        setOtpErrorMsg(validationError);
                        return;
                }

                if (isLocked) {
                        setOtpErrorMsg("Maximum attempts reached. Wait for 3 minutes");
                        return;
                }

                setIsLoading(true);
                setOtpErrorMsg(null);

                try {
                        const otpCode = otp.join("");
                        await verifyRecoveryOtp(email.trim(), otpCode);
                        setAttempts(0);
                        setOtpErrorMsg(null);
                        setShowModal(false);
                        router.replace("/(auth)/new_pass");
                } catch (err: unknown) {
                        const nextAttempts = attempts + 1;
                        setAttempts(nextAttempts);

                        if (nextAttempts >= MAX_ATTEMPTS) {
                                setIsLocked(true);
                                setLockUntil(Date.now() + LOCK_DURATION);
                                setOtpErrorMsg("Maximum attempts reached. Wait for 3 minutes");
                                return;
                        }

                        const message = err instanceof Error ? err.message : `Incorrect or expired code. ${MAX_ATTEMPTS - nextAttempts} attempt(s) left.`;
                        setOtpErrorMsg(message);
                } finally {
                        setIsLoading(false);
                }
        };

        const handleSubmit = async () => {
                const error = getErrors(email);

                if (error) {
                        setErrorMsg(error);
                        return;
                }

                setIsLoading(true);
                setErrorMsg(null);

                try {
                        const res = await sendPasswordResetOtp(email.trim());
                        setErrorMsg(null);
                        setRecoverymsg(res.message || "OTP has been successfully sent to your email");
                        setShowModal(true);
                } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : "Failed to send recovery code. Please try again later.";
                        setErrorMsg(message);
                } finally {
                        setIsLoading(false);
                }
        };


        return (
                <SafeAreaView className="auth-screen forgot-password-screen">

                        <View className="auth-content">



                                <View className="forgot-password-page-container">

                                        <Text className="forgot-password-title">
                                                Did you forget password?
                                        </Text>

                                        <View className="forgot-password-subtext-container">

                                                <Text className="forgot-password-subtext">
                                                        Enter your email to receive a verification code with 6 digits.
                                                </Text>
                                        </View>
                                </View>

                                <View className="arrow-back">

                                        <TouchableOpacity onPress={() => router.back()}>
                                                <Image className="arrow-icon" source={Icons.arrowBack} />

                                        </TouchableOpacity>
                                </View>

                                <View className="forgot-password-action-container">

                                        <Text className="forgot-password-action-text">
                                                Enter email
                                        </Text>

                                        <TextInput
                                                className="forgot-password-input"
                                                placeholder="Enter your email"
                                                keyboardType="email-address"
                                                value={email}
                                                onChangeText={(text) => {
                                                        setEmail(text);
                                                        setErrorMsg(getErrors(text));
                                                }}
                                        />

                                        <Image className="email-icon" source={Icons.emailIcon} />
                                </View>

                                {Recoverymsg && (
                                        <Text className="success-text">
                                                {Recoverymsg}
                                        </Text>
                                )}

                                {errorMsg && (
                                        <Text className="error-text">
                                                {errorMsg}
                                        </Text>
                                )}




                                <View className="forgot-password-submit-container">

                                        <TouchableOpacity
                                                className="forgot-password-submit-button"
                                                onPress={handleSubmit}
                                                disabled={isLoading}
                                        >
                                                <Text className="forgot-password-submit-button-text">
                                                        {isLoading ? "Submitting..." : "Submit"}
                                                </Text>
                                        </TouchableOpacity>



                                        <Modal
                                                visible={showModal}
                                                transparent={true}
                                                animationType="slide"
                                                onRequestClose={() => setShowModal(false)}
                                        >
                                                <View className="modal-overlay">
                                                        <View className="bottom-sheet">
                                                                <TouchableOpacity
                                                                        className="modal-close-button"
                                                                        onPress={() => setShowModal(false)}
                                                                >
                                                                        <Text className="modal-close-text">
                                                                                Close
                                                                        </Text>
                                                                </TouchableOpacity>

                                                                <View className="inner-circle">

                                                                        <View className="lock-icon-containers">
                                                                                <Image source={Icons.lockIcon} className="lock-icons" />
                                                                        </View>

                                                                </View>

                                                                <Text className="modal-title">
                                                                        Enter your verification code
                                                                </Text>
                                                                <Text className="modal-message">
                                                                        Check your email for the 6-digits verification code.
                                                                </Text>


                                                                <View className="verfication-otp-container">
                                                                        {otp.map((digit, index) => (
                                                                                <TextInput
                                                                                        key={index}
                                                                                        ref={(ref) => { inputRefs.current[index] = ref; }}
                                                                                        className={digitClasses[index]}
                                                                                        keyboardType="numeric"
                                                                                        maxLength={index === 0 ? 6 : 1}
                                                                                        value={digit}
                                                                                        onChangeText={(text) => handleChangeText(text, index)}
                                                                                        onKeyPress={(e) => handleKeyPress(e, index)}




                                                                                />
                                                                        ))}
                                                                </View>


                                                                <View className="verfiy-container-button">

                                                                        <TouchableOpacity className="verfiy-button"
                                                                                onPress={handleVerfiy}
                                                                                disabled={isLocked || isLoading}
                                                                        >
                                                                                <Text className="verfiy-text">
                                                                                        {isLoading ? "Verifying..." : "Verify"}
                                                                                </Text>

                                                                        </TouchableOpacity>

                                                                </View>

                                                                {otpErrorMsg && (
                                                                        <Text className="error-text-otp">{otpErrorMsg}</Text>
                                                                )}

                                                                {isLocked && (
                                                                        <Text className="error-text-otp">
                                                                                Maximum attempts reached. Try again in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}.
                                                                        </Text>
                                                                )}



                                                                <View className="or-container">

                                                                        <Text className="or-text-password">OR</Text>
                                                                </View>

                                                                <View className="underline-text">
                                                                </View>



                                                                <TouchableOpacity className="resend-button"
                                                                        onPress={handleResend}
                                                                        disabled={isLoading || isLocked}
                                                                >
                                                                        <Text className="resend-text">
                                                                                {isLoading ? "Sending..." : "Resend"}
                                                                        </Text>
                                                                </TouchableOpacity>



                                                        </View>
                                                </View>
                                        </Modal>

                                </View>




                        </View>
                </SafeAreaView>

        );

};

export default ForgotPassword;

