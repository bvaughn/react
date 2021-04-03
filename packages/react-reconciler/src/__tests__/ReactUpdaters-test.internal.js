/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let React;
let ReactFeatureFlags;
let ReactDOM;
let ReactTestUtils;
let Scheduler;
let mockDevToolsHook;
let allSchedulerTags;
let allSchedulerTypes;
let onCommitRootShouldYield;

describe('updaters', () => {
  beforeEach(() => {
    jest.resetModules();

    allSchedulerTags = [];
    allSchedulerTypes = [];

    onCommitRootShouldYield = true;

    ReactFeatureFlags = require('shared/ReactFeatureFlags');
    ReactFeatureFlags.enableUpdaterTracking = true;
    ReactFeatureFlags.debugRenderPhaseSideEffectsForStrictMode = false;

    mockDevToolsHook = {
      injectInternals: jest.fn(() => {}),
      isDevToolsPresent: true,
      onCommitRoot: jest.fn(fiberRoot => {
        if (onCommitRootShouldYield) {
          Scheduler.unstable_yieldValue('onCommitRoot');
        }
        const schedulerTags = [];
        const schedulerTypes = [];
        fiberRoot.memoizedUpdaters.forEach(fiber => {
          schedulerTags.push(fiber.tag);
          schedulerTypes.push(fiber.elementType);
        });
        allSchedulerTags.push(schedulerTags);
        allSchedulerTypes.push(schedulerTypes);
      }),
      onCommitUnmount: jest.fn(() => {}),
      onScheduleRoot: jest.fn(() => {}),
    };

    jest.mock(
      'react-reconciler/src/ReactFiberDevToolsHook.old',
      () => mockDevToolsHook,
    );
    jest.mock(
      'react-reconciler/src/ReactFiberDevToolsHook.new',
      () => mockDevToolsHook,
    );

    React = require('react');
    ReactDOM = require('react-dom');
    ReactTestUtils = require('react-dom/test-utils');
    Scheduler = require('scheduler');
  });

  it('should report the (host) root as the scheduler for root-level render', async () => {
    const {HostRoot} = require('react-reconciler/src/ReactWorkTags');

    const Parent = () => <Child />;
    const Child = () => null;
    const container = document.createElement('div');

    await ReactTestUtils.act(async () => {
      ReactDOM.render(<Parent />, container);
    });
    expect(allSchedulerTags).toHaveLength(1);
    expect(allSchedulerTags[0]).toHaveLength(1);
    expect(allSchedulerTags[0]).toContain(HostRoot);

    await ReactTestUtils.act(async () => {
      ReactDOM.render(<Parent />, container);
    });
    expect(allSchedulerTags).toHaveLength(2);
    expect(allSchedulerTags[1]).toHaveLength(1);
    expect(allSchedulerTags[1]).toContain(HostRoot);
  });

  it('should report a function component as the scheduler for a hooks update', async () => {
    let scheduleForA = null;
    let scheduleForB = null;

    const Parent = () => (
      <React.Fragment>
        <SchedulingComponentA />
        <SchedulingComponentB />
      </React.Fragment>
    );
    const SchedulingComponentA = () => {
      const [count, setCount] = React.useState(0);
      scheduleForA = () => setCount(prevCount => prevCount + 1);
      return <Child count={count} />;
    };
    const SchedulingComponentB = () => {
      const [count, setCount] = React.useState(0);
      scheduleForB = () => setCount(prevCount => prevCount + 1);
      return <Child count={count} />;
    };
    const Child = () => null;

    await ReactTestUtils.act(async () => {
      ReactDOM.render(<Parent />, document.createElement('div'));
    });
    expect(scheduleForA).not.toBeNull();
    expect(scheduleForB).not.toBeNull();
    expect(allSchedulerTypes).toHaveLength(1);

    await ReactTestUtils.act(async () => {
      scheduleForA();
    });
    expect(allSchedulerTypes).toHaveLength(2);
    expect(allSchedulerTypes[1]).toHaveLength(1);
    expect(allSchedulerTypes[1]).toContain(SchedulingComponentA);

    await ReactTestUtils.act(async () => {
      scheduleForB();
    });
    expect(allSchedulerTypes).toHaveLength(3);
    expect(allSchedulerTypes[2]).toHaveLength(1);
    expect(allSchedulerTypes[2]).toContain(SchedulingComponentB);
  });

  it('should report a class component as the scheduler for a setState update', async () => {
    const Parent = () => <SchedulingComponent />;
    class SchedulingComponent extends React.Component {
      state = {};
      render() {
        instance = this;
        return <Child />;
      }
    }
    const Child = () => null;
    let instance;
    await ReactTestUtils.act(async () => {
      ReactDOM.render(<Parent />, document.createElement('div'));
    });
    expect(allSchedulerTypes).toHaveLength(1);

    expect(instance).not.toBeNull();
    await ReactTestUtils.act(async () => {
      instance.setState({});
    });
    expect(allSchedulerTypes).toHaveLength(2);
    expect(allSchedulerTypes[1]).toHaveLength(1);
    expect(allSchedulerTypes[1]).toContain(SchedulingComponent);
  });

  // @gate experimental
  it('should cover cascading updates', async () => {
    let triggerActiveCascade = null;
    let triggerPassiveCascade = null;

    const Parent = () => <SchedulingComponent />;
    const SchedulingComponent = () => {
      const [cascade, setCascade] = React.useState(null);
      triggerActiveCascade = () => setCascade('active');
      triggerPassiveCascade = () => setCascade('passive');
      return <CascadingChild cascade={cascade} />;
    };
    const CascadingChild = ({cascade}) => {
      const [count, setCount] = React.useState(0);
      Scheduler.unstable_yieldValue(`CascadingChild ${count}`);
      React.useLayoutEffect(() => {
        if (cascade === 'active') {
          setCount(prevCount => prevCount + 1);
        }
        return () => {};
      }, [cascade]);
      React.useEffect(() => {
        if (cascade === 'passive') {
          setCount(prevCount => prevCount + 1);
        }
        return () => {};
      }, [cascade]);
      return count;
    };

    const root = ReactDOM.unstable_createRoot(document.createElement('div'));
    await ReactTestUtils.act(async () => {
      root.render(<Parent />);
      expect(Scheduler).toFlushAndYieldThrough([
        'CascadingChild 0',
        'onCommitRoot',
      ]);
    });
    expect(triggerActiveCascade).not.toBeNull();
    expect(triggerPassiveCascade).not.toBeNull();
    expect(allSchedulerTypes).toHaveLength(1);

    await ReactTestUtils.act(async () => {
      triggerActiveCascade();
      expect(Scheduler).toFlushAndYieldThrough([
        'CascadingChild 0',
        'onCommitRoot',
        'CascadingChild 1',
        'onCommitRoot',
      ]);
    });
    expect(allSchedulerTypes).toHaveLength(3);
    expect(allSchedulerTypes[1]).toHaveLength(1);
    expect(allSchedulerTypes[1]).toContain(SchedulingComponent);
    expect(allSchedulerTypes[2]).toHaveLength(1);
    expect(allSchedulerTypes[2]).toContain(CascadingChild);

    await ReactTestUtils.act(async () => {
      triggerPassiveCascade();
      expect(Scheduler).toFlushAndYieldThrough([
        'CascadingChild 1',
        'onCommitRoot',
        'CascadingChild 2',
        'onCommitRoot',
      ]);
    });
    expect(allSchedulerTypes).toHaveLength(5);
    expect(allSchedulerTypes[3]).toHaveLength(1);
    expect(allSchedulerTypes[3]).toContain(SchedulingComponent);
    expect(allSchedulerTypes[4]).toHaveLength(1);
    expect(allSchedulerTypes[4]).toContain(CascadingChild);

    // Verify no outstanding flushes
    Scheduler.unstable_flushAll();
  });

  it('should cover suspense pings', async done => {
    let data = null;
    let resolver = null;
    let promise = null;
    const fakeCacheRead = () => {
      if (data === null) {
        promise = new Promise(resolve => {
          resolver = resolvedData => {
            data = resolvedData;
            resolve(resolvedData);
          };
        });
        throw promise;
      } else {
        return data;
      }
    };
    const Parent = () => (
      <React.Suspense fallback={<Fallback />}>
        <Suspender />
      </React.Suspense>
    );
    const Fallback = () => null;
    let setShouldSuspend = null;
    const Suspender = ({suspend}) => {
      const tuple = React.useState(false);
      setShouldSuspend = tuple[1];
      if (tuple[0] === true) {
        return fakeCacheRead();
      } else {
        return null;
      }
    };

    await ReactTestUtils.act(async () => {
      ReactDOM.render(<Parent />, document.createElement('div'));
      expect(Scheduler).toHaveYielded(['onCommitRoot']);
    });
    expect(setShouldSuspend).not.toBeNull();
    expect(allSchedulerTypes).toHaveLength(1);

    await ReactTestUtils.act(async () => {
      setShouldSuspend(true);
    });
    expect(Scheduler).toHaveYielded(['onCommitRoot']);
    expect(allSchedulerTypes).toHaveLength(2);
    expect(allSchedulerTypes[1]).toHaveLength(1);
    expect(allSchedulerTypes[1]).toContain(Suspender);

    expect(resolver).not.toBeNull();
    await ReactTestUtils.act(() => {
      resolver('abc');
      return promise;
    });
    expect(Scheduler).toHaveYielded(['onCommitRoot']);
    expect(allSchedulerTypes).toHaveLength(3);
    expect(allSchedulerTypes[2]).toHaveLength(1);
    expect(allSchedulerTypes[2]).toContain(Suspender);

    // Verify no outstanding flushes
    Scheduler.unstable_flushAll();

    done();
  });

  // @gate experimental
  it('traces interaction through hidden subtree', async () => {
    const {HostRoot} = require('react-reconciler/src/ReactWorkTags');

    // Note: This is based on a similar component we use in www. We can delete once
    // the extra div wrapper is no longer necessary.
    function LegacyHiddenDiv({children, mode}) {
      return (
        <div hidden={mode === 'hidden'}>
          <React.unstable_LegacyHidden
            mode={mode === 'hidden' ? 'unstable-defer-without-hiding' : mode}>
            {children}
          </React.unstable_LegacyHidden>
        </div>
      );
    }

    const Child = () => {
      const [didMount, setDidMount] = React.useState(false);
      Scheduler.unstable_yieldValue('Child');
      React.useEffect(() => {
        if (didMount) {
          Scheduler.unstable_yieldValue('Child:update');
        } else {
          Scheduler.unstable_yieldValue('Child:mount');
          setDidMount(true);
        }
      }, [didMount]);
      return <div />;
    };

    const App = () => {
      Scheduler.unstable_yieldValue('App');
      React.useEffect(() => {
        Scheduler.unstable_yieldValue('App:mount');
      }, []);
      return (
        <LegacyHiddenDiv mode="hidden">
          <Child />
        </LegacyHiddenDiv>
      );
    };

    const container = document.createElement('div');
    const root = ReactDOM.createRoot(container);
    await ReactTestUtils.act(async () => {
      root.render(<App />);
    });

    // TODO: There are 4 commits here instead of 3
    // because this update was scheduled at idle priority,
    // and idle updates are slightly higher priority than offscreen work.
    // So it takes two render passes to finish it.
    // The onCommit hook is called even after the no-op bailout update.
    expect(Scheduler).toHaveYielded([
      'App',
      'onCommitRoot',
      'App:mount',

      'Child',
      'onCommitRoot',
      'Child:mount',

      'onCommitRoot',

      'Child',
      'onCommitRoot',
      'Child:update',
    ]);
    // Initial render
    expect(allSchedulerTypes).toHaveLength(4);
    expect(allSchedulerTags[0]).toHaveLength(1);
    expect(allSchedulerTags[0]).toContain(HostRoot);
    // Offscreen update
    expect(allSchedulerTypes[1]).toHaveLength(0);
    // Child passive effect
    expect(allSchedulerTypes[2]).toHaveLength(1);
    expect(allSchedulerTypes[2]).toContain(Child);
    // Offscreen update
    expect(allSchedulerTypes[3]).toHaveLength(0);
  });

  // @gate experimental
  it('should cover error handling', async () => {
    let triggerError = null;

    const Parent = () => {
      const [shouldError, setShouldError] = React.useState(false);
      triggerError = () => setShouldError(true);
      return shouldError ? (
        <ErrorBoundary>
          <BrokenRender />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary>
          <Yield value="initial" />
        </ErrorBoundary>
      );
    };
    class ErrorBoundary extends React.Component {
      state = {error: null};
      componentDidCatch(error) {
        this.setState({error});
      }
      render() {
        if (this.state.error) {
          return <Yield value="error" />;
        }
        return this.props.children;
      }
    }
    const Yield = ({value}) => {
      Scheduler.unstable_yieldValue(value);
      return null;
    };
    const BrokenRender = () => {
      throw new Error('Hello');
    };

    const root = ReactDOM.unstable_createRoot(document.createElement('div'));
    await ReactTestUtils.act(async () => {
      root.render(<Parent shouldError={false} />);
    });
    expect(Scheduler).toHaveYielded(['initial', 'onCommitRoot']);
    expect(triggerError).not.toBeNull();

    allSchedulerTypes.splice(0);
    onCommitRootShouldYield = true;

    await ReactTestUtils.act(async () => {
      triggerError();
    });
    expect(Scheduler).toHaveYielded(['onCommitRoot', 'error', 'onCommitRoot']);
    expect(allSchedulerTypes).toHaveLength(2);
    expect(allSchedulerTypes[0]).toHaveLength(1);
    expect(allSchedulerTypes[0]).toContain(Parent);
    expect(allSchedulerTypes[1]).toHaveLength(1);
    expect(allSchedulerTypes[1]).toContain(ErrorBoundary);

    // Verify no outstanding flushes
    Scheduler.unstable_flushAll();
  });

  // @gate experimental
  it('should distinguish between updaters in the case of interleaved work', async () => {
    let triggerLowPriorityUpdate = null;
    let triggerSyncPriorityUpdate = null;

    const HighPriorityUpdater = () => {
      const [count, setCount] = React.useState(0);
      triggerSyncPriorityUpdate = () => setCount(prevCount => prevCount + 1);
      Scheduler.unstable_yieldValue(`HighPriorityUpdater ${count}`);
      return <Yield value={`HighPriority ${count}`} />;
    };
    const LowPriorityUpdater = () => {
      const [count, setCount] = React.useState(0);
      triggerLowPriorityUpdate = () => setCount(prevCount => prevCount + 1);
      Scheduler.unstable_yieldValue(`LowPriorityUpdater ${count}`);
      return <Yield value={`LowPriority ${count}`} />;
    };
    const Yield = ({value}) => {
      Scheduler.unstable_yieldValue(`Yield ${value}`);
      return null;
    };

    const root = ReactDOM.unstable_createRoot(document.createElement('div'));
    ReactTestUtils.act(() => {
      root.render(
        <React.Fragment>
          <HighPriorityUpdater />
          <LowPriorityUpdater />
        </React.Fragment>,
      );
      expect(Scheduler).toFlushAndYieldThrough([
        'HighPriorityUpdater 0',
        'Yield HighPriority 0',
        'LowPriorityUpdater 0',
        'Yield LowPriority 0',
        'onCommitRoot',
      ]);
    });
    expect(triggerLowPriorityUpdate).not.toBeNull();
    expect(triggerSyncPriorityUpdate).not.toBeNull();
    expect(allSchedulerTypes).toHaveLength(1);

    // Render a partially update, but don't finish.
    ReactTestUtils.act(() => {
      triggerLowPriorityUpdate();
      expect(Scheduler).toFlushAndYieldThrough(['LowPriorityUpdater 1']);
      expect(allSchedulerTypes).toHaveLength(1);

      // Interrupt with higher priority work.
      ReactDOM.flushSync(triggerSyncPriorityUpdate);
      expect(Scheduler).toHaveYielded([
        'HighPriorityUpdater 1',
        'Yield HighPriority 1',
        'onCommitRoot',
      ]);
      expect(allSchedulerTypes).toHaveLength(2);
      expect(allSchedulerTypes[1]).toHaveLength(1);
      expect(allSchedulerTypes[1]).toContain(HighPriorityUpdater);

      // Finish the initial partial update
      triggerLowPriorityUpdate();
      expect(Scheduler).toFlushAndYieldThrough([
        'LowPriorityUpdater 2',
        'Yield LowPriority 2',
        'onCommitRoot',
      ]);
    });
    expect(allSchedulerTypes).toHaveLength(3);
    expect(allSchedulerTypes[2]).toHaveLength(1);
    expect(allSchedulerTypes[2]).toContain(LowPriorityUpdater);

    // Verify no outstanding flushes
    Scheduler.unstable_flushAll();
  });

  // @gate experimental
  it('should not lose track of updaters if work yields before finishing', async () => {
    const {HostRoot} = require('react-reconciler/src/ReactWorkTags');

    const Yield = ({renderTime}) => {
      Scheduler.unstable_advanceTime(renderTime);
      Scheduler.unstable_yieldValue('Yield:' + renderTime);
      return null;
    };

    let first;
    class FirstComponent extends React.Component {
      state = {renderTime: 1};
      render() {
        first = this;
        Scheduler.unstable_advanceTime(this.state.renderTime);
        Scheduler.unstable_yieldValue(
          'FirstComponent:' + this.state.renderTime,
        );
        return <Yield renderTime={4} />;
      }
    }
    let second;
    class SecondComponent extends React.Component {
      state = {renderTime: 2};
      render() {
        second = this;
        Scheduler.unstable_advanceTime(this.state.renderTime);
        Scheduler.unstable_yieldValue(
          'SecondComponent:' + this.state.renderTime,
        );
        return <Yield renderTime={7} />;
      }
    }

    Scheduler.unstable_advanceTime(5); // 0 -> 5

    const root = ReactDOM.unstable_createRoot(document.createElement('div'));
    root.render(
      <React.Fragment>
        <FirstComponent />
        <SecondComponent />
      </React.Fragment>,
    );

    // Render everything initially.
    expect(Scheduler).toFlushAndYield([
      'FirstComponent:1',
      'Yield:4',
      'SecondComponent:2',
      'Yield:7',
      'onCommitRoot',
    ]);
    expect(allSchedulerTags).toHaveLength(1);
    expect(allSchedulerTags[0]).toHaveLength(1);
    expect(allSchedulerTags[0]).toContain(HostRoot);

    // Render a partial update, but don't finish.
    first.setState({renderTime: 10});
    expect(Scheduler).toFlushAndYieldThrough(['FirstComponent:10']);
    expect(allSchedulerTypes).toHaveLength(1);

    // Interrupt with higher priority work.
    ReactDOM.flushSync(() => second.setState({renderTime: 30}));
    expect(Scheduler).toHaveYielded([
      'SecondComponent:30',
      'Yield:7',
      'onCommitRoot',
    ]);
    expect(allSchedulerTypes).toHaveLength(2);
    expect(allSchedulerTypes[1]).toHaveLength(1);
    expect(allSchedulerTypes[1]).toContain(SecondComponent);

    // Resume the original low priority update.
    expect(Scheduler).toFlushAndYield([
      'FirstComponent:10',
      'Yield:4',
      'onCommitRoot',
    ]);
    expect(allSchedulerTypes).toHaveLength(3);
    expect(allSchedulerTypes[2]).toHaveLength(1);
    expect(allSchedulerTypes[2]).toContain(FirstComponent);
  });
});
