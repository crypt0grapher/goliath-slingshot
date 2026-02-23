/**
 * Minimal renderHook utility for testing React hooks without @testing-library/react-hooks.
 *
 * This project uses React 17 and does not have @testing-library/react installed,
 * so we provide a lightweight alternative using react-dom and react-dom/test-utils.
 */
import React, { useRef } from 'react';
import ReactDOM from 'react-dom';
import { act as reactAct } from 'react-dom/test-utils';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import migrationReducer from 'state/migration/slice';

// Re-export act from react-dom/test-utils
export const act = reactAct;

/**
 * Creates a minimal Redux store containing only the migration slice.
 * This is sufficient for hooks that dispatch migration actions.
 */
function createTestStore() {
  return configureStore({
    reducer: {
      migration: migrationReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
}

interface RenderHookResult<T> {
  result: { current: T };
  unmount: () => void;
  rerender: (newProps?: any) => void;
  dispatchSpy: jest.Mock;
}

/**
 * Renders a hook inside a minimal React tree with a Redux Provider.
 *
 * Returns an object with:
 * - result.current: the hook's return value (updated on each render)
 * - unmount(): unmount the test component
 * - rerender(newProps): re-render with new props
 * - dispatchSpy: jest mock that intercepts all dispatched actions
 */
export function renderHook<T>(
  hookFn: (props?: any) => T,
  options?: { initialProps?: any }
): RenderHookResult<T> {
  const store = createTestStore();
  const dispatchSpy = jest.fn();

  // Wrap store.dispatch to spy on all dispatches
  const originalDispatch = store.dispatch.bind(store);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (store as any).dispatch = (action: any) => {
    dispatchSpy(action);
    return originalDispatch(action);
  };

  const resultRef: { current: T } = { current: undefined as any };
  let currentProps = options?.initialProps;

  const container = document.createElement('div');
  document.body.appendChild(container);

  function TestComponent({ hookProps }: { hookProps?: any }) {
    const hookResult = hookProps !== undefined ? hookFn(hookProps) : hookFn();
    // Use a ref to avoid re-rendering the test component when we read the result
    const ref = useRef(hookResult);
    ref.current = hookResult;
    resultRef.current = hookResult;
    return null;
  }

  function renderComponent(props?: any) {
    reactAct(() => {
      ReactDOM.render(
        <Provider store={store}>
          <TestComponent hookProps={props} />
        </Provider>,
        container
      );
    });
  }

  renderComponent(currentProps);

  return {
    result: resultRef,
    unmount: () => {
      reactAct(() => {
        ReactDOM.unmountComponentAtNode(container);
      });
      document.body.removeChild(container);
    },
    rerender: (newProps?: any) => {
      currentProps = newProps;
      renderComponent(newProps);
    },
    dispatchSpy,
  };
}
