
 const NumberLimit = (number) => {

    try {
        if (number.length > 12 || number.length < 12){
            return "Phone number must be 12 digits in order to continue."
        }

        const PhoneRegex = /^[0-9]{12}$/;
        const alphabetsRegex = /[a-zA-Z]/;

        if (!PhoneRegex.test(number) || alphabetsRegex.test(number)) {
            return "Invalid phone number format. Please enter a valid phone number.";
        }
    } catch (error) {
        return "An error occurred."
    }

    return null;
 }



 const passVerfication = (password) => {


                if (password.length < 8){

                    throw new Error("Password must be at least 8 characters long.");
                }

                else if (!/[A-Z]/.test(password)) {
                    throw new Error("Password must contain at least 1 uppercase letter.");
                }
                else if (!/[a-z]/.test(password)) {
                    throw new Error("Password must contain at least 1 lowercase letter.");
                }
                else if (!/\d/.test(password)) {
                    throw new Error("Password must contain at least 1 number.");
                }
                else if (!/[@$!%*?&]/.test(password)) {
                    throw new Error("Password must contain at least 1 special character.");
                }

                  else {

                    return;
                  }

        
 }

 const otp_regex = (otp) => {

    try{
        const OtpRegex = /^[0-9]{6}$/;
        if (!OtpRegex.test(otp)) {
            return "Invalid OTP format. Please enter a 6-digit OTP.";
        }
    } catch (error) {
        return "An error occurred.";
    }
    return null;
 }



 const email_regex = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const check_special_characters = /[!#$%^&*(),?":{}|<>]/;
    const check_numbers = /^[0-9]+@/;

    try {
        if (!regex.test(email)) {
            return "Invalid email format. Please enter a valid email address";
        }

        else if (/\s/.test(email)) {
            return "Email address cannot contain spaces. Please enter a valid email address.";
        }

        else if (check_special_characters.test(email)) {
            return "Email address cannot contain special characters. Please enter a valid email address.";
        }

        else if (check_numbers.test(email)) {
            return "Email address cannot contain only numbers. Please enter a valid email address.";
        }
        return null;
    } catch (error) {
        return "An error occurred.";
    }
 }


 const empty_field = (field) => {

    try {
         if(field === null || field === undefined || field.trim() === "") {
            return "This field cannot be empty. Please enter your information.";
         }
    } catch (error) {
        return "An error occurred.";
    }
    return null;
 }

 

 const password_regex = (password) => {

    try{

     if (password.length <8 ) {

        return "Password must be at least 8 characters long.";
     }

     const PasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

      if (!PasswordRegex.test(password)) {
        return "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.";
     }

     return null;

    } catch (error) {
        return "An error occurred.";
    }
 }

 const passVerification = passVerfication;
 export { NumberLimit, email_regex, password_regex, empty_field, otp_regex, passVerfication, passVerification };

 export default function () {
   return null;
 }

