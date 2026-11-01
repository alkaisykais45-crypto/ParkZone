// Bluetooth (BLE) helper for ParkZone.

import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';



let manager: BleManager | null = null;

const getManager = (): BleManager => {
    if (!manager) manager = new BleManager();
    return manager;
};



export const requestBluetoothPermissions = async (): Promise<boolean> => {


    try{

        if  (Platform.OS !== 'android') return true; //


            if (Platform.Version >=31) {

                const getPermissions = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
                ]);
                return Object.values(getPermissions).every(permission => permission === PermissionsAndroid.RESULTS.GRANTED);


                    // Android older verison
            }
            const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
            return result === PermissionsAndroid.RESULTS.GRANTED;


    } catch (error) {
         throw new Error('Error requesting Bluetooth permissions');
    
    }

}


// Scan for nearby devices  in 5 Seconds


export const nearbyDevices = async (durationMs = 5000): Promise<Device[]> => {
    if (!(await requestBluetoothPermissions())) {
        throw new Error('Bluetooth permissions not granted');
    }

    const ble = getManager();
    if ((await ble.state()) !== State.PoweredOn) {
        throw new Error('Bluetooth is turned off');
    }

    return new Promise<Device[]>((resolve, reject) => {
        const found = new Map<string, Device>();

        const timer = setTimeout(() => {
            ble.stopDeviceScan();
            resolve([...found.values()]);
        }, durationMs);

        ble.startDeviceScan(null, null, (error, device) => {
            if (error) {
                clearTimeout(timer);
                ble.stopDeviceScan();
                reject(error);
                return;
            }
            if (device) found.set(device.id, device);
        });
    });
};

export const connectToDevice = async (deviceId: string): Promise<Device> => {
    const device = await getManager().connectToDevice(deviceId, { timeout: 10000 });
    return device.discoverAllServicesAndCharacteristics();
};

export const disconnectDevice = async (deviceId: string): Promise<void> => {
    await getManager().cancelDeviceConnection(deviceId);
};

export const destroyBluetooth = (): void => {
    manager?.destroy();
    manager = null;
};