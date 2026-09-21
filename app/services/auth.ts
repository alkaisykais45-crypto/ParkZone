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


export const signUp = async (email: string, password: string , phoneNumber?: string) => {
    if (!email.trim() || !password) {
        throw new Error("Email and password are required");
    }

    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
            data: {
                phone_number: phoneNumber?.trim() || null,
            },

           
        },
    })
    if (error) {
        if (error.message.toLowerCase().includes("confirmation email")) {
            throw new Error(
                "We could not send the confirmation email"
            );
        }

        throw new Error(error.message);
    }

    if (!data.user) {
        throw new Error("Account creation did not return a user.");
    }


    return data;

};


export const checkUserExists = async (phoneNumber: string)=>{

    const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", phoneNumber.trim())
        .limit(1);

    if (error) {
        throw new Error("Error checking user. Please try again later.");
    }

    if (data.length > 0) {
        throw new Error("User with this phone number already exists. Please use a different phone number.");
    }

    return false;

}