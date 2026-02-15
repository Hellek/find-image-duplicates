import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  CLIENT_IDS_STORAGE_KEY,
  YandexDiskConnect,
} from '../YandexDiskConnect'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  // Мокаем sessionStorage
  const sessionData: Record<string, string> = {}
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn((key: string) => sessionData[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      sessionData[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete sessionData[key]
    }),
  })
  // Мокаем localStorage
  const localData: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => localData[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localData[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete localData[key]
    }),
  })
  // Мокаем window.open
  vi.stubGlobal('open', vi.fn())
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

    expect(
      screen.getByText('Подключение к Яндекс.Диску'),
    ).toBeInTheDocument()
  })

  it('shows error when submitting empty token', async () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    fireEvent.click(screen.getByText('Подключиться'))

    await waitFor(() => {
      expect(
        screen.getByText('Введите OAuth-токен'),
      ).toBeInTheDocument()
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
    mockFetch.mockReturnValueOnce(
      new Promise(r => { resolveFetch = r }),
    )

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    const input = screen.getByLabelText('OAuth-токен')
    fireEvent.change(input, { target: { value: 'token' } })
    fireEvent.click(screen.getByText('Подключиться'))

    await waitFor(() => {
      expect(screen.getByText('Проверка...')).toBeInTheDocument()
    })

    // Завершаем fetch, оборачиваем в act для корректного
    // обновления состояния
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

    expect(
      screen.getByText('Подключиться').closest('button'),
    ).toBeDisabled()
  })

  it('clears error when typing', async () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    // Вызываем ошибку
    fireEvent.click(screen.getByText('Подключиться'))
    await waitFor(() => {
      expect(
        screen.getByText('Введите OAuth-токен'),
      ).toBeInTheDocument()
    })

    // Начинаем вводить
    const input = screen.getByLabelText('OAuth-токен')
    fireEvent.change(input, { target: { value: 'a' } })

    await waitFor(() => {
      expect(
        screen.queryByText('Введите OAuth-токен'),
      ).not.toBeInTheDocument()
    })
  })
})

describe('YandexDiskConnect — Client ID', () => {
  it('renders Client ID separator and input', () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    expect(
      screen.getByText('или получить токен по Client ID'),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Введите Client ID...'),
    ).toBeInTheDocument()
  })

  it('shows saved Client IDs from localStorage', async () => {
    const ids = ['test-client-id-1', 'test-client-id-2']

    ;(localStorage.getItem as ReturnType<typeof vi.fn>)
      .mockReturnValue(JSON.stringify(ids))

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    // Ждём загрузку через queueMicrotask
    await waitFor(() => {
      expect(
        screen.getByText('Сохранённые Client ID:'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('test-client-id-1'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('test-client-id-2'),
      ).toBeInTheDocument()
    })
  })

  it('opens OAuth URL when clicking saved Client ID', async () => {
    const ids = ['my-app-id']

    ;(localStorage.getItem as ReturnType<typeof vi.fn>)
      .mockReturnValue(JSON.stringify(ids))

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('my-app-id')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('my-app-id'))

    expect(window.open).toHaveBeenCalledWith(
      'https://oauth.yandex.ru/authorize'
      + '?response_type=token&client_id=my-app-id',
      '_blank',
    )
  })

  it('adds new Client ID, saves to localStorage, and opens OAuth', () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    const input = screen.getByPlaceholderText(
      'Введите Client ID...',
    )

    fireEvent.change(input, {
      target: { value: 'new-client-id' },
    })
    fireEvent.click(
      screen.getByTitle('Добавить и получить токен'),
    )

    // Сохраняет в localStorage
    expect(localStorage.setItem).toHaveBeenCalledWith(
      CLIENT_IDS_STORAGE_KEY,
      JSON.stringify(['new-client-id']),
    )

    // Открывает OAuth URL
    expect(window.open).toHaveBeenCalledWith(
      'https://oauth.yandex.ru/authorize'
      + '?response_type=token&client_id=new-client-id',
      '_blank',
    )

    // Поле ввода очищается
    expect(input).toHaveValue('')
  })

  it('submits new Client ID on Enter key', () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    const input = screen.getByPlaceholderText(
      'Введите Client ID...',
    )

    fireEvent.change(input, {
      target: { value: 'enter-id' },
    })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(window.open).toHaveBeenCalledWith(
      'https://oauth.yandex.ru/authorize'
      + '?response_type=token&client_id=enter-id',
      '_blank',
    )
  })

  it('removes saved Client ID', async () => {
    const ids = ['id-to-remove', 'id-to-keep']

    ;(localStorage.getItem as ReturnType<typeof vi.fn>)
      .mockReturnValue(JSON.stringify(ids))

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    await waitFor(() => {
      expect(
        screen.getByText('id-to-remove'),
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByLabelText('Удалить id-to-remove'),
    )

    // Сохраняет обновлённый список
    expect(localStorage.setItem).toHaveBeenCalledWith(
      CLIENT_IDS_STORAGE_KEY,
      JSON.stringify(['id-to-keep']),
    )

    // Элемент убирается из DOM
    await waitFor(() => {
      expect(
        screen.queryByText('id-to-remove'),
      ).not.toBeInTheDocument()
    })
  })

  it('does not duplicate existing Client ID', async () => {
    const ids = ['existing-id']

    ;(localStorage.getItem as ReturnType<typeof vi.fn>)
      .mockReturnValue(JSON.stringify(ids))

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    await waitFor(() => {
      expect(
        screen.getByText('existing-id'),
      ).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(
      'Новый Client ID...',
    )

    fireEvent.change(input, {
      target: { value: 'existing-id' },
    })
    fireEvent.click(
      screen.getByTitle('Добавить и получить токен'),
    )

    // Сохраняет список без дубликатов
    expect(localStorage.setItem).toHaveBeenCalledWith(
      CLIENT_IDS_STORAGE_KEY,
      JSON.stringify(['existing-id']),
    )

    // OAuth всё равно открывается
    expect(window.open).toHaveBeenCalled()
  })

  it('does not submit empty Client ID', () => {
    render(<YandexDiskConnect onConnected={vi.fn()} />)

    const addBtn = screen.getByTitle(
      'Добавить и получить токен',
    )

    expect(addBtn).toBeDisabled()

    // Попробуем через Enter с пустым полем
    const input = screen.getByPlaceholderText(
      'Введите Client ID...',
    )

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(window.open).not.toHaveBeenCalled()
  })

  it('shows different placeholder when Client IDs exist', async () => {
    const ids = ['some-id']

    ;(localStorage.getItem as ReturnType<typeof vi.fn>)
      .mockReturnValue(JSON.stringify(ids))

    render(<YandexDiskConnect onConnected={vi.fn()} />)

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Новый Client ID...'),
      ).toBeInTheDocument()
    })
  })
})
