# Testing

This project uses [Jest](https://jestjs.io/) for unit testing with TypeScript support via [ts-jest](https://kulshekhar.github.io/ts-jest/).

## Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage report
yarn test:coverage
```

## Test Structure

Tests are located in `__tests__` directories next to the source files they test, following the pattern:
- `src/lib/__tests__/errors.test.ts` - Tests for error classes
- `src/lib/__tests__/dingzLogHelper.test.ts` - Tests for logging helper

## Writing Tests

Test files should:
- Use the `.test.ts` or `.spec.ts` extension
- Be placed in a `__tests__` directory near the source files
- Use Jest's mocking capabilities for external dependencies
- Follow the Arrange-Act-Assert pattern

Example:
```typescript
describe('MyClass', () => {
  it('should do something', () => {
    // Arrange
    const instance = new MyClass();
    
    // Act
    const result = instance.doSomething();
    
    // Assert
    expect(result).toBe(expected);
  });
});
```

## Coverage

Coverage reports are generated in the `coverage/` directory and include:
- HTML report: `coverage/lcov-report/index.html`
- LCOV format for CI integration
- Text summary in console output

The goal is to maintain high test coverage for utility functions and business logic.
