'''
pyDrone BLE receiver — reworked from the 01Studio factory example.

Two changes, both aimed at the take-off reboot:

1. take_off() / landing() / stop() no longer run inside the BLE interrupt
   callback. They are latched as a flag and executed from the main loop.
   These calls block while the drone climbs, and blocking inside an IRQ
   starves the ESP32 task watchdog, which resets the board — the BLE link
   drops and, from the outside, nothing appears to happen.

2. Anything the callback does is wrapped, so a failure prints a traceback
   over USB serial instead of unwinding into the BLE stack and taking the
   peripheral down with it.

The per-byte debug prints are gone too: the original printed ~200 lines a
second at a 20 Hz packet rate, which is a lot of work to do in an interrupt.

Original: https://github.com/01studio-lab/pyDrone
          code/Bluetooth_Control/pyDrone/main.py
'''

import bluetooth, ble_simple_peripheral, time, sys
import drone

d = drone.DRONE(flightmode=0)

# The board only starts advertising once this passes, so a drone you can see
# over Bluetooth has already calibrated. Blue LED solid.
print('calibrating — keep it level')
while True:
    if d.read_calibrated():
        print('calibrated:', d.read_cal_data())
        break
    time.sleep_ms(100)

ble = bluetooth.BLE()
p = ble_simple_peripheral.BLESimplePeripheral(ble, name='pyDrone')

TAKEOFF, LAND, AUX, ESTOP = 24, 72, 40, 136
HOVER_CM = 120          # take_off() accepts 30–2000

pending = None          # button latched by the IRQ, run by the main loop


def on_rx(text):
    global pending
    try:
        if len(text) < 8:
            return

        # Byte 0 is a header. Sticks are bytes 1–4, buttons byte 5.
        control = [0, 0, 0, 0]
        for i in range(4):
            v = text[i + 1]
            if 100 < v < 155:
                control[i] = 0
            elif v <= 100:
                control[i] = v - 100
            else:
                control[i] = v - 155

        d.control(rol=control[0], pit=control[1], yaw=control[2], thr=control[3])

        # Latch only — running these here would block the interrupt.
        if text[5] in (TAKEOFF, LAND, ESTOP):
            pending = text[5]

        states = d.read_states()
        buf = bytearray(18)
        for i in range(9):
            raw = states[i] + 32768
            if raw < 0:
                raw = 0
            elif raw > 65535:
                raw = 65535
            buf[i * 2] = (raw >> 8) & 0xFF
            buf[i * 2 + 1] = raw & 0xFF
        p.send(bytes(buf))

    except Exception as e:
        print('on_rx failed:')
        sys.print_exception(e)


p.on_write(on_rx)

# The factory example left this loop commented out and did everything in the
# interrupt. Blocking flight commands belong here instead.
while True:
    cmd, pending = pending, None
    if cmd is not None:
        try:
            if cmd == TAKEOFF:
                print('take off ->', HOVER_CM, 'cm')
                d.take_off(distance=HOVER_CM)
                print('take off returned')
            elif cmd == LAND:
                print('land')
                d.landing()
            elif cmd == ESTOP:
                print('stop')
                d.stop()
        except Exception as e:
            print('command', cmd, 'failed:')
            sys.print_exception(e)
    time.sleep_ms(20)
