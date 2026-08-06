// src/bluetooth.ts
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";

export interface BluetoothDevice {
    mac: string;
    name: string;
}

export interface BluetoothStatus {
    available: boolean;
    connected_device: BluetoothDevice | null;
    paired_devices: BluetoothDevice[];
}

const BLUETOOTHCTL_BIN =
    process.env.BLUETOOTHCTL_BIN || "bluetoothctl";

const BLUETOOTH_ENABLED =
    process.env.BLUETOOTH_ENABLED !== "false";

async function bluetoothctlAvailable(): Promise<boolean> {
    if (!BLUETOOTH_ENABLED) return false;

    // Absolute path case
    if (BLUETOOTHCTL_BIN.includes("/")) {
        try {
            await access(BLUETOOTHCTL_BIN);
            return true;
        } catch {
            return false;
        }
    }

    // Name-from-PATH case
    return new Promise((resolve) => {
        execFile("which", [BLUETOOTHCTL_BIN], { encoding: "utf8" }, (err, stdout) => {
            resolve(!err && stdout.trim().length > 0);
        });
    });
}

function isEnoentError(err: unknown): err is NodeJS.ErrnoException {
    return !!err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
}

function runBluetoothctl(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(BLUETOOTHCTL_BIN, args, { encoding: "utf8" }, (err, stdout, stderr) => {
            const out = stdout.trim();
            const errText = stderr.trim();

            if (err) {
                // If bluetoothctl produced usable output, keep it.
                if (out.length > 0) {
                    return resolve(out);
                }

                if (isEnoentError(err)) {
                    return reject(
                        new Error("bluetoothctl is not available in this environment")
                    );
                }

                console.error("bluetoothctl error:", err, errText);
                return reject(
                    new Error(errText || String(err))
                );
            }

            resolve(out);
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
            const available = await bluetoothctlAvailable();
            if (!available) {
                return status;
            }
            // Check controller
            const ctlOut = await runBluetoothctl(["show"]);
            status.available = ctlOut.includes("Controller");

            if (!status.available) {
                return status;
            }

            // List paired devices
            const pairedOut = await runBluetoothctl(["devices", "Paired"]);
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
            const available = await bluetoothctlAvailable();
            if (!available) {
                return [false, "Bluetooth is not available in this environment"];
            }

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
            const available = await bluetoothctlAvailable();
            if (!available) {
                return [false, "Bluetooth is not available in this environment"];
            }

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