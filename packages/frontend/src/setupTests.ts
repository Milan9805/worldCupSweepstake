import '@testing-library/jest-dom';

// jsdom doesn't implement ResizeObserver, which KnockoutTree uses to keep its
// bracket connector lines aligned when card sizes change — stub it for tests.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
