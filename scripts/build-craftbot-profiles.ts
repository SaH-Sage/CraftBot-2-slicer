/**
 * Builds src/data/orca-profiles.json for the CraftBot 2 school slicer from
 * Craftbot's own OrcaSlicer vendor profiles (profiles/Craftbot/**).
 *
 *   npx tsx scripts/build-craftbot-profiles.ts
 *
 * Craftbot never published Orca profiles for the CraftBot 2, but the Plus Pro
 * shares its bed (250 x 200 x 200), 0.4 mm nozzle and direct-drive extruder,
 * so the Plus Pro 0.4 machine profile, Craftbot's process presets and their
 * filament profiles are used as-is, with three adjustments for the older
 * machine and the stock OrcaSlicer 2.4.2 engine this site runs:
 *
 *   1. gcode_flavor "craftbotplus" is a Craftbot-fork flavour the stock
 *      engine does not know -> "marlin" (the CraftBot 2 firmware is Marlin-like).
 *   2. Craftbot's start/end G-code uses fork-only variables (idex_print_mode,
 *      is_idex_printer). Replaced by a placeholder-free CraftBot 2 script
 *      (heating is inserted by the engine itself; the skirt primes the nozzle).
 *   3. Fork-only keys and host settings are dropped; the "Fast" process
 *      variants (600 mm/s infill, 4000 mm/s^2) are not offered.
 *
 * Everything else — layer heights, top/bottom counts, walls, infill, speeds,
 * accelerations, line widths, retraction, temperatures, cooling — is Craftbot's.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOrcaProfileJson } from '../src/lib/profiles'
import type { OrcaConfig } from '../src/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR = join(ROOT, 'profiles', 'Craftbot')
const OUT = join(ROOT, 'src', 'data', 'orca-profiles.json')

type Raw = Record<string, unknown>

const MACHINE = 'Craftbot Plus Pro 0.4 nozzle'
const PRINTER_LABEL = 'Craftbot 2'

const PROCESSES = [
  { name: 'superdraft', process: '0.30mm Superdraft @CraftbotPlus', label: '0,30 mm – Superdraft', description: 'Raskest. Grove lag, synlige linjer.' },
  { name: 'draft', process: '0.25mm Draft @CraftbotPlus', label: '0,25 mm – Draft', description: 'Rask. Fin nok til prototyper.' },
  { name: 'standard', process: '0.20mm Standard @CraftbotPlus', label: '0,20 mm – Standard', description: 'Anbefalt. God balanse mellom tid og kvalitet.' },
  { name: 'optimal', process: '0.15mm Optimal @CraftbotPlus', label: '0,15 mm – Optimal', description: 'Fin. Penere overflate, tar lengre tid.' },
  { name: 'detail', process: '0.10mm Detail @CraftbotPlus', label: '0,10 mm – Detail', description: 'Svært fin. Regn med lang utskriftstid.' },
  { name: 'ultradetail', process: '0.05mm Ultradetail @CraftbotPlus', label: '0,05 mm – Ultradetail', description: 'Ekstrem. Bare for små, detaljerte deler.' },
]

const FILAMENTS = [
  { name: 'PLA', filament: 'Craftbot Generic PLA' },
  { name: 'PETG', filament: 'Craftbot Generic PETG' },
  { name: 'TPU', filament: 'Craftbot Generic TPU' },
]

// CraftBot 2 start/end scripts, derived from the single-extruder branch of
// Craftbot's own Plus Pro script. Placeholders are the standard OrcaSlicer
// ones (verified to resolve in the WASM engine by scripts/validate-craftbot.ts).
// Heating is explicit because the engine does not add an M109 wait on its own.
// The two-loop skirt from Craftbot's process profile primes the nozzle.
const START_GCODE = [
  '; CraftBot 2 - start ({total_layer_count} layers)',
  'M140 S[bed_temperature_initial_layer_single] ; start heating bed',
  'M104 S[nozzle_temperature_initial_layer] ; start heating nozzle',
  'G28 ; home all axes',
  'G1 Z5 F600 ; lift nozzle',
  'M190 S[bed_temperature_initial_layer_single] ; wait for bed',
  'M109 S[nozzle_temperature_initial_layer] ; wait for nozzle',
].join('\n')

const END_GCODE = [
  '; CraftBot 2 - end',
  'M107 ; fan off',
  'G91 ; relative positioning',
  'G1 E-1 F300 ; retract',
  'G1 Z10 F600 ; lift 10 mm',
  'G90 ; absolute positioning',
  'G28 X0 Y0 ; home X and Y',
  'M104 S0 ; nozzle off',
  'M140 S0 ; bed off',
  'M84 ; motors off',
].join('\n')

// Keys that only describe the profile, not the print.
const META_KEYS = new Set([
  'inherits', 'from', 'instantiation', 'type', 'name', 'setting_id', 'filament_id', 'version',
  'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition',
  'printer_settings_id', 'print_settings_id', 'filament_settings_id', 'upward_compatible_machine',
  'default_print_profile', 'default_filament_profile', 'is_custom_defined', 'notes', 'filament_notes', 'printer_notes',
])
// Fork-only or host-related keys the stock engine must not see.
const DROP_KEYS = new Set([
  'host_type', 'print_host', 'printhost_apikey', 'printhost_cafile', 'printhost_authorization_type', 'printhost_user', 'printhost_password', 'printhost_port',
  'is_idex_printer', 'thumbnails', 'thumbnails_format', 'auxiliary_fan', 'bbl_use_printhost',
  'machine_pause_gcode', 'change_filament_gcode', 'before_layer_change_gcode', 'layer_change_gcode',
  'time_lapse_gcode', 'template_custom_gcode', 'change_extrusion_role_gcode', 'printing_by_object_gcode',
  'machine_load_filament_time', 'machine_unload_filament_time', 'machine_switch_extruder_time',
  'bed_exclude_area_left_mode', 'bed_exclude_area_right_mode', 'bed_exclude_area_mirror_mode', 'bed_exclude_area_parallel_mode',
])

function loadCategory(cat: string): Map<string, Raw> {
  const dir = join(VENDOR, cat)
  const map = new Map<string, Raw>()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Raw
    const name = typeof raw.name === 'string' ? raw.name : f.replace(/\.json$/, '')
    map.set(name, raw)
  }
  return map
}

function resolveInherits(cat: string, name: string, files: Map<string, Raw>, cache: Map<string, Raw>): Raw {
  const key = `${cat}/${name}`
  const cached = cache.get(key)
  if (cached) return cached
  const raw = files.get(name)
  if (!raw) throw new Error(`${cat} profile "${name}" not found in ${VENDOR}`)
  const parentName = raw.inherits as string | undefined
  const parent = parentName ? resolveInherits(cat, parentName, files, cache) : {}
  const merged: Raw = { ...parent, ...raw }
  cache.set(key, merged)
  return merged
}

function strip(raw: Raw, extraDrop: (k: string, v: unknown) => boolean = () => false): Raw {
  const out: Raw = {}
  for (const [k, v] of Object.entries(raw)) {
    if (META_KEYS.has(k) || DROP_KEYS.has(k)) continue
    if (extraDrop(k, v)) continue
    out[k] = v
  }
  return out
}

function hasPlaceholder(v: unknown): boolean {
  const s = Array.isArray(v) ? v.join('\n') : String(v)
  return /[{}[\]]/.test(s) && /gcode|_code|G1|M1/i.test(s) === true
}

function main() {
  if (!existsSync(VENDOR)) throw new Error(`Vendor folder missing: ${VENDOR}`)
  const cache = new Map<string, Raw>()
  const machines = loadCategory('machine')
  const processes = loadCategory('process')
  const filaments = loadCategory('filament')

  // ---- machine ------------------------------------------------------------
  const machineRaw = strip(resolveInherits('machine', MACHINE, machines, cache))
  machineRaw.gcode_flavor = 'marlin'
  machineRaw.machine_start_gcode = START_GCODE
  machineRaw.machine_end_gcode = END_GCODE
  machineRaw.printer_model = PRINTER_LABEL
  machineRaw.printer_variant = '0.4'
  machineRaw.emit_machine_limits_to_gcode = '0'
  // Plain heated bed: use the filament's hot-plate temperatures (the engine defaults to "Cool Plate" = 35 C)
  machineRaw.curr_bed_type = 'High Temp Plate'
  machineRaw.disable_m73 = '1'
  machineRaw.printer_notes = ''
  const machineConfig = parseOrcaProfileJson(JSON.stringify(machineRaw))
  const printerPresets: Record<string, Partial<OrcaConfig>> = {
    [PRINTER_LABEL]: { printer_model: PRINTER_LABEL, ...machineConfig },
  }

  // ---- processes ----------------------------------------------------------
  const qualityPresets = PROCESSES.map((p) => {
    const raw = strip(resolveInherits('process', p.process, processes, cache), (k, v) => k.endsWith('_gcode') && hasPlaceholder(v))
    const config = parseOrcaProfileJson(JSON.stringify(raw))
    return { name: p.name, label: p.label, description: p.description, craftbot: p.process, config }
  })

  // ---- filaments ----------------------------------------------------------
  const filamentPresets: Record<string, Partial<OrcaConfig>> = {}
  for (const f of FILAMENTS) {
    const raw = strip(resolveInherits('filament', f.filament, filaments, cache), (k, v) => k.endsWith('_gcode') && hasPlaceholder(v))
    filamentPresets[f.name] = parseOrcaProfileJson(JSON.stringify(raw))
  }

  const out = { printerPresets, qualityPresets, filamentPresets }
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)
  const size = (o: object) => Object.keys(o).length
  console.log(`Wrote ${OUT}`)
  console.log(`  printer: ${PRINTER_LABEL} (${size(machineConfig)} typed keys, ${size(machineConfig._passthrough ?? {})} passthrough)`)
  for (const q of qualityPresets) console.log(`  process: ${q.label} <- ${q.craftbot} (${size(q.config)} typed, ${size(q.config._passthrough ?? {})} passthrough)`)
  for (const [n, c] of Object.entries(filamentPresets)) console.log(`  filament: ${n} (${size(c)} typed, ${size(c._passthrough ?? {})} passthrough)`)
}

main()
