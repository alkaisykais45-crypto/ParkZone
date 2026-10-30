

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

export { calculateEvBilling };



/// Logic for calculation the spendings in this section






// Add a  screen showing userstats so we can generate for monthly spendings, daily or weekly

