/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {
  completeContext,
  getCurrentContext,
  restoreContext,
  trackContext,
  wrapForCurrentContext,
} from './InteractionZone';

// TODO This package will likely want to override browser APIs (e.g. setTimeout, fetch)
// So that async callbacks are automatically wrapped with the current tracked event info.
// For the initial iteration, async callbacks must be explicitely wrapped with wrap().

type Interactions = Array<Interaction>;

export type Interaction = {|
  name: string,
  timestamp: number,
|};

// Normally we would use the current renderer HostConfig's "now" method,
// But since interaction-tracking will be a separate package,
// I instead just copied the approach used by ReactScheduler.
let now;
if (typeof performance === 'object' && typeof performance.now === 'function') {
  const localPerformance = performance;
  now = function() {
    return localPerformance.now();
  };
} else {
  const localDate = Date;
  now = function() {
    return localDate.now();
  };
}

export function getCurrentEvents(): Interactions | null {
  if (!__PROFILE__) {
    return null;
  } else {
    return getCurrentContext();
  }
}

export function startContinuation(
  interactions: Interactions | null,
): Interactions | null {
  return restoreContext(interactions);
}

export function stopContinuation(interactions: Interactions | null): void {
  completeContext(interactions);
}

export function track(name: string, callback: Function): void {
  if (!__PROFILE__) {
    callback();
    return;
  }

  const interaction: Interaction = {
    name,
    timestamp: now(),
  };

  // Tracked interactions should stack.
  // To do that, create a new zone with a concatenated (cloned) array.
  let interactions: Interactions | null = getCurrentContext();
  if (interactions === null) {
    interactions = [interaction];
  } else {
    interactions = interactions.concat(interaction);
  }

  trackContext(interactions, callback);
}

export function wrap(callback: Function): Function {
  if (!__PROFILE__) {
    return callback;
  }

  return wrapForCurrentContext(callback);
}
