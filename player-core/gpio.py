import logging
import config

logger = logging.getLogger("playerd.gpio")

class GPIOHandler:
    def __init__(self, callback_map=None):
        """
        callback_map: dict mapping action names ('play_pause', 'next', 'prev', 'vol_up', 'vol_down')
                      to callable functions.
        """
        self.callback_map = callback_map or {}
        self.enabled = config.GPIO_ENABLED
        self.gpio_lib = None

        if self.enabled:
            self.setup_gpio()
        else:
            logger.info("GPIO handling disabled by configuration.")

    def setup_gpio(self):
        """Attempts to load RPi.GPIO or gpiozero library and set up pin listeners."""
        try:
            import RPi.GPIO as GPIO
            self.gpio_lib = GPIO
            GPIO.setmode(GPIO.BCM)
            
            pins_actions = [
                (config.GPIO_PIN_PLAY_PAUSE, 'play_pause'),
                (config.GPIO_PIN_NEXT, 'next'),
                (config.GPIO_PIN_PREV, 'prev'),
                (config.GPIO_PIN_VOL_UP, 'vol_up'),
                (config.GPIO_PIN_VOL_DOWN, 'vol_down'),
            ]

            for pin, action in pins_actions:
                GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                GPIO.add_event_detect(
                    pin,
                    GPIO.FALLING,
                    callback=lambda p, act=action: self._handle_button(act),
                    bouncetime=250
                )
            logger.info("RPi.GPIO initialized successfully.")

        except ImportError:
            logger.warning("RPi.GPIO library not found. Running in mock/headless GPIO mode.")
        except Exception as e:
            logger.error(f"Error setting up GPIO pins: {e}")

    def _handle_button(self, action):
        logger.info(f"GPIO Event triggered: {action}")
        cb = self.callback_map.get(action)
        if cb:
            try:
                cb()
            except Exception as e:
                logger.error(f"Error in GPIO callback for {action}: {e}")

    def cleanup(self):
        if self.gpio_lib:
            try:
                self.gpio_lib.cleanup()
                logger.info("GPIO cleaned up.")
            except Exception as e:
                logger.error(f"Error during GPIO cleanup: {e}")
