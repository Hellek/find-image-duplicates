import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { ThresholdSlider } from '../ThresholdSlider'

describe('ThresholdSlider', () => {
  it('renders with current value', () => {
    render(<ThresholdSlider value={10} onChange={vi.fn()} />)

    expect(screen.getByText('Порог схожести')).toBeInTheDocument()
    expect(screen.getByText(/10/)).toBeInTheDocument()
    expect(screen.getByText(/256 бит/)).toBeInTheDocument()
  })

  it('displays range labels', () => {
    render(<ThresholdSlider value={5} onChange={vi.fn()} />)

    expect(screen.getByText(/Строже/)).toBeInTheDocument()
    expect(screen.getByText(/Мягче/)).toBeInTheDocument()
  })

  it('renders slider element', () => {
    render(<ThresholdSlider value={20} onChange={vi.fn()} />)

    expect(screen.getByRole('slider')).toBeInTheDocument()
  })
})
