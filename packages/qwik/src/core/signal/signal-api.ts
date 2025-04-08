import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { SignalImpl } from './impl/signal-impl';
import {
  ComputedSignalImpl,
  SerializerSignalImpl,
  throwIfQRLNotResolved,
  type SerializerArg,
} from './signal';
import type { Signal } from './signal.public';

/** @internal */
export const createSignal = <T>(value?: T): Signal<T> => {
  return new SignalImpl(null, value as T) as Signal<T>;
};

/** @internal */
export const createComputedSignal = <T>(qrl: QRL<() => T>): ComputedSignalImpl<T> => {
  throwIfQRLNotResolved(qrl);
  return new ComputedSignalImpl<T>(null, qrl as QRLInternal<() => T>);
};

/** @internal */
export const createSerializerSignal = <T, S>(
  arg: QRL<{
    serialize: (data: S | undefined) => T;
    deserialize: (data: T) => S;
    initial?: S;
  }>
) => {
  throwIfQRLNotResolved(arg);
  return new SerializerSignalImpl<T, S>(null, arg as any as QRLInternal<SerializerArg<T, S>>);
};
