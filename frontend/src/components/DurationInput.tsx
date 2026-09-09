import { useEffect, useRef, useState } from 'react'
import { bestUnit, fromSeconds, toSeconds, UNIT_LABELS, type DurationUnit } from '../lib/duration'
import './DurationInput.css'

interface DurationInputProps {
  label: string
  seconds: number
  onChange: (seconds: number) => void
  disabled?: boolean
}

const UNITS: DurationUnit[] = ['sec', 'min', 'hr', 'day', 'week']

export default function DurationInput({ label, seconds, onChange, disabled }: DurationInputProps) {
  const [unit, setUnit] = useState<DurationUnit>(() => bestUnit(seconds))
  const [text, setText] = useState<string>(() => String(round(fromSeconds(seconds, unit))))
  const focused = useRef(false)

  // Commit on every keystroke so an explicit Save button (which fires alongside the input's
  // blur) always sees the current value — no lost last edit. Parse leniently: a partial "1."
  // reads as 1 while you keep typing.
  function commit(nextText: string, nextUnit: DurationUnit) {
    const parsed = parseFloat(nextText)
    const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    onChange(toSeconds(value, nextUnit))
  }

  // Re-sync the field from `seconds` only when the change came from *outside* (a form reset,
  // switching to another step) — never mid-typing, so committing "1." doesn't snap it to "1".
  useEffect(() => {
    if (focused.current) return
    const own = toSeconds(parseFloat(text) || 0, unit)
    if (Math.abs(own - seconds) > 0.5) {
      setText(String(round(fromSeconds(seconds, unit))))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, unit])

  return (
    <label className="duration-input">
      <span className="duration-input__label">{label}</span>
      <div className="duration-input__row">
        <input
          type="number"
          min={0}
          step="any"
          value={text}
          disabled={disabled}
          onFocus={() => {
            focused.current = true
          }}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value, unit)
          }}
          onBlur={() => {
            focused.current = false
            commit(text, unit)
            // Normalize the display ("1." -> "1", "1.50" -> "1.5") once editing ends.
            setText(String(round(fromSeconds(toSeconds(parseFloat(text) || 0, unit), unit))))
          }}
        />
        <select
          value={unit}
          disabled={disabled}
          onChange={(e) => {
            const nextUnit = e.target.value as DurationUnit
            setUnit(nextUnit)
            commit(text, nextUnit)
          }}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
