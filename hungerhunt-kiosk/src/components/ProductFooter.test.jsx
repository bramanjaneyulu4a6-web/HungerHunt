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

    expect(screen.getByRole('dialog', { name: 'Anand Kamma' })).toBeTruthy();
    expect(screen.getByText('HungerHunt – Head of Operations')).toBeTruthy();
    expect(screen.getByRole('link', { name: '6304519244' }).getAttribute('href'))
      .toBe('tel:+916304519244');
    expect(screen.getByRole('link', { name: 'dev.kamma04@gmail.com' }).getAttribute('href'))
      .toBe('mailto:dev.kamma04@gmail.com');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
