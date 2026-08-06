// src/gpio.ts
import { Gpio } from "onoff";

import {
    PLAY_BUTTON_PIN,
    NEXT_BUTTON_PIN,
    PREV_BUTTON_PIN,
    STOP_BUTTON_PIN,
    LED_PIN,
} from "./config.js";

export type ButtonName = "play" | "next" | "prev" | "stop";
export type ButtonEvent = "press" | "release";

export type ButtonHandler = (button: ButtonName, event: ButtonEvent) => void;

const GPIO_ENABLED = process.env.GPIO_ENABLED !== "false";

export class GPIOController {
    private playButton: Gpio | null = null;
    private nextButton: Gpio | null = null;
    private prevButton: Gpio | null = null;
    private stopButton: Gpio | null = null;
    private led: Gpio | null = null;

    private handler: ButtonHandler | null = null;
    public readonly available: boolean = false;

    constructor() {
        if (!GPIO_ENABLED) {
            console.log("GPIO disabled via GPIO_ENABLED environment variable.");
            return;
        }

        if (!Gpio.accessible) {
            console.warn("GPIO is not accessible in this environment. GPIOController disabled.");
            return;
        }

        try {
            // Configure inputs with interrupt detection and simple debouncing.
            // Assumes active‑low momentary buttons (pull‑up resistor, press pulls pin to GND).
            // Adjust edge ("rising"/"both") if your wiring is different.
            this.playButton = new Gpio(PLAY_BUTTON_PIN, "in", "falling", {
                debounceTimeout: 50,
            });
            this.nextButton = new Gpio(NEXT_BUTTON_PIN, "in", "falling", {
                debounceTimeout: 50,
            });
            this.prevButton = new Gpio(PREV_BUTTON_PIN, "in", "falling", {
                debounceTimeout: 50,
            });
            this.stopButton = new Gpio(STOP_BUTTON_PIN, "in", "falling", {
                debounceTimeout: 50,
            });
            //TODO: vol_up and vol_down can be added similarly if needed.

            // Optional LED for status.
            if (typeof LED_PIN === "number") {
                this.led = new Gpio(LED_PIN, "out");
                this.led.writeSync(0); // LED off at startup
            }

            this.wireButtonEvents();
            this.available = true;
        } catch (err) {
            console.error("Failed to initialize GPIO pins:", err);
            this.close();
            this.available = false;
        }
    }

    private wireButtonEvents(): void {
        const wire = (gpio: Gpio | null, name: ButtonName) => {
            if (!gpio) return;

            gpio.watch((err, value) => {
                if (err) {
                    console.error(`GPIO error on ${name} button:`, err);
                    return;
                }

                // value === 0 when pin goes low (button pressed if active‑low)
                const event: ButtonEvent = value === 0 ? "press" : "release";

                if (this.handler) {
                    this.handler(name, event);
                }
            });
        };

        wire(this.playButton, "play");
        wire(this.nextButton, "next");
        wire(this.prevButton, "prev");
        wire(this.stopButton, "stop");
    }

    /**
     * Register a single callback for all button events.
     * The daemon can switch on button name and event type.
     */
    onButton(handler: ButtonHandler): void {
        this.handler = handler;
    }

    /**
     * Control the status LED (if configured).
     */
    setLed(on: boolean): void {
        if (!this.available || !this.led) return;
        try {
            this.led.writeSync(on ? 1 : 0);
        } catch (err) {
            console.error("Error setting LED:", err);
        }
    }

    /**
     * Clean up GPIO resources (call on shutdown).
     */
    close(): void {
        const closePin = (gpio: Gpio | null) => {
            if (!gpio) return;
            try {
                gpio.unwatchAll();
                gpio.unexport();
            } catch (err) {
                console.error("Error closing GPIO:", err);
            }
        };

        closePin(this.playButton);
        closePin(this.nextButton);
        closePin(this.prevButton);
        closePin(this.stopButton);
        closePin(this.led);

        this.playButton = null;
        this.nextButton = null;
        this.prevButton = null;
        this.stopButton = null;
        this.led = null;
    }
}