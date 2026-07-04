import { useState } from 'react'

export function useModal<T = boolean>() {
  const [value, setValue] = useState<T | null>(null)
  return {
    value,
    open: (v?: T) => setValue(v !== undefined ? v : (true as unknown as T)),
    close: () => setValue(null),
    isOpen: value !== null,
  }
}
