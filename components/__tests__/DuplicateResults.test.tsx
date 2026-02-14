import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DuplicateGroup as DuplicateGroupData } from '@/lib/duplicateFinder'
import { fireEvent, render, screen } from '@testing-library/react'
import { DuplicateResults } from '../DuplicateResults'

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeGroup(fileCount: number, hash: string = 'abc123'): DuplicateGroupData {
  return {
    hash,
    files: Array.from({ length: fileCount }, (_, i) => ({
      entry: { path: `/photos/img_${i}.jpg` },
      hash,
      file: new File([`data-${i}`], `img_${i}.jpg`, { type: 'image/jpeg' }),
    })),
  }
}

describe('DuplicateResults', () => {
  it('shows "no duplicates" message when groups is empty', () => {
    render(
      <DuplicateResults
        groups={[]}
        totalFiles={10}
        mode="exact"
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText('Дубликатов не найдено')).toBeInTheDocument()
    expect(screen.getByText(/10 изображений уникальны/)).toBeInTheDocument()
  })

  it('suggests increasing threshold for similar mode with no results', () => {
    render(
      <DuplicateResults
        groups={[]}
        totalFiles={5}
        mode="similar"
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText(/увеличить порог схожести/)).toBeInTheDocument()
  })

  it('displays statistics badges', () => {
    const groups = [makeGroup(3, 'h1'), makeGroup(2, 'h2')]

    render(
      <DuplicateResults
        groups={groups}
        totalFiles={10}
        mode="exact"
        onReset={vi.fn()}
      />,
    )

    // Всего
    expect(screen.getByText(/Всего:/)).toBeInTheDocument()
    // Групп дубликатов
    expect(screen.getByText(/Групп дубликатов:/)).toBeInTheDocument()
  })

  it('shows mode badge for exact', () => {
    render(
      <DuplicateResults
        groups={[]}
        totalFiles={5}
        mode="exact"
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText(/Точные копии/)).toBeInTheDocument()
  })

  it('shows mode badge for similar', () => {
    render(
      <DuplicateResults
        groups={[]}
        totalFiles={5}
        mode="similar"
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText(/Похожие/)).toBeInTheDocument()
  })

  it('calls onReset when "Новый поиск" button is clicked', () => {
    const onReset = vi.fn()

    render(
      <DuplicateResults
        groups={[]}
        totalFiles={5}
        mode="exact"
        onReset={onReset}
      />,
    )

    fireEvent.click(screen.getByText('Новый поиск'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('renders duplicate groups when present', () => {
    const groups = [makeGroup(2, 'hash1')]

    render(
      <DuplicateResults
        groups={groups}
        totalFiles={5}
        mode="exact"
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText(/Группа #1/)).toBeInTheDocument()
  })
})
