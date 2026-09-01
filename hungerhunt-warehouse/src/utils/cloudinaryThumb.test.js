import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { cloudinaryThumb } from './cloudinaryThumb.js';

const UPLOADED =
  'https://res.cloudinary.com/demo/image/upload/v1690000000/products/juice.jpg';

describe('sizing a Cloudinary image for delivery', () => {
  test('inserts format, quality and width after the upload segment', () => {
    assert.equal(
      cloudinaryThumb(UPLOADED, 144),
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_144/v1690000000/products/juice.jpg'
    );
  });

  test('defaults to 144 pixels wide', () => {
    assert.match(cloudinaryThumb(UPLOADED), /w_144\//);
  });

  test('leaves a non-Cloudinary URL alone', () => {
    assert.equal(cloudinaryThumb('https://example.com/juice.jpg', 144), 'https://example.com/juice.jpg');
  });

  test('leaves empty and missing values alone', () => {
    assert.equal(cloudinaryThumb('', 144), '');
    assert.equal(cloudinaryThumb(null, 144), null);
    assert.equal(cloudinaryThumb(undefined, 144), undefined);
  });

  test('does not transform twice', () => {
    const once = cloudinaryThumb(UPLOADED, 144);
    assert.equal(cloudinaryThumb(once, 144), once);
  });
});
