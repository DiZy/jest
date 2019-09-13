test('inline snapshots', () =>
  expect({apple: 'original value'}).toMatchInlineSnapshot(`
    Object {
      "apple": "original value",
    }
  `));
