

// Definiton of EV Billing Structure

type EvBilling = {
    energyCost: number;
    taxAmount: number;

    taxRate: number;
    ratePerKwh: number;
    parkingFee: number;
    totalCost: number;
    currency: string;
 
}




// Function for doing the calculation of the EV Billing


const  calculateEvBilling = (taxRate: number, ratePerKwh: number, parkingFee: number, kwhUsed: number, currency: string): EvBilling => {

    
    const energyCost = ratePerKwh * kwhUsed;
    const taxAmount = energyCost * taxRate;
    const totalCost = energyCost + taxAmount + parkingFee;

    return {
        taxRate,
        ratePerKwh,
        parkingFee,
        totalCost,
        currency,
        energyCost,
        taxAmount
    };


    };




    
/// Logic for calculation the spendings in this section


const calculateEnergySpendings = (ratePerKwh: number, kwhUsed: number, period: 'daily' | 'weekly' | 'monthly' | 'yearly'): number => {

    switch(period){
        case 'daily':
            return ratePerKwh * kwhUsed;
        case 'weekly':
            return ratePerKwh * kwhUsed * 7;
        case 'monthly':
            return ratePerKwh * kwhUsed * 30;

        
        case 'yearly':
            return ratePerKwh * kwhUsed * 365;
        default:
            throw new Error('Invalid period. Please try again later');
    }
}



const calculateParkingSpendings = (parkingFee: number, period: 'daily' | 'weekly' | 'monthly' | 'yearly'): number => {


    switch(period){

        case 'daily':
            return parkingFee;
        case 'weekly':
            return parkingFee * 7;
        case 'monthly':
            return parkingFee * 30;
        case 'yearly':
            return parkingFee * 365;
        default:
            throw new Error('Invalid period. Please try again later');


    }



}






export { calculateEvBilling, calculateEnergySpendings, calculateParkingSpendings };

export default function () {
    return null;
}










