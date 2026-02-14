import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { DirectoryPicker } from '../DirectoryPicker'

describe('DirectoryPicker', () => {
  it('renders select folder button', () => {
    render(<DirectoryPicker onDirectorySelected={vi.fn()} />)

    expect(screen.getByText('Выбрать папку')).toBeInTheDocument()
  })

  it('renders description text', () => {
    render(<DirectoryPicker onDirectorySelected={vi.fn()} />)

    expect(
      screen.getByText(/Выберите папку с фотографиями/),
    ).toBeInTheDocument()
  })

  it('disables button when disabled prop is true', () => {
    render(<DirectoryPicker onDirectorySelected={vi.fn()} disabled />)

    expect(screen.getByText('Выбрать папку').closest('button')).toBeDisabled()
  })

  it('contains hidden file input', () => {
    const { container } = render(
      <DirectoryPicker onDirectorySelected={vi.fn()} />,
    )

    const input = container.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()
    expect(input).toHaveClass('hidden')
  })
})
