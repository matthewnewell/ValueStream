import { useEffect, useState } from 'react'
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

  // Re-sync the displayed value if the underlying seconds change from outside (e.g. AI
  // suggest populated the field, or the parent reset the form) — but not on every keystroke.
  useEffect(() => {
    setText(String(round(fromSeconds(seconds, unit))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds])

  function commit(nextText: string, nextUnit: DurationUnit) {
    const parsed = parseFloat(nextText)
    const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    onChange(toSeconds(value, nextUnit))
  }

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
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text, unit)}
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
