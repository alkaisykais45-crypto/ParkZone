import { Alert } from "react-native";
import { supabase } from "../lib/supabase";

export const signIn = async (phoneNumber: string, password: string) => {
    const normalizedPhoneNumber = phoneNumber.trim();

    if (!normalizedPhoneNumber || !password) {
        throw new Error("Phone number and password are required");
    }

    return supabase.auth.signInWithPassword({
        phone: normalizedPhoneNumber,
        password,
    });
};


export const sendWelcomeEmail = async (email: string, name?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    try {
        const { data, error } = await supabase.functions.invoke("send-otp-email", {
            body: {
                email: normalizedEmail,
                type: "welcome",
                name: name?.trim() || undefined,
            },
        });

        if (error) {
            console.warn("Welcome email dispatch warning:", error.message);
        } else {
            console.log("Welcome email sent successfully to:", normalizedEmail);
        }
        return data;
    } catch (err) {
        console.warn("Could not send welcome email:", err);
    }
};

export const signUp = async (email: string, password: string, phoneNumber?: string, fullName?: string) => {
    if (!email.trim() || !password) {
        throw new Error("Email and password are required");
    }

    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
            data: {
                phone_number: phoneNumber?.trim() || null,
                full_name: fullName?.trim() || null,
            },
        },
    });

    if (error) {
        if (error.message.toLowerCase().includes("confirmation email")) {
            throw new Error("We could not send the confirmation email");
        }
        throw new Error(error.message);
    }

    if (!data.user) {
        throw new Error("Account creation did not return a user.");
    }

    // Trigger welcome email in the background without blocking registration
    sendWelcomeEmail(email.trim(), fullName?.trim()).catch((err) => {
        console.warn("Failed to dispatch welcome email in background:", err);
    });

    return data;
};

export const checkUserExists = async (phoneNumber: string) => {
    const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", phoneNumber.trim())
        .limit(1);

    if (error) {
        throw new Error("Error checking user. Please try again later.");
    }

    if (data && data.length > 0) {
        throw new Error("User with this phone number already exists. Please use a different phone number.");
    }

    return false;
};


export const sendPasswordResetOtp = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
        throw new Error("Email is required");
    }

    try {
        // 1. Try invoking the Resend Edge Function
        const { data, error } = await supabase.functions.invoke("send-otp-email", {
            body: { email: normalizedEmail, type: "recovery" },
        });

        if (!error && data?.success) {
            return {
                success: true,
                message: data.message || "Verification code sent to your email.",
            };
        }

        if (error && error.message && !error.message.includes("FunctionsFetchError")) {
            console.warn("Edge function returned error, falling back to auth mailer:", error.message);
        }
    } catch (invokeError) {
        console.warn("Edge function invocation error, falling back to Supabase Auth:", invokeError);
    }

    // 2. Fallback to Supabase built-in auth resetPasswordForEmail
    const { error: fallbackError } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
    if (fallbackError) {
        throw new Error(fallbackError.message || "Failed to send verification code. Please try again later.");
    }

    return {
        success: true,
        message: "Verification code sent to your email.",
    };
};


export const verifyRecoveryOtp = async (email: string, token: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.trim();

    if (!normalizedEmail || !normalizedToken) {
        throw new Error("Email and OTP code are required.");
    }

    const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: "recovery",
    });

    if (error) {
        throw new Error(error.message || "Invalid or expired verification code.");
    }

    return data;
};



export const updatePassword = async (newPassword: string) => {
    if (!newPassword || newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters long.");
    }

    const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
    });

    if (error) {
        throw new Error(error.message || "Failed to update password.");
    }

    return data;
};

export default function () {
    return null;
}

