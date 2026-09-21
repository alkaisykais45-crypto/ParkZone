import { supabase } from "../lib/supabase";

async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  })

  if (error) throw error
  return data 
}

async function verifySignupOtp(email, token) {
  const { data: { session }, error } = await supabase.auth.verifyOtp({
    email: email,
    token: token,
    type: 'signup',
  })

  if (error) throw error
  return session
}


async function recoveryPassword(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email)

  if (error) throw error
  return data
}


async function verfiyRecoveryOtp(email, token){

  const { data, error } = await supabase.auth.verifyOtp({
    email: email,
    token: token,
    type: 'recovery',
  })

  if (error) throw error
  return data
}

async function resendotp(email, flowType) {
  const { data, error } = await supabase.auth.resend({
    email: email,
    type: flowType, // 'signup' | 'email_change' | 'sms' | 'phone_change'
  })

  if (error) throw error
  return data
}


export { signUpWithPassword, verifySignupOtp, resendotp, recoveryPassword, verfiyRecoveryOtp };