import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { isAncestorSelected, YandexFolderPicker } from '../YandexFolderPicker'

vi.mock('@/lib/yandexDisk', () => ({
  listFolderContents: vi.fn(),
  sanitizeToken: vi.fn((t: string) => t.trim()),
}))

const { listFolderContents } = await import('@/lib/yandexDisk')
const mockListFolderContents = vi.mocked(listFolderContents)

const rootFolders = [
  { name: 'Фото', path: 'disk:/Фото', type: 'dir' as const },
  { name: 'Документы', path: 'disk:/Документы', type: 'dir' as const },
]

const photoChildren = [
  { name: '2020', path: 'disk:/Фото/2020', type: 'dir' as const },
  { name: '2021', path: 'disk:/Фото/2021', type: 'dir' as const },
]

const deepChildren = [
  { name: 'Лето', path: 'disk:/Фото/2020/Лето', type: 'dir' as const },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockListFolderContents.mockImplementation(async (_token, path) => {
    if (path === '/') return rootFolders
    if (path === 'disk:/Фото') return photoChildren
    if (path === 'disk:/Фото/2020') return deepChildren
    return []
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ------------------------------------------------------------------ */
/*  Юнит-тесты: isAncestorSelected                                   */
/* ------------------------------------------------------------------ */
describe('isAncestorSelected', () => {
  it('returns true when a parent path is in the selected set', () => {
    const selected = new Set(['disk:/Фото'])
    expect(isAncestorSelected('disk:/Фото/2020', selected)).toBe(true)
  })

  it('returns true for deeply nested path', () => {
    const selected = new Set(['disk:/Фото'])
    expect(isAncestorSelected('disk:/Фото/2020/Лето', selected)).toBe(true)
  })

  it('returns false for the selected path itself', () => {
    const selected = new Set(['disk:/Фото'])
    expect(isAncestorSelected('disk:/Фото', selected)).toBe(false)
  })

  it('returns false when no ancestor is selected', () => {
    const selected = new Set(['disk:/Документы'])
    expect(isAncestorSelected('disk:/Фото/2020', selected)).toBe(false)
  })

  it('returns false for sibling path with similar prefix', () => {
    const selected = new Set(['disk:/Фото'])
    // «disk:/Фото2» НЕ является потомком «disk:/Фото»
    expect(isAncestorSelected('disk:/Фото2', selected)).toBe(false)
  })

  it('returns false when selected set is empty', () => {
    expect(isAncestorSelected('disk:/Фото', new Set())).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  Интеграционные тесты: YandexFolderPicker                          */
/* ------------------------------------------------------------------ */
describe('YandexFolderPicker', () => {
  const defaultProps = {
    token: 'test-token',
    onScan: vi.fn(),
    onDisconnect: vi.fn(),
  }

  it('loads and renders root folders', async () => {
    render(<YandexFolderPicker {...defaultProps} />)

    expect(screen.getByText('Загрузка...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
      expect(screen.getByText('Документы')).toBeInTheDocument()
    })
  })

  it('selects a folder with checkbox', async () => {
    render(<YandexFolderPicker {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
    })

    const photoCheckbox = screen.getByRole('checkbox', { name: /Фото/ })
    expect(photoCheckbox).not.toBeChecked()

    fireEvent.click(photoCheckbox)
    expect(photoCheckbox).toBeChecked()

    // Кнопка показывает количество выбранных
    expect(screen.getByText(/Сканировать \(1 папок\)/)).toBeInTheDocument()
  })

  it('shows children as implicitly checked when parent is selected', async () => {
    render(<YandexFolderPicker {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
    })

    // Выбираем родителя «Фото»
    const photoCheckbox = screen.getByRole('checkbox', { name: /Фото/ })
    fireEvent.click(photoCheckbox)
    expect(photoCheckbox).toBeChecked()

    // Раскрываем «Фото» → загружаются дочерние папки
    const expandButtons = screen.getAllByLabelText('Развернуть')
    fireEvent.click(expandButtons[0]) // Первая кнопка — «Фото»

    await waitFor(() => {
      expect(screen.getByText('2020')).toBeInTheDocument()
      expect(screen.getByText('2021')).toBeInTheDocument()
    })

    // Дочерние чекбоксы отмечены и отключены
    const checkbox2020 = screen.getByRole('checkbox', { name: /2020/ })
    const checkbox2021 = screen.getByRole('checkbox', { name: /2021/ })

    expect(checkbox2020).toBeChecked()
    expect(checkbox2020).toBeDisabled()
    expect(checkbox2021).toBeChecked()
    expect(checkbox2021).toBeDisabled()

    // При этом у «Фото» чекбокс по-прежнему активен
    expect(photoCheckbox).toBeChecked()
    expect(photoCheckbox).not.toBeDisabled()
  })

  it('removes descendant selections when parent is checked', async () => {
    render(<YandexFolderPicker {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
    })

    // Раскрываем «Фото»
    const expandButtons = screen.getAllByLabelText('Развернуть')
    fireEvent.click(expandButtons[0])

    await waitFor(() => {
      expect(screen.getByText('2020')).toBeInTheDocument()
    })

    // Выбираем дочерние папки
    const checkbox2020 = screen.getByRole('checkbox', { name: /2020/ })
    const checkbox2021 = screen.getByRole('checkbox', { name: /2021/ })
    fireEvent.click(checkbox2020)
    fireEvent.click(checkbox2021)

    expect(checkbox2020).toBeChecked()
    expect(checkbox2021).toBeChecked()
    expect(screen.getByText(/Сканировать \(2 папок\)/)).toBeInTheDocument()

    // Теперь выбираем родителя «Фото» → дети удаляются, остаётся только родитель
    const photoCheckbox = screen.getByRole('checkbox', { name: /Фото/ })
    fireEvent.click(photoCheckbox)

    // В selected теперь только 1 путь (родитель покрывает детей)
    expect(screen.getByText(/Сканировать \(1 папок\)/)).toBeInTheDocument()

    // Дочерние чекбоксы неявно выбраны (через родителя)
    expect(checkbox2020).toBeChecked()
    expect(checkbox2020).toBeDisabled()
    expect(checkbox2021).toBeChecked()
    expect(checkbox2021).toBeDisabled()
  })

  it('unselecting parent makes children available for selection', async () => {
    render(<YandexFolderPicker {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
    })

    // Выбираем родителя, раскрываем
    const photoCheckbox = screen.getByRole('checkbox', { name: /Фото/ })
    fireEvent.click(photoCheckbox)

    const expandButtons = screen.getAllByLabelText('Развернуть')
    fireEvent.click(expandButtons[0])

    await waitFor(() => {
      expect(screen.getByText('2020')).toBeInTheDocument()
    })

    // Дочерние отключены
    const checkbox2020 = screen.getByRole('checkbox', { name: /2020/ })
    expect(checkbox2020).toBeDisabled()

    // Снимаем выбор с родителя
    fireEvent.click(photoCheckbox)

    // Теперь дочерние доступны для выбора
    expect(checkbox2020).not.toBeChecked()
    expect(checkbox2020).not.toBeDisabled()

    // Можно выбрать только дочернюю
    fireEvent.click(checkbox2020)
    expect(checkbox2020).toBeChecked()
    expect(screen.getByText(/Сканировать \(1 папок\)/)).toBeInTheDocument()
  })

  it('implicitly selected children have tooltip', async () => {
    render(<YandexFolderPicker {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
    })

    // Выбираем «Фото» и раскрываем
    fireEvent.click(screen.getByRole('checkbox', { name: /Фото/ }))

    const expandButtons = screen.getAllByLabelText('Развернуть')
    fireEvent.click(expandButtons[0])

    await waitFor(() => {
      expect(screen.getByText('2020')).toBeInTheDocument()
    })

    // Дочерний чекбокс имеет title (тултип)
    const checkbox2020 = screen.getByRole('checkbox', { name: /2020/ })
    expect(checkbox2020).toHaveAttribute('title', 'Включено через родительскую папку')
  })

  it('calls onScan with selected paths', async () => {
    const onScan = vi.fn()
    render(<YandexFolderPicker {...defaultProps} onScan={onScan} />)

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
    })

    // Выбираем «Фото»
    fireEvent.click(screen.getByRole('checkbox', { name: /Фото/ }))

    // Нажимаем «Сканировать»
    fireEvent.click(screen.getByText(/Сканировать \(1 папок\)/))

    expect(onScan).toHaveBeenCalledWith(['disk:/Фото'])
  })

  it('shows "Сканировать весь Диск" when nothing is selected', async () => {
    render(<YandexFolderPicker {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
    })

    expect(screen.getByText('Сканировать весь Диск')).toBeInTheDocument()
  })

  it('deeply nested children are implicitly selected through grandparent', async () => {
    render(<YandexFolderPicker {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Фото')).toBeInTheDocument()
    })

    // Выбираем «Фото»
    fireEvent.click(screen.getByRole('checkbox', { name: /Фото/ }))

    // Раскрываем «Фото»
    const rootExpandButtons = screen.getAllByLabelText('Развернуть')
    fireEvent.click(rootExpandButtons[0])

    await waitFor(() => {
      expect(screen.getByText('2020')).toBeInTheDocument()
    })

    // Раскрываем «2020»
    const childExpandButtons = screen.getAllByLabelText('Развернуть')
    // Среди кнопок «Развернуть» находим ту, что принадлежит «2020»
    // После раскрытия «Фото» у неё появляется «Свернуть», а «2020» и «2021» — «Развернуть»
    // Но «Документы» тоже «Развернуть». Порядок: 2020, 2021, Документы
    fireEvent.click(childExpandButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Лето')).toBeInTheDocument()
    })

    // «Лето» — неявно выбрана через «Фото» (дедушка)
    const checkboxSummer = screen.getByRole('checkbox', { name: /Лето/ })
    expect(checkboxSummer).toBeChecked()
    expect(checkboxSummer).toBeDisabled()
  })
})
