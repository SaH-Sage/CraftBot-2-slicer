/**
 * Slices a 20 mm cube headlessly with every Craftbot preset x filament using
 * the real WASM engine (npm run setup first), and reports what the G-code
 * contains. Run: npx tsx scripts/validate-craftbot.ts
 */
import { buildConfig, flattenSliceConfig, PRESETS, FILAMENT_PRESETS } from '../src/lib/profiles'
// @ts-expect-error plain mjs helper
import { loadModule, initSession, sliceOnce, trianglesToStl, free, checkedMalloc } from '../orca-wasm/scripts/lib/engine-harness.mjs'

function cubeStl(sz: number): Uint8Array {
  const c = [[0,0,0],[sz,0,0],[sz,sz,0],[0,sz,0],[0,0,sz],[sz,0,sz],[sz,sz,sz],[0,sz,sz]]
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
  return trianglesToStl(c, f)
}
function grab(g: string, re: RegExp): string { const m = g.match(re); return m ? m[0] : '-' }

async function main() {
  const module = await loadModule('public/wasm', 'slicer')
  const stl = cubeStl(20)
  const filaments = Object.keys(FILAMENT_PRESETS)
  for (const preset of PRESETS) {
    for (const fil of filaments) {
      const cfg = flattenSliceConfig(buildConfig('Craftbot 2', fil, preset.name), true)
      const session = module._orc_session_create()
      try {
        initSession(module, session, JSON.stringify(cfg))
        const t0 = Date.now()
        const g = sliceOnce(module, session, stl)
        const layers = (g.match(/;LAYER_CHANGE/g) || []).length
        const retracts = (g.match(/^G1 E-[\d.]+ F\d+/gm) || []).length
        console.log(`${preset.name.padEnd(12)} ${fil.padEnd(5)} ok ${((Date.now()-t0)/1000).toFixed(1)}s | ${(g.length/1024).toFixed(0)} KB | layers ${layers} | retracts ${retracts} | ${grab(g,/M190 S\d+/)} ${grab(g,/M109 S\d+/)} ${grab(g,/M140 S\d+/)} | ${grab(g,/^G1 E-[\d.]+ F\d+/m)} | ${grab(g,/M83|M82/)}`)
        if (preset.name === 'standard' && fil === 'PLA') {
          const head = g.split('\n').slice(0, 60).filter(l => !l.startsWith('; ') || /start|end/i.test(l)).join('\n')
          console.log('--- head (standard/PLA) ---\n' + g.split('\n').filter(l => !l.startsWith('; ')).slice(0, 28).join('\n'))
          console.log('--- tail ---\n' + g.split('\n').slice(-16).join('\n'))
        }
      } catch (e) {
        console.log(`${preset.name.padEnd(12)} ${fil.padEnd(5)} FAILED: ${(e as Error).message.slice(0, 300)}`)
      } finally { module._orc_session_destroy(session) }
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
