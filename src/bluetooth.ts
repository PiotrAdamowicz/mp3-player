// src/bluetooth.ts
import { execFile } from "node:child_process";

export interface BluetoothDevice {
    mac: string;
    name: string;
}

export interface BluetoothStatus {
    available: boolean;
    connected_device: BluetoothDevice | null;
    paired_devices: BluetoothDevice[];
}

function runBluetoothctl(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile("bluetoothctl", args, { encoding: "utf8" }, (err, stdout, stderr) => {
            if (err) {
                console.error("bluetoothctl error:", err, stderr);
                return reject(err);
            }
            resolve(stdout);
        });
    });
}

export class BluetoothManager {
    async getStatus(): Promise<BluetoothStatus> {
        const status: BluetoothStatus = {
            available: false,
            connected_device: null,
            paired_devices: [],
        };

        try {
            // Check controller
            const ctlOut = await runBluetoothctl(["show"]);
            status.available = ctlOut.includes("Controller");

            // List paired devices
            const pairedOut = await runBluetoothctl(["paired-devices"]);
            status.paired_devices = this.parseDevices(pairedOut);

            // Find connected device (simple heuristic)
            const infoPromises = status.paired_devices.map((d) =>
                runBluetoothctl(["info", d.mac])
                    .then((out) => ({ dev: d, out }))
                    .catch(() => null),
            );
            const infos = await Promise.all(infoPromises);
            for (const item of infos) {
                if (!item) continue;
                const { dev, out } = item;
                if (out.includes("Connected: yes")) {
                    status.connected_device = dev;
                    break;
                }
            }
        } catch (err) {
            console.error("Error reading Bluetooth status:", err);
        }

        return status;
    }

    async connect(mac: string): Promise<[boolean, string]> {
        try {
            const out = await runBluetoothctl(["connect", mac]);
            if (out.includes("Connection successful")) {
                return [true, "Connection successful"];
            }
            if (out.includes("Failed to connect")) {
                return [false, "Failed to connect"];
            }
            return [false, out.trim() || "Unknown error"];
        } catch (err: any) {
            return [false, err.message ?? "Error running bluetoothctl connect"];
        }
    }

    async disconnect(mac: string): Promise<[boolean, string]> {
        try {
            const out = await runBluetoothctl(["disconnect", mac]);
            if (out.includes("Successful disconnected") || out.includes("Successful disconnect")) {
                return [true, "Disconnected"];
            }
            if (out.includes("Failed to disconnect")) {
                return [false, "Failed to disconnect"];
            }
            return [false, out.trim() || "Unknown error"];
        } catch (err: any) {
            return [false, err.message ?? "Error running bluetoothctl disconnect"];
        }
    }

    private parseDevices(output: string): BluetoothDevice[] {
        const devices: BluetoothDevice[] = [];
        const lines = output.split("\n");
        for (const line of lines) {
            // Format: "Device XX:XX:XX:XX:XX:XX Name of Device"
            const m = line.match(/^Device\s+([0-9A-F:]{17})\s+(.+)$/i);
            if (m) {
                devices.push({ mac: m[1]!, name: m[2]!.trim() });
            }
        }
        return devices;
    }
}