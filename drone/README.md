# Drone-side script

This is the MicroPython that runs **on the drone**, not in the browser. It is a
reworked copy of the 01Studio factory example
([`code/Bluetooth_Control/pyDrone/main.py`](https://github.com/01studio-lab/pyDrone/blob/master/code/Bluetooth_Control/pyDrone/main.py)).

## Why it exists

Measured on the hardware: sending the take-off byte (`24`) reboots the drone
**0.77 s later**, reproducibly, with **0.00 V of battery sag** — the motors are
never energised. Every other button is fine:

| Command | Battery sag | Link |
|---|---|---|
| neutral | 0.00 V | holds |
| land `72` | 0.36–0.51 V (motors run) | holds |
| aux `40` | 0.00 V | holds |
| stop `136` | 0.00 V | holds |
| **take off `24`** | **0.00 V** | **drops at +0.77 s, board reboots** |

Land spins all four motors and draws current, so the motors and their wiring
are fine. The fault is upstream of the motor output.

## What was wrong

The factory example calls `d.take_off(distance=120)` **inside the BLE interrupt
callback**, and leaves its main loop commented out — every packet is handled in
interrupt context.

`take_off()` blocks while the drone climbs to its target height. Blocking that
long inside an IRQ starves the ESP32 task watchdog, which resets the board. The
BLE link drops and, from the outside, take-off simply does nothing. `landing()`
returns quickly enough to get away with it, which is why only take-off fails.

## What changed

1. **Flight commands moved out of the interrupt.** The callback latches the
   button; the main loop runs it. This is the fix for the reboot.
2. **Exceptions print instead of killing the peripheral.** An unhandled error
   in the callback otherwise unwinds into the BLE stack, and the drone just
   vanishes with no clue why.
3. **Debug prints removed.** The original printed roughly 200 lines a second at
   a 20 Hz packet rate, all of it in interrupt context.

Behaviour is otherwise identical: same 8-byte control frame, same 18-byte
telemetry, same button codes.

## Installing it

1. Micro-USB from the drone to your computer.
2. Thonny → *Run* → *Configure interpreter* → **MicroPython (ESP32)**, pick the
   `/dev/cu.usbserial-*` (macOS) or `COM*` (Windows) port.
3. Back up the drone's existing `main.py` first — *View* → *Files*, then
   right-click → Download.
4. Upload this `main.py` to the board root.
5. Press reset. The shell prints `calibrating — keep it level`, then
   `calibrated:` once the blue LED is solid.

Keep USB attached for the first take-off attempt. If it still fails, the shell
now prints the traceback naming the failing call, instead of dropping the link.
