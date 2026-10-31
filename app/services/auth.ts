import * as Linking from "expo-linking";
import { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { normalizeRwandanPhone } from "../lib/auth";
import { sha256 } from "../lib/crypto";

/**
 * Ensures the authenticated user has a corresponding row in `public.profiles`.
 * Prevents foreign-key violations across `vehicles`, `parking_tickets`, `ev_charging_sessions`, etc.
 */
export const ensureUserProfile = async (
    user: User | null | undefined,
    extra?: { email?: string; phoneNumber?: string; fullName?: string }
) => {
    if (!user?.id) return;

    const cleanEmail = (extra?.email || user.email || "").trim().toLowerCase() || null;
    const rawPhone =
        extra?.phoneNumber ||
        user.phone ||
        (user.user_metadata?.phone_number as string | undefined) ||
        "";
    const normalizedPhone = normalizeRwandanPhone(rawPhone) || rawPhone.trim() || null;
    const cleanName =
        (extra?.fullName || (user.user_metadata?.full_name as string | undefined) || "").trim() || null;

    try {
        const { data: existing } = await supabase
            .from("profiles")
            .select("id, email, phone_number, full_name")
            .eq("id", user.id)
            .maybeSingle();

        if (existing) {
            const updates: Record<string, any> = {};
            if (!existing.email && cleanEmail) {
                updates.email = cleanEmail;
                updates.email_hash = sha256(cleanEmail);
            }
            if (!existing.phone_number && normalizedPhone) {
                updates.phone_number = normalizedPhone;
                updates.phone_hash = sha256(normalizedPhone);
            }
            if (!existing.full_name && cleanName) {
                updates.full_name = cleanName;
            }
            if (Object.keys(updates).length > 0) {
                updates.updated_at = new Date().toISOString();
                await supabase.from("profiles").update(updates).eq("id", user.id);
            }
            return;
        }

        const fullPayload: Record<string, any> = {
            id: user.id,
            email: cleanEmail,
            email_hash: cleanEmail ? sha256(cleanEmail) : null,
            phone_number: normalizedPhone,
            phone_hash: normalizedPhone ? sha256(normalizedPhone) : null,
            full_name: cleanName,
            role: "driver",
        };

        const { error } = await supabase.from("profiles").upsert(fullPayload, { onConflict: "id" });

        // Fallback if remote schema uses minimal columns
        if (error && error.code === "PGRST204") {
            await supabase
                .from("profiles")
                .upsert(
                    {
                        id: user.id,
                        email: cleanEmail,
                        phone_number: normalizedPhone,
                        full_name: cleanName,
                    },
                    { onConflict: "id" }
                );
        }
    } catch (err) {
        console.warn("ensureUserProfile warning:", err);
    }
};

export const signIn = async (identifier: string, password: string) => {
    const clean = identifier.trim();

    if (!clean || !password) {
        throw new Error("Email or phone number and password are required.");
    }

    if (clean.includes("@")) {
        const res = await supabase.auth.signInWithPassword({
            email: clean.toLowerCase(),
            password,
        });
        if (res.data?.user) {
            await ensureUserProfile(res.data.user);
        }
        return res;
    }

    const normalizedPhone = normalizeRwandanPhone(clean) || clean;

    // 1. Resolve linked account email by phone number if registered via email+phone form
    try {
        const { data: resolvedEmail, error: rpcErr } = await supabase.rpc(
            "resolve_login_email_by_phone",
            { p_phone: normalizedPhone }
        );
        if (!rpcErr && resolvedEmail && typeof resolvedEmail === "string") {
            const emailRes = await supabase.auth.signInWithPassword({
                email: resolvedEmail.trim().toLowerCase(),
                password,
            });
            if (emailRes.data?.user) {
                await ensureUserProfile(emailRes.data.user);
            }
            return emailRes;
        }
    } catch {
        // Continue to direct phone auth fallback
    }

    // 2. Fallback to native Supabase phone+password authentication
    const phoneRes = await supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password,
    });
    if (phoneRes.data?.user) {
        await ensureUserProfile(phoneRes.data.user);
    }
    return phoneRes;
};

export const signInWithOAuthProvider = async (provider: "google" | "apple") => {
    const redirectTo = Linking.createURL("/(tabs)/home");
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo,
            skipBrowserRedirect: true,
        },
    });

    if (error) {
        throw new Error(error.message);
    }

    if (data?.url) {
        await Linking.openURL(data.url);
    }
    return data;
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
        }
        return data;
    } catch (err) {
        console.warn("Could not send welcome email:", err);
    }
};

