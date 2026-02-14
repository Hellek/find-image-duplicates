'use client'

import { Slider } from '@/components/ui/slider'

interface ThresholdSliderProps {
  value: number
  onChange: (value: number) => void
}

export function ThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  return (
    <div className="w-full max-w-lg space-y-2">
      <div className="flex items-center justify-between text-sm">
        <label className="font-medium">Порог схожести</label>
        <span className="text-muted-foreground tabular-nums">
          {value}
          {' '}
          / 256 бит
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={64}
        step={1}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Строже (только очень похожие)</span>
        <span>Мягче (больше совпадений)</span>
      </div>
    </div>
  )
}
