"""Generate the app's original geometric monogram icons with only stdlib."""
import math
import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'icons'

def pixel(x, y, maskable):
    bg = (36, 75, 60)
    white = (249, 248, 242)
    lime = (220, 235, 184)
    # Keep the foreground within the central maskable safe zone.
    if maskable:
        x, y = (x - 256) / .78 + 256, (y - 256) / .78 + 256
    if (x - 360) ** 2 + (y - 145) ** 2 < 26 ** 2:
        return lime
    ring = 52 ** 2 < (x-225) ** 2 + (y-235) ** 2 < 104 ** 2
    stem = 277 < x < 329 and 135 < y < 330
    tail = y > 327 and 55 ** 2 < (x-225) ** 2 + (y-328) ** 2 < 104 ** 2
    return white if ring or stem or tail else bg

def render(size, name, maskable=False):
    scanlines = bytearray()
    for y in range(size):
        scanlines.append(0)
        for x in range(size):
            samples = [pixel((x+(sx+.5)/2)*512/size, (y+(sy+.5)/2)*512/size, maskable) for sy in range(2) for sx in range(2)]
            scanlines.extend(sum(s[c] for s in samples)//4 for c in range(3))
    def chunk(kind, content):
        return struct.pack('!I', len(content)) + kind + content + struct.pack('!I', zlib.crc32(kind+content) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size,size,8,2,0,0,0)) + chunk(b'IDAT', zlib.compress(scanlines)) + chunk(b'IEND', b'')
    (ROOT/name).write_bytes(png)

ROOT.mkdir(parents=True, exist_ok=True)
render(192, 'icon-192.png')
render(512, 'icon-512.png')
render(512, 'maskable-512.png', True)
print('Generated 192px, 512px and maskable app icons.')
