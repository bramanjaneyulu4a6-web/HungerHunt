import { describe, expect, test } from 'vitest';
import { cloudinaryTile } from './cloudinaryTile.js';

const UPLOADED = 'https://res.cloudinary.com/demo/image/upload/v1690000000/products/juice.jpg';

describe('sizing a Cloudinary product tile', () => {
  test('requests one fixed canvas that keeps the whole product visible', () => {
    expect(cloudinaryTile(UPLOADED)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_pad,b_rgb:f1eae0,w_640,h_480/v1690000000/products/juice.jpg'
    );
  });

  test('replaces stored delivery options instead of stacking transformations', () => {
    const transformed = UPLOADED.replace('/upload/', '/upload/f_auto,q_auto/');
    expect(cloudinaryTile(transformed, 320, 480)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_pad,b_rgb:f1eae0,w_320,h_480/v1690000000/products/juice.jpg'
    );
  });

  test('leaves local and non-Cloudinary images unchanged', () => {
    expect(cloudinaryTile('/Logo.jpeg')).toBe('/Logo.jpeg');
    expect(cloudinaryTile('https://example.com/juice.jpg')).toBe('https://example.com/juice.jpg');
  });
});