export const signUp = async (
    email: string,
    password: string,
    phoneNumber?: string,
    fullName?: string
) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
        throw new Error("Email and password are required.");
    }

    const normalizedPhone = phoneNumber ? normalizeRwandanPhone(phoneNumber) || phoneNumber.trim() : null;
    const cleanName = fullName?.trim() || null;

    const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
            data: {
                phone_number: normalizedPhone,
                full_name: cleanName,
            },
        },
    });

    if (error) {
        if (error.message.toLowerCase().includes("confirmation email")) {
            throw new Error(
                "Could not send confirmation email. Please try again later or contact support."
            );
        }
        throw new Error(error.message);
    }

    if (!data.user) {
        throw new Error("Account creation did not return a user.");
    }

    // Supabase returns an obfuscated user with empty identities[] when email already exists
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error("An account with this email address already exists. Please sign in instead.");
    }

    if (data.session) {
        await ensureUserProfile(data.user, {
            email: normalizedEmail,
            phoneNumber: normalizedPhone || undefined,
            fullName: cleanName || undefined,
        });
    }

    sendWelcomeEmail(normalizedEmail, cleanName || undefined).catch((err) => {
        console.warn("Failed to dispatch welcome email in background:", err);
    });

    return {
        user: data.user,
        session: data.session,
        requiresEmailConfirmation: !data.session,
    };
};

export const verifyEmailSignupOtp = async (email: string, token: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.trim();

    if (!normalizedEmail || !normalizedToken) {
        throw new Error("Email and 6-digit verification code are required.");
    }

    const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: "signup",
    });

    if (error) {
        throw new Error(error.message || "Invalid or expired verification code.");
    }

    if (data.user) {
        await ensureUserProfile(data.user, { email: normalizedEmail });
    }

    return data;
};

export const resendSignupOtp = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
    });
    if (error) {
        throw new Error(error.message || "Could not resend verification code.");
    }
};

export const checkUserExists = async (phoneNumber: string) => {
    const normalized = normalizeRwandanPhone(phoneNumber);
    if (!normalized) {
        return false;
    }

    // Try privacy-safe SECURITY DEFINER RPC first
    try {
        const { data: available, error: rpcErr } = await supabase.rpc("check_phone_available", {
            p_phone: normalized,
        });
        if (!rpcErr && typeof available === "boolean") {
            if (!available) {
                throw new Error(
                    "An account with this phone number already exists. Please sign in or use a different phone number."
                );
            }
            return false;
        }
    } catch (e: any) {
        if (e?.message?.includes("already exists")) {
            throw e;
        }
    }

    // Fallback direct query; ignore RLS/missing-table errors so registration is never blocked
    const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", normalized)
        .limit(1);

    if (!error && data && data.length > 0) {
        throw new Error(
            "An account with this phone number already exists. Please sign in or use a different phone number."
        );
    }

    return false;
};

export const sendPasswordResetOtp = async (identifier: string) => {
    const raw = identifier.trim();
    if (!raw) {
        throw new Error("Email or phone number is required.");
    }

    let normalizedEmail = raw.toLowerCase();
    if (!raw.includes("@")) {
        const normalizedPhone = normalizeRwandanPhone(raw) || raw;
        const { data: resolvedEmail } = await supabase.rpc("resolve_login_email_by_phone", {
            p_phone: normalizedPhone,
        });
        if (!resolvedEmail || typeof resolvedEmail !== "string") {
            throw new Error("Please enter your registered email address to receive a recovery code.");
        }
        normalizedEmail = resolvedEmail.trim().toLowerCase();
    }

    try {
        const { data, error } = await supabase.functions.invoke("send-otp-email", {
            body: { email: normalizedEmail, type: "recovery" },
        });

        if (!error && data?.success) {
            return {
                success: true,
                email: normalizedEmail,
                message: data.message || "Verification code sent to your email.",
            };
        }

        if (error && error.message && !error.message.includes("FunctionsFetchError")) {
            console.warn("Edge function returned error, falling back to auth mailer:", error.message);
        }
    } catch (invokeError) {
        console.warn("Edge function invocation error, falling back to auth service:", invokeError);
    }

    const { error: fallbackError } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
    if (fallbackError) {
        throw new Error(
            fallbackError.message || "Failed to send verification code. Please try again later."
        );
    }

    return {
        success: true,
        email: normalizedEmail,
        message: "Verification code sent to your email.",
    };
};

export const verifyRecoveryOtp = async (identifier: string, token: string) => {
    const raw = identifier.trim();
    const normalizedToken = token.trim();

    if (!raw || !normalizedToken) {
        throw new Error("Email and OTP code are required.");
    }

    let normalizedEmail = raw.toLowerCase();
    if (!raw.includes("@")) {
        const normalizedPhone = normalizeRwandanPhone(raw) || raw;
        const { data: resolvedEmail } = await supabase.rpc("resolve_login_email_by_phone", {
            p_phone: normalizedPhone,
        });
        if (resolvedEmail && typeof resolvedEmail === "string") {
            normalizedEmail = resolvedEmail.trim().toLowerCase();
        }
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

export const signOut = async () => {
    return supabase.auth.signOut();
};

export default function () {
    return null;
}


