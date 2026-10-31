/**
 * Bay Policy — single source of truth separating PARKING from EV CHARGING.
 *
 * Rules:
 *  - Regular / accessible bays           → "parking"  (hourly parking tariff, parking_tickets)
 *  - EV bay + electric vehicle           → "charging" (flat EV charging tariff, ev_charging_sessions, 0 RWF parking)
 *  - EV bay + NON-electric vehicle       → "parking"  + 5,000 RWF fine (unauthorized_ev)
 *  - Accessible bay + no handicap permit → "parking"  + 10,000 RWF fine (unauthorized_handicap)
 */

export type BayKind = "parking" | "charging";
export type BaySpaceType = "regular" | "ev" | "handicap";
export type FineReasonCode = "unauthorized_ev" | "unauthorized_handicap";

export const EV_BAY_FINE_RWF = 5000;
export const ACCESSIBLE_BAY_FINE_RWF = 10000;

export interface BayAccessDecision {
    /** Which flow handles this booking */
    kind: BayKind;
    /** Bay is designated for EV charging (regardless of who uses it) */
    isEvBay: boolean;
    isAccessibleBay: boolean;
    /** True when the driver may use the bay without penalty */
    allowed: boolean;
    fineRwf: number;
    fineReasonCode: FineReasonCode | null;
    fineLabel: string;
    warning: string | null;
}

export function resolveBaySpaceType(
    spaceType?: string | null,
    opts?: { isEvLocation?: boolean; isAccessibleLocation?: boolean }
): BaySpaceType {
    if (spaceType === "ev" || spaceType === "handicap" || spaceType === "regular") {
        return spaceType;
    }
    if (opts?.isEvLocation) return "ev";
    if (opts?.isAccessibleLocation) return "handicap";
    return "regular";
}

export function evaluateBayAccess(params: {
    spaceType?: string | null;
    isEvVehicle: boolean;
    isHandicapVehicle: boolean;
    isEvLocation?: boolean;
    isAccessibleLocation?: boolean;
}): BayAccessDecision {
    const type = resolveBaySpaceType(params.spaceType, {
        isEvLocation: params.isEvLocation,
        isAccessibleLocation: params.isAccessibleLocation,
    });

    if (type === "ev") {
        if (params.isEvVehicle) {
            return {
                kind: "charging",
                isEvBay: true,
                isAccessibleBay: false,
                allowed: true,
                fineRwf: 0,
                fineReasonCode: null,
                fineLabel: "",
                warning: null,
            };
        }
        return {
            kind: "parking",
            isEvBay: true,
            isAccessibleBay: false,
            allowed: false,
            fineRwf: EV_BAY_FINE_RWF,
            fineReasonCode: "unauthorized_ev",
            fineLabel: "Non-EV parked in EV charging bay",
            warning: `This bay is reserved for electric vehicles that are charging. Parking a non-electric vehicle here incurs a ${EV_BAY_FINE_RWF.toLocaleString()} RWF fine.`,
        };
    }

    if (type === "handicap" && !params.isHandicapVehicle) {
        return {
            kind: "parking",
            isEvBay: false,
            isAccessibleBay: true,
            allowed: false,
            fineRwf: ACCESSIBLE_BAY_FINE_RWF,
            fineReasonCode: "unauthorized_handicap",
            fineLabel: "Vehicle without permit in accessible bay",
            warning: `This bay is reserved for handicap permit holders. Unauthorized parking incurs a ${ACCESSIBLE_BAY_FINE_RWF.toLocaleString()} RWF fine.`,
        };
    }

    return {
        kind: "parking",
        isEvBay: false,
        isAccessibleBay: type === "handicap",
        allowed: true,
        fineRwf: 0,
        fineReasonCode: null,
        fineLabel: "",
        warning: null,
    };
}

export default function () {
    return null;
}

