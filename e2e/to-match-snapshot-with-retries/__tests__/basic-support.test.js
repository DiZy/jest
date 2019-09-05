
    let index = 0;
    afterEach(() => {
      index += 1;
    });
    jest.retryTimes(1);
    test('snapshots', () => expect(3).toMatchSnapshot());
  