
const normalizeRwandanPhone = (raw) => {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");

  // Accept:
  // - 7XXXXXXXX   (9 digits, local without leading 0)
  // - 07XXXXXXXX  (10 digits, local with leading 0)
  // - 2507XXXXXXXX (12 digits, country code)
  if (digits.length === 9 && digits.startsWith("7")) {
    return `+250${digits}`;
  }
  if (digits.length === 10 && digits.startsWith("07")) {
    return `+250${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("2507")) {
    return `+${digits}`;
  }
  // Also allow international numbers between 10 and 15 digits
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
};

const NumberLimit = (number) => {
  try {
    if (!number || String(number).trim() === "") {
      return "Please enter your phone number.";
    }
    if (/[a-zA-Z]/.test(String(number))) {
      return "Phone number cannot contain letters.";
    }
    const normalized = normalizeRwandanPhone(number);
    if (!normalized) {
      return "Please enter a valid phone number (e.g. 078XXXXXXX or +25078XXXXXXX).";
    }
    return null;
  } catch {
    return "Invalid phone number format.";
  }
};

const passVerfication = (password) => {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must contain at least 1 uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Password must contain at least 1 lowercase letter.");
  }
  if (!/\d/.test(password)) {
    throw new Error("Password must contain at least 1 number.");
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    throw new Error("Password must contain at least 1 special character.");
  }
};

const otp_regex = (otp) => {
  try {
    const OtpRegex = /^[0-9]{6}$/;
    if (!OtpRegex.test(String(otp || "").trim())) {
      return "Invalid OTP format. Please enter a 6-digit OTP.";
    }
    return null;
  } catch {
    return "Invalid OTP format.";
  }
};

const email_regex = (email) => {
  try {
    const trimmed = String(email || "").trim();
    if (!trimmed) {
      return "Please enter your email address.";
    }
    if (/\s/.test(trimmed)) {
      return "Email address cannot contain spaces.";
    }
    const regex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!regex.test(trimmed)) {
      return "Invalid email format. Please enter a valid email address.";
    }
    return null;
  } catch {
    return "Invalid email format.";
  }
};

const empty_field = (field) => {
  try {
    if (field === null || field === undefined || String(field).trim() === "") {
      return "This field cannot be empty. Please enter your information.";
    }
    return null;
  } catch {
    return "This field cannot be empty.";
  }
};

const password_regex = (password) => {
  try {
    const val = String(password || "");
    if (val.length < 8) {
      return "Password must be at least 8 characters long.";
    }
    if (!/[A-Z]/.test(val)) {
      return "Password must contain at least 1 uppercase letter.";
    }
    if (!/[a-z]/.test(val)) {
      return "Password must contain at least 1 lowercase letter.";
    }
    if (!/\d/.test(val)) {
      return "Password must contain at least 1 number.";
    }
    if (!/[^A-Za-z0-9\s]/.test(val)) {
      return "Password must contain at least 1 special character (e.g. !@#$%^&*_-).";
    }
    return null;
  } catch {
    return "Invalid password format.";
  }
};

const passVerification = passVerfication;

export {
  normalizeRwandanPhone,
  NumberLimit,
  email_regex,
  password_regex,
  empty_field,
  otp_regex,
  passVerfication,
  passVerification,
};

export default function () {
  return null;
}

