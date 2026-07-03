#!/usr/bin/env python3
import zlib
from struct import pack

def png_chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xffffffff
    return pack(">I", len(data)) + tag + data + pack(">I", crc)

def write_icon(path, size=1024):
    raw = b""
    for y in range(size):
        raw += b"\x00"
        for x in range(size):
            cx = cy = size / 2
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d > size * 0.44:
                raw += b"\x00\x00\x00\x00"
            else:
                t = d / (size * 0.44)
                r = int(8 + 26 * t)
                g = int(145 + 66 * t)
                b = int(178 + 60 * t)
                raw += bytes([r, g, b, 255])
    ihdr = pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr)
    png += png_chunk(b"IDAT", zlib.compress(raw, 9))
    png += png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)

if __name__ == "__main__":
    out = "/workspace/app-iOS/CarDiag/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
    write_icon(out)
    print("written", out)
