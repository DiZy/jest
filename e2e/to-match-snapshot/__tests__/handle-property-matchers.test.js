test('handles property matchers', () => {
      expect({createdAt: "string"}).toMatchSnapshot({createdAt: expect.any(Date)});
    });
    