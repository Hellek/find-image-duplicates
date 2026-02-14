import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { YandexDiskConnect } from '../YandexDiskConnect'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  // Мокаем sessionStorage
  const storage: Record<string, string> = {}
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
    removeItem: vi.fn((key: string) => { delete storage[key] }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('YandexDiskConnect', () => {
  it('renders form elements', () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    expect(screen.getByLabelText('OAuth-токен')).toBeInTheDocument()
    expect(screen.getByText('Подключиться')).toBeInTheDocument()
    expect(screen.getByText('Как получить токен')).toBeInTheDocument()
  })

  it('renders card title', () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    expect(screen.getByText('Подключение к Яндекс.Диску')).toBeInTheDocument()
  })

  it('shows error when submitting empty token', async () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    fireEvent.click(screen.getByText('Подключиться'))

    await waitFor(() => {
      expect(screen.getByText('Введите OAuth-токен')).toBeInTheDocument()
    })
  })

  it('calls onConnected on successful token verification', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    const onConnected = vi.fn()

    render(<YandexDiskConnect onConnected={onConnected} />)

    const input = screen.getByLabelText('OAuth-токен')
    fireEvent.change(input, { target: { value: 'valid-token-123' } })
    fireEvent.click(screen.getByText('Подключиться'))

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith('valid-token-123')
    })
  })

  it('shows error on 401 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    const input = screen.getByLabelText('OAuth-токен')
    fireEvent.change(input, { target: { value: 'bad-token' } })
    fireEvent.click(screen.getByText('Подключиться'))

    await waitFor(() => {
      expect(screen.getByText(/Неверный токен/)).toBeInTheDocument()
    })
  })

  it('shows generic error on other HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    const input = screen.getByLabelText('OAuth-токен')
    fireEvent.change(input, { target: { value: 'some-token' } })
    fireEvent.click(screen.getByText('Подключиться'))

    await waitFor(() => {
      expect(screen.getByText(/Ошибка: 500/)).toBeInTheDocument()
    })
  })

  it('shows loading state during verification', async () => {
    // Не разрешаем промис fetch сразу
    let resolveFetch!: (value: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise(r => { resolveFetch = r }))

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    const input = screen.getByLabelText('OAuth-токен')
    fireEvent.change(input, { target: { value: 'token' } })
    fireEvent.click(screen.getByText('Подключиться'))

    await waitFor(() => {
      expect(screen.getByText('Проверка...')).toBeInTheDocument()
    })

    // Завершаем fetch, оборачиваем в act для корректного обновления состояния
    const { act } = await import('react')
    await act(async () => {
      resolveFetch({ ok: true })
    })
  })

  it('saves token to sessionStorage on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    const input = screen.getByLabelText('OAuth-токен')
    fireEvent.change(input, { target: { value: 'save-me-token' } })
    fireEvent.click(screen.getByText('Подключиться'))

    await waitFor(() => {
      expect(sessionStorage.setItem).toHaveBeenCalledWith(
        'yandex_disk_token',
        'save-me-token',
      )
    })
  })

  it('disables button when disabled prop is true', () => {
    render(<YandexDiskConnect onConnected={vi.fn()} disabled />)

    expect(screen.getByText('Подключиться').closest('button')).toBeDisabled()
  })

  it('clears error when typing', async () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    // Вызываем ошибку
    fireEvent.click(screen.getByText('Подключиться'))
    await waitFor(() => {
      expect(screen.getByText('Введите OAuth-токен')).toBeInTheDocument()
    })

    // Начинаем вводить
    const input = screen.getByLabelText('OAuth-токен')
    fireEvent.change(input, { target: { value: 'a' } })

    await waitFor(() => {
      expect(screen.queryByText('Введите OAuth-токен')).not.toBeInTheDocument()
    })
  })
})
