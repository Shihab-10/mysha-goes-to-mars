import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from '../src/App'

describe('project foundation smoke test', () => {
  it('renders the development foundation status screen', () => {
    render(createElement(App))

    expect(screen.getByRole('heading', { name: 'MYSHA GOES TO MARS' })).toBeInTheDocument()
    expect(screen.getByText('Cinematic 3D Mars Adventure')).toBeInTheDocument()
    expect(screen.getByText('Development Foundation — Phase 0')).toBeInTheDocument()
  })
})
