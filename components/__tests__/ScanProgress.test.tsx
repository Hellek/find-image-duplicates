import { describe, expect, it, vi } from 'vitest'

import type { ScanProgress as ScanProgressData } from '@/lib/duplicateFinder'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScanProgress } from '../ScanProgress'

const baseProgress: ScanProgressData = {
  totalFiles: 100,
  processedFiles: 50,
  currentFile: '/photos/img_001.jpg',
  phase: 'hashing',
}

describe('ScanProgress', () => {
  it('shows scanning phase label', () => {
    render(
      <ScanProgress
        progress={{ ...baseProgress, phase: 'scanning' }}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Сканирование файлов...')).toBeInTheDocument()
  })

  it('shows hashing phase label', () => {
    render(
      <ScanProgress
        progress={{ ...baseProgress, phase: 'hashing' }}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Вычисление хэшей...')).toBeInTheDocument()
  })

  it('shows comparing phase label', () => {
    render(
      <ScanProgress
        progress={{ ...baseProgress, phase: 'comparing' }}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Сравнение изображений...')).toBeInTheDocument()
  })

  it('displays processed / total count', () => {
    render(<ScanProgress progress={baseProgress} onCancel={vi.fn()} />)

    // Текст "50 / 100 файлов" в одном span
    expect(screen.getByText(/50 \/ 100/)).toBeInTheDocument()
  })

  it('displays percentage', () => {
    render(<ScanProgress progress={baseProgress} onCancel={vi.fn()} />)

    // Текст "50%" в отдельном span
    expect(screen.getByText(/50%/)).toBeInTheDocument()
  })

  it('displays current file path', () => {
    render(<ScanProgress progress={baseProgress} onCancel={vi.fn()} />)

    expect(screen.getByText('/photos/img_001.jpg')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ScanProgress progress={baseProgress} onCancel={onCancel} />)

    fireEvent.click(screen.getByText('Отменить'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('handles 0 total files without crashing', () => {
    render(
      <ScanProgress
        progress={{ ...baseProgress, totalFiles: 0, processedFiles: 0 }}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/0 \/ 0/)).toBeInTheDocument()
  })
})
