/**
 * Test fixture: the end of a native-driven animation as the device reports it. On the device the native animated
 * module runs the animation and, at its end, hands JavaScript the value it ended at, so what JavaScript draws next
 * starts there. React Native's test stand-in for that module ends an animation 16 ms after its start without a value,
 * so a view moved by it would stay drawn where it started. With this, an animation that runs to its end reports its
 * target; a stopped one reports nothing (the device would report where it stood, which no test runs to). The motion
 * in between, and a value JavaScript sets on a native-driven node (a drag taking over), reach only the native side, as
 * on the device. Used by the screen tests of the Befehlspad, whose snap runs on the native driver.
 */

import { NativeModules } from 'react-native';

type NativeAnimationEnd = (result: { finished: boolean; value?: number }) => void;

/** Call it in `beforeEach`, so every test has it whatever the test before restored or reset. */
export function nativeAnimationsReportTheirEnd(): void {
  const animated = NativeModules.NativeAnimatedModule;
  const running = new Set<number>();
  animated.startAnimatingNode.mockImplementation(
    (id: number, _nodeTag: number, config: { toValue?: number }, end: NativeAnimationEnd) => {
      running.add(id);
      setTimeout(() => {
        if (running.delete(id)) end({ finished: true, value: config.toValue });
      }, 16);
    },
  );
  animated.stopAnimation.mockImplementation((id: number) => {
    running.delete(id);
  });
}
