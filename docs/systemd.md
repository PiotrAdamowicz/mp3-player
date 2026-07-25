
# Installing and enabling the service
## On the Pi:

bash
```bash
sudo cp systemd/player.service /etc/systemd/system/player.service
sudo systemctl daemon-reload
sudo systemctl enable player.service
sudo systemctl start player.service
```
Check it’s running:

bash
```bash
sudo systemctl status player.service
sudo journalctl -u player.service -f
```
These commands follow the standard pattern for running a Node.js app as a systemd service on Linux and Raspberry Pi.