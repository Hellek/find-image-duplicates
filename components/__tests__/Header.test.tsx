import { describe, expect, it } from 'vitest'

import { render, screen } from '@testing-library/react'
import { Header } from '../Header'

describe('Header', () => {
  it('renders header element', () => {
    render(<Header />)
    const header = screen.getByRole('banner')
    expect(header).toBeInTheDocument()
  })

  it('displays title', () => {
    render(<Header />)
    expect(screen.getByText('Поиск дубликатов изображений')).toBeInTheDocument()
  })

  it('displays subtitle', () => {
    render(<Header />)
    expect(
      screen.getByText('Найдите точные копии и визуально похожие фотографии'),
    ).toBeInTheDocument()
  })
})
