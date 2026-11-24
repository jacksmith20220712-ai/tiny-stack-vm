// tiny-stack-vm: a complete interpreter for make.fun's tiny stack ISA (ISA.md in the kit).
// Runs every program in /input/<id>/ and writes its stdout and exit code to /output/<id>/.
// Node 22, plain JavaScript: node main.ts (or MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR to override).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Opcode byte -> "imm pops pushes" for every opcode the ISA names; anything else traps 5.
const T = { 0: '000', 1: '101', 2: '401', 3: '010', 4: '012', 5: '022', 6: '023', 7: '033', 16: '021', 17: '021', 18: '021', 19: '021', 20: '021', 21: '021', 22: '021', 23: '011', 24: '021', 25: '021', 26: '021', 27: '011', 28: '021', 29: '021', 30: '021', 32: '021', 33: '021', 34: '021', 48: '200', 49: '210', 50: '210', 51: '200', 52: '000', 64: '011', 65: '020', 80: '010', 81: '010', 82: '001', 83: '010' };

function run(p, q) {
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const o = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, st = 0, ip = 0, ol = 0;
  const end = (c) => ({ o: o.subarray(0, ol), c });
  for (;;) {
    if (st === 1e6) return end(10);
    if (pc < 0 || pc >= p.length) return end(9);
    const b = p[pc], t = T[b];
    if (!t) return end(5);
    const im = +t[0], po = +t[1], pu = +t[2];
    if (pc + im >= p.length) return end(9);
    st++;
    if (sp < po) return end(2);
    if (sp - po + pu > 256) return end(3);
    const nx = pc + 1 + im;
    pc = nx;
    switch (b) {
      case 0: return end(0);
      case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[nx - 4] | p[nx - 3] << 8 | p[nx - 2] << 16 | p[nx - 1] << 24; break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const x = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = x; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 23: D[sp - 1] = -D[sp - 1] | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 48: case 49: case 50: {
        const r = ((p[nx - 2] | p[nx - 1] << 8) << 16) >> 16;
        let take = true;
        if (b !== 48) { const v = D[--sp]; take = b === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + r;
        break;
      }
      case 51:
        if (cp === 64) return end(7);
        C[cp++] = nx;
        pc = p[nx - 2] | p[nx - 1] << 8;
        break;
      case 52:
        if (cp === 0) return end(8);
        pc = C[--cp];
        break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) return end(6);
        D[sp - 1] = M[a];
        break;
      }
      case 65: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a >= 256) return end(6);
        sp -= 2;
        M[a] = v;
        break;
      }
      case 80: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) o[ol++] = s.charCodeAt(i);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return end(11);
        o[ol++] = D[--sp] & 255;
        break;
      case 82: D[sp++] = ip < q.length ? q[ip++] : -1; break;
      case 83: return end(D[--sp] & 255);
      default: {
        const y = D[sp - 1], x = D[sp - 2];
        let r;
        switch (b) {
          case 16: r = x + y | 0; break;
          case 17: r = x - y | 0; break;
          case 18: r = Math.imul(x, y); break;
          case 19: if (y === 0) return end(4); r = x === -2147483648 && y === -1 ? x : x / y | 0; break;
          case 20: if (y === 0) return end(4); r = y === -1 ? 0 : x % y | 0; break;
          case 21: if (y === 0) return end(4); r = Math.floor((x >>> 0) / (y >>> 0)) | 0; break;
          case 22: if (y === 0) return end(4); r = (x >>> 0) % (y >>> 0) | 0; break;
          case 24: r = x & y; break;
          case 25: r = x | y; break;
          case 26: r = x ^ y; break;
          case 28: r = x << (y & 31); break;
          case 29: r = x >> (y & 31); break;
          case 30: r = (x >>> (y & 31)) | 0; break;
          case 32: r = x === y ? 1 : 0; break;
          case 33: r = x < y ? 1 : 0; break;
          default: r = (x >>> 0) < (y >>> 0) ? 1 : 0;
        }
        sp -= 2;
        D[sp++] = r;
      }
    }
  }
}

for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.o);
  writeFileSync(join(O, id, 'exit.txt'), r.c + '\n');
}
