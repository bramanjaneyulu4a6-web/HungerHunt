import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import ProductFooter from './ProductFooter';

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('ProductFooter', () => {
  test('opens the company contact information and closes it with Escape', () => {
    render(<ProductFooter />);

    expect(screen.getByText('A product of GRAARR Management Services Pvt. Ltd.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Contact Us' }));

    expect(screen.getByRole('dialog', { name: 'Stephen B' })).toBeTruthy();
    expect(screen.getByText('HungerHunt – Head of Operations')).toBeTruthy();
    expect(screen.getByRole('link', { name: '9160161816' }).getAttribute('href'))
      .toBe('tel:+919160161816');
    expect(screen.getByRole('link', { name: 'bramanjaneyulu4a6@gmail.com' }).getAttribute('href'))
      .toBe('mailto:bramanjaneyulu4a6@gmail.com');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
