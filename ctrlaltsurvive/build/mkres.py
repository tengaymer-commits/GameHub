"""Writes a COFF resource object (.syso) holding an app icon, for the Go linker.
usage: python3 mkres.py out.syso icon256.png icon48.png icon32.png icon16.png
Each PNG is stored as its own RT_ICON entry (PNG icons are valid since Windows Vista)."""
import struct, sys

def build(pngs):
    images = [open(p, 'rb').read() for p in pngs]
    sizes = [struct.unpack('>II', d[16:24]) for d in images]  # PNG IHDR width/height
    grp = struct.pack('<HHH', 0, 1, len(images))
    for i, (d, (w, h)) in enumerate(zip(images, sizes)):
        grp += struct.pack('<BBBBHHIH', w % 256, h % 256, 0, 0, 1, 32, len(d), i + 1)

    # resource tree layout: root -> {3: icons, 14: group} -> ids -> lang 0x409 -> data entry
    leaves = [(3, i + 1, d) for i, d in enumerate(images)] + [(14, 1, grp)]
    types = [3, 14]
    def dir_hdr(n): return struct.pack('<IIHHHH', 0, 0, 0, 0, 0, n)
    # sizes: dir header 16, entry 8, data entry 16
    root_sz = 16 + 8 * len(types)
    type_dirs = {t: [l for l in leaves if l[0] == t] for t in types}
    off = root_sz
    type_off = {}
    for t in types:
        type_off[t] = off; off += 16 + 8 * len(type_dirs[t])
    lang_off = {}
    for l in leaves:
        lang_off[(l[0], l[1])] = off; off += 16 + 8
    data_entry_off = {}
    for l in leaves:
        data_entry_off[(l[0], l[1])] = off; off += 16
    blob_off = {}
    for l in leaves:
        off = (off + 7) & ~7
        blob_off[(l[0], l[1])] = off; off += len(l[2])
    total = (off + 7) & ~7

    buf = bytearray(total)
    def put(o, b): buf[o:o + len(b)] = b
    put(0, dir_hdr(len(types)) + b''.join(struct.pack('<II', t, 0x80000000 | type_off[t]) for t in types))
    for t in types:
        ents = type_dirs[t]
        put(type_off[t], dir_hdr(len(ents)) + b''.join(struct.pack('<II', l[1], 0x80000000 | lang_off[(t, l[1])]) for l in ents))
    relocs = []
    for l in leaves:
        k = (l[0], l[1])
        put(lang_off[k], dir_hdr(1) + struct.pack('<II', 0x409, data_entry_off[k]))
        put(data_entry_off[k], struct.pack('<IIII', blob_off[k], len(l[2]), 0, 0))
        relocs.append(data_entry_off[k])  # OffsetToData is an RVA -> relocate
        put(blob_off[k], l[2])

    hdr_sz, sec_sz = 20, 40
    raw_ptr = hdr_sz + sec_sz
    reloc_ptr = raw_ptr + total
    sym_ptr = reloc_ptr + 10 * len(relocs)
    coff = struct.pack('<HHIIIHH', 0x8664, 1, 0, sym_ptr, 1, 0, 0)
    sec = struct.pack('<8sIIIIIIHHI', b'.rsrc', 0, 0, total, raw_ptr, reloc_ptr, 0, len(relocs), 0, 0x40000040)
    rel = b''.join(struct.pack('<IIH', r, 0, 3) for r in relocs)  # IMAGE_REL_AMD64_ADDR32NB vs symbol 0
    sym = struct.pack('<8sIhHBB', b'.rsrc', 0, 1, 0, 3, 0)
    strtab = struct.pack('<I', 4)
    return coff + sec + bytes(buf) + rel + sym + strtab

if __name__ == '__main__':
    open(sys.argv[1], 'wb').write(build(sys.argv[2:]))
