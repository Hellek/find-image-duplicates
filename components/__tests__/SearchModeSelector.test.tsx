import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchModeSelector } from '../SearchModeSelector'

describe('SearchModeSelector', () => {
  it('renders both mode tabs', () => {
    render(<SearchModeSelector value="exact" onChange={vi.fn()} />)

    expect(screen.getByText('Точные копии')).toBeInTheDocument()
    expect(screen.getByText('Похожие')).toBeInTheDocument()
  })

  it('shows exact mode description when exact is selected', () => {
    render(<SearchModeSelector value="exact" onChange={vi.fn()} />)

    expect(
      screen.getByText(/SHA-256/),
    ).toBeInTheDocument()
  })

  it('shows similar mode description when similar is selected', () => {
    render(<SearchModeSelector value="similar" onChange={vi.fn()} />)

    expect(
      screen.getByText(/перцептивное хэширование/),
    ).toBeInTheDocument()
  })

  it('calls onChange when tab is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchModeSelector value="exact" onChange={onChange} />)

    await user.click(screen.getByText('Похожие'))
    expect(onChange).toHaveBeenCalledWith('similar')
  })
})
