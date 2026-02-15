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

  it('displays ETA when estimatedRemainingMs is provided', () => {
    render(
      <ScanProgress
        progress={{ ...baseProgress, estimatedRemainingMs: 90000 }}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('≈ 1 мин 30 сек')).toBeInTheDocument()
  })

  it('displays download speed when downloadSpeed is provided', () => {
    render(
      <ScanProgress
        progress={{ ...baseProgress, downloadSpeed: 1024 * 1024 * 2.5 }}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('2.5 MB/с')).toBeInTheDocument()
  })

  it('displays both ETA and speed together', () => {
    render(
      <ScanProgress
        progress={{ ...baseProgress, estimatedRemainingMs: 30000, downloadSpeed: 1024 * 512 }}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('≈ 30 сек')).toBeInTheDocument()
    expect(screen.getByText('512.0 KB/с')).toBeInTheDocument()
  })

  it('does not display ETA row when no estimates provided', () => {
    const { container } = render(
      <ScanProgress progress={baseProgress} onCancel={vi.fn()} />,
    )

    expect(container.querySelector('.tabular-nums')).toBeInTheDocument()
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
  })
})
