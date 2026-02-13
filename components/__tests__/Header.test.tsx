import { describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'
import { Header } from '../Header'

describe('Header', () => {
  it('renders header element', () => {
    render(<Header />)
    const header = screen.getByRole('banner')
    expect(header).toBeInTheDocument()
  })

  it('displays header text', () => {
    render(<Header />)
    expect(screen.getByText('Header')).toBeInTheDocument()
  })
})
