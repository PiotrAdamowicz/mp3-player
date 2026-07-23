import subprocess
import shutil
import logging

logger = logging.getLogger("playerd.bluetooth")

class BluetoothManager:
    def __init__(self):
        self.bluetoothctl_cmd = shutil.which("bluetoothctl")

    def is_available(self):
        """Checks if bluetoothctl command line utility is present."""
        return self.bluetoothctl_cmd is not None

    def get_status(self):
        """Returns Bluetooth powered state, paired devices, and active audio connection info."""
        if not self.is_available():
            return {
                "available": False,
                "error": "bluetoothctl not installed",
                "connected_device": None,
                "paired_devices": []
            }

        try:
            # Query paired devices
            proc = subprocess.run([self.bluetoothctl_cmd, "devices"], capture_output=True, text=True, timeout=3)
            devices = []
            for line in proc.stdout.strip().splitlines():
                parts = line.split(" ", 2)
                if len(parts) >= 3 and parts[0] == "Device":
                    devices.append({"mac": parts[1], "name": parts[2]})

            # Query connected devices info
            info_proc = subprocess.run([self.bluetoothctl_cmd, "info"], capture_output=True, text=True, timeout=3)
            connected = None
            if "Connected: yes" in info_proc.stdout:
                mac = ""
                name = "Connected Device"
                for line in info_proc.stdout.splitlines():
                    if line.startswith("Device "):
                        parts = line.split(" ", 2)
                        if len(parts) >= 2:
                            mac = parts[1]
                        if len(parts) >= 3:
                            name = parts[2]
                    elif "Name:" in line:
                        name = line.split("Name:", 1)[1].strip()
                connected = {"mac": mac, "name": name}

            return {
                "available": True,
                "connected_device": connected,
                "paired_devices": devices
            }
        except Exception as e:
            logger.error(f"Error querying bluetooth status: {e}")
            return {
                "available": True,
                "error": str(e),
                "connected_device": None,
                "paired_devices": []
            }

    def connect(self, mac_address):
        """Attempts to connect to a Bluetooth device by MAC address."""
        if not self.is_available():
            return False, "bluetoothctl not available"

        try:
            res = subprocess.run(
                [self.bluetoothctl_cmd, "connect", mac_address],
                capture_output=True, text=True, timeout=10
            )
            if res.returncode == 0 and "Successful" in res.stdout:
                return True, f"Connected to {mac_address}"
            return False, res.stdout or "Connection failed"
        except Exception as e:
            return False, str(e)

    def disconnect(self, mac_address):
        """Disconnects a Bluetooth device by MAC address."""
        if not self.is_available():
            return False, "bluetoothctl not available"

        try:
            res = subprocess.run(
                [self.bluetoothctl_cmd, "disconnect", mac_address],
                capture_output=True, text=True, timeout=10
            )
            return res.returncode == 0, res.stdout
        except Exception as e:
            return False, str(e)
