import { useEffect, useId, useRef, useState } from 'react'
import './InfoPopover.css'

interface InfoPopoverProps {
  /** Accessible name for the trigger, e.g. "Lead time" → button reads "What is Lead time?" */
  label: string
  children: React.ReactNode
}

/** A small "?" button that reveals a definition panel on click. Closes on outside-click,
 * Escape, or clicking the button again. Purely explanatory — no state leaves it. */
export default function InfoPopover({ label, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="info-pop" ref={wrapRef}>
      <button
        type="button"
        className="info-pop__btn"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span className="info-pop__panel" id={panelId} role="tooltip">
          {children}
        </span>
      )}
    </span>
  )
}
