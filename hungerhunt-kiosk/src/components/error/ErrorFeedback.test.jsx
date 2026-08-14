import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BalanceMeter, ErrorFeedback, InlineFieldError, StockMeter } from './ErrorFeedback';
import KioskResultScreen from '../KioskResultScreen';

const renderUI = (node) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('error feedback components', () => {
  test('announces useful copy and keeps the retry action operable', () => {
    const retry = vi.fn();
    renderUI(<ErrorFeedback issue={{ presentation: 'connection', title: 'Can’t reach HungerHunt', message: 'Check the connection.' }} action={{ label: 'Try again', onClick: retry }} />);

    expect(screen.getByRole('status').textContent).toContain('Can’t reach HungerHunt');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test('balance and stock visuals also expose the values as text', () => {
    renderUI(<><BalanceMeter available={180} required={240} /><StockMeter available={2} requested={4} /></>);
    expect(screen.getByText('₹60 short')).toBeTruthy();
    expect(screen.getByText('Only 2 left')).toBeTruthy();
    expect(screen.getByLabelText(/₹180.*₹240/)).toBeTruthy();
  });

  test('inline errors use alert semantics', () => {
    renderUI(<InlineFieldError>Enter four digits.</InlineFieldError>);
    expect(screen.getByRole('alert').textContent).toContain('Enter four digits.');
  });

  test('active orders show a friendly status and a delivery date without a time', () => {
    renderUI(
      <KioskResultScreen
        variant="active-order"
        mark="⏳"
        kicker="Order in progress"
        title="Your order is in progress"
        body="Your order is being prepared."
        orderStatus="PACKED"
        estimatedDeliveryDate="2026-08-16T10:00:00.000Z"
        onDone={() => {}}
      />
    );

    expect(screen.getByText('Packed')).toBeTruthy();
    expect(screen.getByText('16 August 2026')).toBeTruthy();
    expect(screen.queryByText(/10:00/)).toBeNull();
  });
});
