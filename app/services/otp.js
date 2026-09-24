import { supabase } from "../lib/supabase";

async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) throw error;
  return data;
}

async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });

  if (error) throw error;
  return data;
}

async function verifySignupOtp(email, token) {
  const { data: { session }, error } = await supabase.auth.verifyOtp({
    email: email,
    token: token,
    type: "signup",
  });

  if (error) throw error;
  return session;
}

async function recoveryPassword(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) throw error;
  return data;
}

async function verifyRecoveryOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email,
    token: token,
    type: "recovery",
  });

  if (error) throw error;
  return data;
}

async function resendotp(email, flowType) {
  const { data, error } = await supabase.auth.resend({
    email: email,
    type: flowType, // 'signup' | 'email_change' | 'sms' | 'phone_change'
  });

  if (error) throw error;
  return data;
}

// Aliases for compatibility with Kais's initial implementation
const verfiyRecoveryOtp = verifyRecoveryOtp;

export {
  signInWithPassword,
  signUpWithPassword,
  verifySignupOtp,
  resendotp,
  recoveryPassword,
  verifyRecoveryOtp,
  verfiyRecoveryOtp,
};

export default function () {
  return null;
}